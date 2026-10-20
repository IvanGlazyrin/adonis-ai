import type { ToolSet } from 'ai';
import { CostTracker } from './budget/cost_tracker.js';
import { ConfirmationService } from './guard/confirmation.js';
import { ToolRegistry } from './guard/registry.js';
import { CircuitBreaker } from './circuit_breaker.js';
import { ModelsDevSource } from './catalog/source.js';
import { AgentLoader, type AgentPromptConfig } from './agents/loader.js';
import { AgentRunner, type AgentRunnerOptions } from './agents/agent_runner.js';
import type { AiConfig, AiDriver, GenerateObjectOptions, GenerateObjectResult, GenerateTextOptions, GenerateTextResult, StreamTextOptions, StreamTextResult } from './types.js';
export interface LoggerContract {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug?(message: string, ...args: unknown[]): void;
}
/**
 * Central AI Manager for AdonisJS 7 (analog of Laravel AI / Prism).
 * Orchestrates multi-provider drivers, models.dev catalog discovery, ACP agents,
 * declarative skills & agent runners, cascading failover, circuit breaker resilience,
 * token budget accounting, and guarded tool execution.
 */
export declare class AiManager {
    private config;
    private logger?;
    private circuitBreaker;
    private costTracker;
    private toolRegistry;
    private confirmation;
    private catalog;
    private agentLoader;
    private drivers;
    private pricingWarmups;
    constructor(config: AiConfig, logger?: LoggerContract, costTracker?: CostTracker, toolRegistry?: ToolRegistry, catalog?: ModelsDevSource, agentLoader?: AgentLoader, confirmation?: ConfirmationService);
    getConfig(): AiConfig;
    getCircuitBreaker(): CircuitBreaker;
    getCostTracker(): CostTracker;
    getToolRegistry(): ToolRegistry;
    /**
     * Service that answers `ask` tool permissions and ACP agent permission requests.
     * Subscribe with `onActionCreated()` and call `approve()` / `reject()` from your UI.
     */
    getConfirmationService(): ConfirmationService;
    getCatalog(): ModelsDevSource;
    getAgentLoader(): AgentLoader;
    /**
     * Instantiates an executable AgentRunner by loading its markdown manifest and skills.
     */
    agent(name: string, options?: AgentRunnerOptions): Promise<AgentRunner>;
    /**
     * Loads all agent prompt configurations from the configured directory.
     */
    loadAgents(configsDir?: string, skillsDir?: string): Promise<Record<string, AgentPromptConfig>>;
    /**
     * Dynamically resolves a model reference string (e.g. 'openai/gpt-4o', 'claude-3-5-sonnet')
     * against the models.dev catalog.
     */
    resolveModel(modelRef: string, defaultProvider?: string): Promise<{
        providerId: string;
        modelId: string;
        entry?: import("./index.js").ModelCatalogEntry;
    }>;
    /**
     * Returns a specific driver by name, or the default driver.
     * Concurrent callers share one driver instance.
     */
    use(name?: string): Promise<AiDriver>;
    /**
     * Alias for use() matching AdonisJS convention.
     */
    driver(name?: string): Promise<AiDriver>;
    /**
     * Stops child processes (ACP agents), disposes pending confirmations and forgets drivers.
     * Call on application shutdown.
     */
    shutdown(): Promise<void>;
    /**
     * Starts loading catalog pricing for a model in the background (deduplicated).
     */
    private warmPricing;
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
    private executeWithFallback;
    /**
     * Applies tool permissions and the tool guard, and tracks whether any tool actually ran.
     * `deny` tools are dropped, `ask` tools need a human confirmation (fail-closed without one),
     * and every tool passes through `toolGuard.guard` when provided.
     */
    private prepareTools;
    private buildTextParams;
    private recordCost;
    private warnIfOverBudget;
    /**
     * Generates text using the configured LLM provider with fallback, budget accounting, and tool guard.
     */
    generateText(options: GenerateTextOptions): Promise<GenerateTextResult>;
    /**
     * Streams text from LLM. Initial provider failures (429, 5xx, network) are detected before this
     * method returns, so they trigger fallback and the HTTP layer can still send proper headers.
     * Token usage is recorded when the stream ends or is aborted.
     */
    streamText(options: StreamTextOptions): Promise<StreamTextResult>;
    /**
     * Generates a typed structured object conforming to a Zod schema
     * (via `generateText` with `Output.object`, as `generateObject` is deprecated in AI SDK v7).
     */
    generateObject<T>(options: GenerateObjectOptions<T>): Promise<GenerateObjectResult<T>>;
    /**
     * Fluent conversation builder (Laravel AI / Prism syntax style).
     */
    chat(): {
        system: (prompt: string) => /*elided*/ any;
        user: (content: string) => /*elided*/ any;
        assistant: (content: string) => /*elided*/ any;
        provider: (name: string) => /*elided*/ any;
        model: (name: string) => /*elided*/ any;
        temperature: (val: number) => /*elided*/ any;
        agent: (name: string) => /*elided*/ any;
        tools: (tools: ToolSet) => /*elided*/ any;
        generate: () => Promise<GenerateTextResult>;
        stream: () => Promise<StreamTextResult>;
    };
    /**
     * Driver factory for OpenAI, Anthropic, Google/Gemini, Groq, Ollama, ACP, and Custom providers.
     */
    private createDriver;
    private safeImport;
}
//# sourceMappingURL=ai_manager.d.ts.map