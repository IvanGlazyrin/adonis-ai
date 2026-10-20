import { generateText, streamText, stepCountIs, Output } from 'ai';
import { CostTracker } from './budget/cost_tracker.js';
import { ConfirmationService } from './guard/confirmation.js';
import { ToolRegistry } from './guard/registry.js';
import { CircuitBreaker } from './circuit_breaker.js';
import { AiException, CascadingFallbackError, ProviderConfigError, } from './errors.js';
import { classifyError } from './error_classifier.js';
import { EMPTY_USAGE, normalizeUsage, sumUsage } from './usage.js';
import { ModelsDevSource, resolveCatalogProviderId } from './catalog/source.js';
import { AgentLoader } from './agents/loader.js';
import { AgentRunner } from './agents/agent_runner.js';
const PRICING_WAIT_MS = 2_000;
function sleep(ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}
/**
 * Central AI Manager for AdonisJS 7 (analog of Laravel AI / Prism).
 * Orchestrates multi-provider drivers, models.dev catalog discovery, ACP agents,
 * declarative skills & agent runners, cascading failover, circuit breaker resilience,
 * token budget accounting, and guarded tool execution.
 */
export class AiManager {
    config;
    logger;
    circuitBreaker;
    costTracker;
    toolRegistry;
    confirmation;
    catalog;
    agentLoader;
    drivers = new Map();
    pricingWarmups = new Map();
    constructor(config, logger, costTracker, toolRegistry, catalog, agentLoader, confirmation) {
        this.config = config;
        this.logger = logger;
        this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
        this.costTracker =
            costTracker ??
                new CostTracker({
                    pricing: config.budget?.pricing,
                    logger: this.logger,
                });
        this.toolRegistry = toolRegistry ?? new ToolRegistry({ logger: this.logger });
        this.confirmation = confirmation ?? new ConfirmationService({ logger: this.logger });
        this.catalog =
            catalog ??
                new ModelsDevSource({
                    logger: this.logger,
                    cachePath: config.catalog?.cachePath,
                    overridePath: config.catalog?.overridePath,
                    ttlMs: config.catalog?.ttlMs,
                });
        this.agentLoader =
            agentLoader ??
                new AgentLoader({
                    configsDir: config.agentConfigsDir,
                    skillsDir: config.agentSkillsDir,
                    logger: this.logger,
                });
        // Setup dynamic pricing loader from models.dev catalog
        if (this.config.catalog?.autoPricing !== false) {
            this.costTracker.registerPricingLoader(async () => {
                const models = await this.catalog.listModels();
                const pricingMap = {};
                for (const m of models) {
                    if (m.pricing) {
                        pricingMap[m.id] = m.pricing;
                        pricingMap[`${m.providerId}/${m.id}`] = m.pricing;
                    }
                }
                return pricingMap;
            });
        }
    }
    getConfig() {
        return this.config;
    }
    getCircuitBreaker() {
        return this.circuitBreaker;
    }
    getCostTracker() {
        return this.costTracker;
    }
    getToolRegistry() {
        return this.toolRegistry;
    }
    /**
     * Service that answers `ask` tool permissions and ACP agent permission requests.
     * Subscribe with `onActionCreated()` and call `approve()` / `reject()` from your UI.
     */
    getConfirmationService() {
        return this.confirmation;
    }
    getCatalog() {
        return this.catalog;
    }
    getAgentLoader() {
        return this.agentLoader;
    }
    /**
     * Instantiates an executable AgentRunner by loading its markdown manifest and skills.
     */
    async agent(name, options) {
        const promptConfig = await this.agentLoader.loadAgentPrompt(name);
        return new AgentRunner(this, promptConfig, options);
    }
    /**
     * Loads all agent prompt configurations from the configured directory.
     */
    async loadAgents(configsDir, skillsDir) {
        return this.agentLoader.loadAllAgentPrompts(configsDir, skillsDir);
    }
    /**
     * Dynamically resolves a model reference string (e.g. 'openai/gpt-4o', 'claude-3-5-sonnet')
     * against the models.dev catalog.
     */
    async resolveModel(modelRef, defaultProvider) {
        return this.catalog.resolveModel(modelRef, defaultProvider ?? this.config.default);
    }
    /**
     * Returns a specific driver by name, or the default driver.
     * Concurrent callers share one driver instance.
     */
    async use(name) {
        const providerName = name ?? this.config.default;
        const existing = this.drivers.get(providerName);
        if (existing) {
            return existing;
        }
        const providerConfig = this.config.providers[providerName];
        if (!providerConfig) {
            throw new ProviderConfigError(providerName, `Provider "${providerName}" is not registered in config.`);
        }
        const pending = this.createDriver(providerName, providerConfig);
        this.drivers.set(providerName, pending);
        pending.catch(() => {
            if (this.drivers.get(providerName) === pending)
                this.drivers.delete(providerName);
        });
        return pending;
    }
    /**
     * Alias for use() matching AdonisJS convention.
     */
    async driver(name) {
        return this.use(name);
    }
    /**
     * Stops child processes (ACP agents), disposes pending confirmations and forgets drivers.
     * Call on application shutdown.
     */
    async shutdown() {
        const drivers = [...this.drivers.values()];
        this.drivers.clear();
        const settled = await Promise.allSettled(drivers);
        await Promise.allSettled(settled.map(async (entry) => {
            if (entry.status === 'fulfilled')
                await entry.value.shutdown?.();
        }));
        this.confirmation.dispose();
    }
    /**
     * Starts loading catalog pricing for a model in the background (deduplicated).
     */
    warmPricing(providerName, modelName) {
        if (this.config.catalog?.autoPricing === false)
            return Promise.resolve();
        const pConfig = this.config.providers[providerName];
        if (!pConfig || pConfig.driver === 'acp')
            return Promise.resolve();
        const key = `${providerName}/${modelName}`;
        let warmup = this.pricingWarmups.get(key);
        if (!warmup) {
            warmup = (async () => {
                try {
                    const pricing = await this.catalog.getModelPricing(resolveCatalogProviderId(pConfig.driver), modelName);
                    if (pricing) {
                        this.costTracker.setPricing({ [modelName]: pricing, [key]: pricing });
                    }
                }
                catch {
                    // Non-fatal catalog pricing lookup
                }
            })();
            this.pricingWarmups.set(key, warmup);
        }
        return warmup;
    }
    /**
     * Executes an operation with cascading fallback across the primary and explicitly configured
     * backup providers.
     *
     * - The requested model is used for the primary provider only; fallbacks use `fallbackModels`
     *   or their own `defaultModel`.
     * - Only transient failures (429, 5xx, network) fall through to the next provider; bad requests,
     *   validation errors and aborts are rethrown immediately, as are failures after tools ran.
     * - The circuit breaker is keyed by `provider:model`.
     */
    async executeWithFallback(request, operation) {
        let targetProvider = request.provider;
        let targetModel = request.model;
        // 'provider/model' syntax, but only when the prefix really is a configured provider
        if (targetModel && targetModel.includes('/') && !targetProvider) {
            const [head, ...rest] = targetModel.split('/');
            if (Object.hasOwn(this.config.providers, head)) {
                targetProvider = head;
                targetModel = rest.join('/');
            }
        }
        const primary = targetProvider ?? this.config.default;
        const cascade = [primary, ...(this.config.fallbackCascade ?? []).filter((p) => p !== primary)];
        const attempts = [];
        for (const [index, providerName] of cascade.entries()) {
            request.abortSignal?.throwIfAborted();
            const pConfig = this.config.providers[providerName];
            if (!pConfig)
                continue;
            const isPrimary = index === 0;
            const modelName = isPrimary
                ? (targetModel ?? pConfig.defaultModel ?? 'default')
                : ((this.config.fallbackModels && Object.hasOwn(this.config.fallbackModels, providerName)
                    ? this.config.fallbackModels[providerName]
                    : undefined) ??
                    pConfig.defaultModel ??
                    'default');
            const breakerKey = `${providerName}:${modelName}`;
            if (!this.circuitBreaker.isAvailable(breakerKey)) {
                this.logger?.warn?.(`[AiManager] Skipping "${breakerKey}" because circuit breaker is OPEN.`);
                attempts.push({
                    provider: providerName,
                    model: modelName,
                    error: new Error('circuit breaker is open'),
                });
                continue;
            }
            const state = { toolsExecuted: false };
            try {
                const driver = await this.use(providerName);
                const result = await this.circuitBreaker.execute(breakerKey, () => operation({ driver, modelName, providerName, state }), (err) => classifyError(err, request.abortSignal).kind === 'retryable');
                return { result, provider: providerName, model: modelName };
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                const classification = classifyError(err, request.abortSignal);
                if (classification.kind === 'fatal') {
                    throw err;
                }
                if (state.toolsExecuted) {
                    this.logger?.error?.(`[AiManager] "${breakerKey}" failed after executing tools (${error.message}); not retrying on another provider to avoid repeating side effects.`);
                    throw err;
                }
                attempts.push({ provider: providerName, model: modelName, error });
                this.logger?.warn?.(`[AiManager] "${breakerKey}" failed (${classification.reason}: ${error.message}). Attempting next fallback...`);
            }
        }
        throw new CascadingFallbackError(attempts);
    }
    /**
     * Applies tool permissions and the tool guard, and tracks whether any tool actually ran.
     * `deny` tools are dropped, `ask` tools need a human confirmation (fail-closed without one),
     * and every tool passes through `toolGuard.guard` when provided.
     */
    prepareTools(options, state) {
        const tools = options.tools;
        if (!tools || Object.keys(tools).length === 0)
            return undefined;
        const permissions = options.toolPermissions;
        const guardOptions = options.toolGuard;
        const prepared = {};
        for (const [name, tool] of Object.entries(tools)) {
            const permission = permissions && Object.hasOwn(permissions, name) ? permissions[name] : 'allow';
            if (permission === 'deny')
                continue;
            let candidate = tool;
            const original = candidate.execute?.bind(candidate);
            if (original) {
                candidate = {
                    ...candidate,
                    execute: (args, execOptions) => {
                        state.toolsExecuted = true;
                        return original(args, execOptions);
                    },
                };
            }
            if (permission === 'ask' || guardOptions?.guard) {
                candidate = this.toolRegistry.wrapTool(name, candidate, {
                    permission,
                    guard: guardOptions?.guard,
                    confirmation: guardOptions?.confirmation ?? this.confirmation,
                    sessionId: guardOptions?.sessionId,
                    timeoutMs: guardOptions?.timeoutMs,
                });
            }
            prepared[name] = candidate;
        }
        return Object.keys(prepared).length > 0 ? prepared : undefined;
    }
    buildTextParams(options, model, state, signal) {
        const maxOutputTokens = options.maxOutputTokens ?? options.maxTokens;
        const common = {
            model,
            instructions: options.system || undefined,
            temperature: options.temperature,
            topP: options.topP,
            maxOutputTokens,
            tools: this.prepareTools(options, state),
            stopWhen: options.maxSteps ? stepCountIs(options.maxSteps) : undefined,
            abortSignal: signal,
        };
        if (options.messages && options.messages.length > 0) {
            return { ...common, messages: options.messages };
        }
        if (options.prompt) {
            return { ...common, prompt: options.prompt };
        }
        throw new AiException('Either "prompt" or non-empty "messages" is required.', 'E_AI_INVALID_ARGUMENT');
    }
    async recordCost(agentName, provider, model, usage, durationMs, pricingReady, metadata) {
        await Promise.race([pricingReady, sleep(PRICING_WAIT_MS)]);
        try {
            return this.costTracker.record({
                agentName,
                model,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadTokens: usage.cacheReadTokens,
                cacheWriteTokens: usage.cacheWriteTokens,
                reasoningTokens: usage.reasoningTokens,
                totalTokens: usage.totalTokens,
                durationMs,
                metadata: { provider, ...metadata },
            });
        }
        catch {
            // Cost tracking is non-fatal
            return undefined;
        }
    }
    warnIfOverBudget(agentName, totalTokens, costUsd) {
        const budget = this.config.budget;
        if (budget?.maxTokensPerRequest && totalTokens > budget.maxTokensPerRequest) {
            this.logger?.warn?.(`[AiManager] Token limit exceeded for ${agentName}: ${totalTokens} > ${budget.maxTokensPerRequest}`);
        }
        if (costUsd !== undefined && budget?.maxCostPerRequestUsd && costUsd > budget.maxCostPerRequestUsd) {
            this.logger?.warn?.(`[AiManager] Cost limit exceeded for ${agentName}: $${costUsd} > $${budget.maxCostPerRequestUsd}`);
        }
    }
    /**
     * Generates text using the configured LLM provider with fallback, budget accounting, and tool guard.
     */
    async generateText(options) {
        const startTime = Date.now();
        const agentName = options.agentName ?? this.config.budget?.defaultAgentName ?? 'default-agent';
        const { result, provider, model } = await this.executeWithFallback(options, async ({ driver, modelName, providerName, state }) => {
            void this.warmPricing(providerName, modelName);
            const languageModel = await driver.getModel(modelName);
            return generateText(this.buildTextParams(options, languageModel, state, options.abortSignal));
        });
        const durationMs = Date.now() - startTime;
        // `totalUsage` sums every step of a tool loop; `usage` is the last step only.
        const usage = normalizeUsage(result.totalUsage ?? result.usage);
        const costUsd = await this.recordCost(agentName, provider, model, usage, durationMs, this.warmPricing(provider, model), { finishReason: result.finishReason, ...options.metadata });
        this.warnIfOverBudget(agentName, usage.totalTokens, costUsd);
        return {
            text: result.text,
            usage,
            costUsd,
            finishReason: result.finishReason ?? 'stop',
            provider,
            model,
            toolCalls: result.toolCalls,
            toolResults: result.toolResults,
            steps: result.steps,
            rawResponse: result.response,
            durationMs,
        };
    }
    /**
     * Streams text from LLM. Initial provider failures (429, 5xx, network) are detected before this
     * method returns, so they trigger fallback and the HTTP layer can still send proper headers.
     * Token usage is recorded when the stream ends or is aborted.
     */
    async streamText(options) {
        const startTime = Date.now();
        const agentName = options.agentName ?? this.config.budget?.defaultAgentName ?? 'default-agent';
        const controller = new AbortController();
        const signal = options.abortSignal
            ? AbortSignal.any([options.abortSignal, controller.signal])
            : controller.signal;
        let settleUsage = () => { };
        const usagePromise = new Promise((resolve) => {
            settleUsage = resolve;
        });
        const { result: raw, provider, model } = await this.executeWithFallback({ provider: options.provider, model: options.model, abortSignal: signal }, async ({ driver, modelName, providerName, state }) => {
            const pricingReady = this.warmPricing(providerName, modelName);
            const languageModel = await driver.getModel(modelName);
            let attemptFailed = false;
            let accounted = false;
            let streamStarted = false;
            const finish = (usage, text, finishReason) => {
                if (attemptFailed || accounted)
                    return;
                accounted = true;
                void (async () => {
                    let costUsd;
                    if (usage.totalTokens > 0) {
                        costUsd = await this.recordCost(agentName, providerName, modelName, usage, Date.now() - startTime, pricingReady, { finishReason, ...options.metadata });
                        this.warnIfOverBudget(agentName, usage.totalTokens, costUsd);
                    }
                    settleUsage(usage);
                    try {
                        options.onFinish?.({ text, usage, costUsd });
                    }
                    catch (err) {
                        this.logger?.warn?.(`[AiManager] onFinish callback failed: ${String(err)}`);
                    }
                })();
            };
            const params = this.buildTextParams(options, languageModel, state, signal);
            const stream = streamText({
                ...params,
                onChunk: ({ chunk }) => {
                    if (chunk.type === 'text-delta')
                        options.onChunk?.(chunk.text);
                },
                onError: ({ error }) => {
                    if (!streamStarted)
                        return; // surfaced through the first-part check below
                    this.logger?.warn?.(`[AiManager] Stream error on "${providerName}:${modelName}": ${String(error)}`);
                    if (classifyError(error, signal).kind === 'retryable') {
                        this.circuitBreaker.recordFailure(`${providerName}:${modelName}`, error);
                    }
                    finish(EMPTY_USAGE, '');
                },
                onEnd: (event) => finish(normalizeUsage(event.totalUsage), event.text, event.finishReason),
                onAbort: (event) => finish(sumUsage(event.steps.map((s) => s.usage)), ''),
            });
            // Wait for the first meaningful part so early provider errors reject this attempt.
            const iterator = stream.fullStream[Symbol.asyncIterator]();
            try {
                for (;;) {
                    const { value, done } = await iterator.next();
                    if (done)
                        break;
                    if (value.type === 'error')
                        throw value.error;
                    if (value.type === 'abort') {
                        throw Object.assign(new Error('Generation aborted'), { name: 'AbortError' });
                    }
                    if (value.type === 'start' || value.type === 'start-step')
                        continue;
                    break;
                }
            }
            catch (err) {
                attemptFailed = true;
                throw err;
            }
            finally {
                // Release only our peek branch; other consumers read their own tee of the stream.
                await iterator.return?.();
            }
            streamStarted = true;
            return stream;
        });
        return {
            textStream: raw.textStream,
            fullStream: raw.fullStream,
            provider,
            model,
            usage: usagePromise,
            toTextStreamResponse: (headers) => raw.toTextStreamResponse({ headers }),
            toUIMessageStreamResponse: (opts) => raw.toUIMessageStreamResponse(opts),
            toDataStreamResponse: (headers) => raw.toUIMessageStreamResponse({ headers }),
            consume: async () => {
                const text = await raw.text;
                const usage = await usagePromise;
                return {
                    text,
                    usage,
                    finishReason: (await raw.finishReason) ?? 'stop',
                    provider,
                    model,
                    durationMs: Date.now() - startTime,
                };
            },
            abort: (reason) => controller.abort(reason),
            rawStream: raw,
        };
    }
    /**
     * Generates a typed structured object conforming to a Zod schema
     * (via `generateText` with `Output.object`, as `generateObject` is deprecated in AI SDK v7).
     */
    async generateObject(options) {
        const startTime = Date.now();
        const agentName = options.agentName ?? this.config.budget?.defaultAgentName ?? 'default-agent';
        const { result, provider, model } = await this.executeWithFallback(options, async ({ driver, modelName, providerName, state }) => {
            void this.warmPricing(providerName, modelName);
            const languageModel = await driver.getModel(modelName);
            const params = this.buildTextParams(options, languageModel, state, options.abortSignal);
            return generateText({
                ...params,
                output: Output.object({
                    schema: options.schema,
                    name: options.schemaName,
                    description: options.schemaDescription,
                }),
            });
        });
        const durationMs = Date.now() - startTime;
        const usage = normalizeUsage(result.totalUsage ?? result.usage);
        const costUsd = await this.recordCost(agentName, provider, model, usage, durationMs, this.warmPricing(provider, model), { mode: 'structured_object' });
        return {
            object: result.output,
            usage,
            costUsd,
            provider,
            model,
            durationMs,
        };
    }
    /**
     * Fluent conversation builder (Laravel AI / Prism syntax style).
     */
    chat() {
        const messages = [];
        let systemPrompt;
        let providerOverride;
        let modelOverride;
        let temperatureVal;
        let agentNameVal;
        let toolsVal;
        const builder = {
            system: (prompt) => {
                systemPrompt = prompt;
                return builder;
            },
            user: (content) => {
                messages.push({ role: 'user', content });
                return builder;
            },
            assistant: (content) => {
                messages.push({ role: 'assistant', content });
                return builder;
            },
            provider: (name) => {
                providerOverride = name;
                return builder;
            },
            model: (name) => {
                modelOverride = name;
                return builder;
            },
            temperature: (val) => {
                temperatureVal = val;
                return builder;
            },
            agent: (name) => {
                agentNameVal = name;
                return builder;
            },
            tools: (tools) => {
                toolsVal = tools;
                return builder;
            },
            generate: () => this.generateText({
                system: systemPrompt,
                messages: messages,
                provider: providerOverride,
                model: modelOverride,
                temperature: temperatureVal,
                agentName: agentNameVal,
                tools: toolsVal,
            }),
            stream: () => this.streamText({
                system: systemPrompt,
                messages: messages,
                provider: providerOverride,
                model: modelOverride,
                temperature: temperatureVal,
                agentName: agentNameVal,
                tools: toolsVal,
            }),
        };
        return builder;
    }
    /**
     * Driver factory for OpenAI, Anthropic, Google/Gemini, Groq, Ollama, ACP, and Custom providers.
     */
    async createDriver(name, config) {
        switch (config.driver) {
            case 'openai': {
                const { createOpenAI } = await this.safeImport('@ai-sdk/openai', 'OpenAI driver requires package "@ai-sdk/openai"');
                const client = createOpenAI({
                    apiKey: config.apiKey ?? process.env.OPENAI_API_KEY,
                    organization: config.organization ?? process.env.OPENAI_ORG_ID,
                    baseURL: config.baseURL ?? process.env.OPENAI_BASE_URL,
                    headers: config.headers,
                });
                const defaultModel = config.defaultModel ?? 'gpt-4o';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => client(m ?? defaultModel),
                };
            }
            case 'anthropic': {
                const { createAnthropic } = await this.safeImport('@ai-sdk/anthropic', 'Anthropic driver requires package "@ai-sdk/anthropic"');
                const client = createAnthropic({
                    apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
                    baseURL: config.baseURL ?? process.env.ANTHROPIC_BASE_URL,
                    headers: config.headers,
                });
                const defaultModel = config.defaultModel ?? 'claude-3-7-sonnet-latest';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => client(m ?? defaultModel),
                };
            }
            case 'google':
            case 'gemini': {
                const { createGoogleGenerativeAI } = await this.safeImport('@ai-sdk/google', 'Google/Gemini driver requires package "@ai-sdk/google"');
                const client = createGoogleGenerativeAI({
                    apiKey: config.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
                    baseURL: config.baseURL,
                    headers: config.headers,
                });
                const defaultModel = config.defaultModel ?? 'gemini-2.5-flash';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => client(m ?? defaultModel),
                };
            }
            case 'groq': {
                const { createGroq } = await this.safeImport('@ai-sdk/groq', 'Groq driver requires package "@ai-sdk/groq"');
                const client = createGroq({
                    apiKey: config.apiKey ?? process.env.GROQ_API_KEY,
                    baseURL: config.baseURL,
                    headers: config.headers,
                });
                const defaultModel = config.defaultModel ?? 'llama-3.3-70b-versatile';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => client(m ?? defaultModel),
                };
            }
            case 'ollama': {
                const { createOpenAICompatible } = await this.safeImport('@ai-sdk/openai-compatible', 'Ollama driver requires package "@ai-sdk/openai-compatible"');
                const baseURL = config.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
                const client = createOpenAICompatible({
                    name: 'ollama',
                    baseURL,
                    headers: config.headers,
                });
                const defaultModel = config.defaultModel ?? 'llama3.2';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => client(m ?? defaultModel),
                };
            }
            case 'acp': {
                const { createAcpDriver } = await import('./acp/provider.js');
                return createAcpDriver(name, config, {
                    logger: this.logger,
                    confirmation: this.confirmation,
                });
            }
            case 'custom': {
                const customModel = await config.factory(config);
                const defaultModel = config.defaultModel ?? 'custom';
                return {
                    name,
                    defaultModel,
                    getModel: (m) => typeof customModel === 'function' ? customModel(m ?? defaultModel) : customModel,
                };
            }
            default: {
                const unsupported = config;
                throw new ProviderConfigError(name, `Unsupported driver type: "${unsupported.driver}"`);
            }
        }
    }
    async safeImport(pkgName, helpMsg) {
        try {
            return (await import(pkgName));
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            throw new AiException(`${helpMsg}. Error: ${message}`, 'E_AI_MISSING_DEPENDENCY', e);
        }
    }
}
//# sourceMappingURL=ai_manager.js.map