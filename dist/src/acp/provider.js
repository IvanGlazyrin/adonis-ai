import path from 'node:path';
import { AiException, ProviderConfigError } from '../errors.js';
import { buildAcpRuntimeConfig, buildProjectMcpServer, getAcpAgentConfig, normalizeMcpServer, } from './acp_agents.js';
/** Variables a CLI needs to run at all. Everything else is withheld unless `inheritEnv` is set. */
const SAFE_ENV_KEYS = new Set([
    'PATH',
    'PATHEXT',
    'HOME',
    'USER',
    'USERNAME',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LANGUAGE',
    'TERM',
    'COLORTERM',
    'TZ',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'PROGRAMFILES',
    'PROGRAMFILES(X86)',
    'PROGRAMDATA',
    'HOMEDRIVE',
    'HOMEPATH',
    'NUMBER_OF_PROCESSORS',
    'PROCESSOR_ARCHITECTURE',
    'OS',
].map((k) => k.toUpperCase()));
const SAFE_ENV_PREFIXES = ['LC_', 'XDG_'];
/**
 * Builds the environment for the agent process.
 *
 * `@mcpc-tech/acp-ai-provider` spawns the agent with `{ ...process.env, ...env }`, so the server's
 * secrets cannot be left out by omission. Instead every variable that is not allowlisted is
 * explicitly blanked, and only the allowlist plus `extra` (agent credentials, configured env)
 * keep real values.
 */
export function buildAgentEnv(source, extra, inheritEnv = false) {
    if (inheritEnv)
        return { ...extra };
    const env = {};
    for (const key of Object.keys(source)) {
        const upper = key.toUpperCase();
        const safe = SAFE_ENV_KEYS.has(upper) || SAFE_ENV_PREFIXES.some((p) => upper.startsWith(p));
        env[key] = safe ? (source[key] ?? '') : '';
    }
    return { ...env, ...extra };
}
export class AcpDriver {
    name;
    defaultModel;
    config;
    logger;
    confirmation;
    env;
    cachedModels = new Map();
    providers = new Set();
    permissionPolicy;
    constructor(name, config, deps = {}) {
        this.name = name;
        this.config = config;
        this.logger = deps.logger;
        this.confirmation = deps.confirmation;
        this.env = deps.env ?? process.env;
        this.defaultModel = config.agentId ?? config.defaultModel ?? 'claude-code';
        this.permissionPolicy = config.permissionPolicy ?? 'ask';
        if (this.permissionPolicy === 'allow') {
            this.logger?.warn?.(`[AcpDriver] Provider "${name}" auto-approves every agent action (permissionPolicy: 'allow').`);
        }
    }
    /**
     * Lazily loads and instantiates an AI SDK language model backed by the ACP agent.
     * `modelName` selects among the built-in agents; it is never executed as a command.
     */
    async getModel(modelName) {
        const agentId = modelName ?? this.defaultModel;
        const runtimeConfig = this.resolveRuntimeConfig(agentId);
        const cacheKey = `${runtimeConfig.command}::${runtimeConfig.cwd}`;
        let model = this.cachedModels.get(cacheKey);
        if (!model) {
            model = this.createModel(runtimeConfig);
            this.cachedModels.set(cacheKey, model);
            // Do not cache failures
            model.catch(() => this.cachedModels.delete(cacheKey));
        }
        return model;
    }
    /**
     * Tests whether the ACP agent can be resolved and its model instantiated.
     */
    async ping() {
        const startTime = Date.now();
        try {
            const runtimeConfig = this.resolveRuntimeConfig(this.defaultModel);
            this.logger?.debug?.(`[AcpDriver] Pinging ACP agent command: ${runtimeConfig.command}`);
            await this.getModel(this.defaultModel);
            return { ok: true, latencyMs: Date.now() - startTime };
        }
        catch (err) {
            return {
                ok: false,
                latencyMs: Date.now() - startTime,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
    /**
     * Terminates every agent process started by this driver.
     */
    async shutdown() {
        const providers = [...this.providers];
        this.providers.clear();
        this.cachedModels.clear();
        for (const provider of providers) {
            try {
                provider.cleanup();
            }
            catch (err) {
                this.logger?.warn?.(`[AcpDriver] Failed to clean up ACP provider: ${String(err)}`);
            }
        }
    }
    resolveRuntimeConfig(agentId) {
        const predefined = getAcpAgentConfig(agentId);
        const explicitCommand = this.config.command;
        // A command is only ever taken from config or from the built-in agent table.
        if (!explicitCommand && !predefined) {
            throw new ProviderConfigError(this.name, `Unknown ACP agent "${agentId}". Use one of the built-in agents or set "command" explicitly in the provider config.`);
        }
        const builtFromEnv = predefined
            ? buildAcpRuntimeConfig(agentId, (key) => this.env[key], this.env, this.logger)
            : null;
        const command = explicitCommand ?? builtFromEnv?.command ?? predefined.command;
        const args = this.config.args ?? (explicitCommand ? [] : (builtFromEnv?.args ?? predefined.args));
        const cwd = this.config.cwd ?? builtFromEnv?.cwd ?? process.cwd();
        if (!path.isAbsolute(cwd)) {
            throw new ProviderConfigError(this.name, `ACP "cwd" must be an absolute path, got "${cwd}"`);
        }
        const env = buildAgentEnv(this.env, { ...(builtFromEnv?.env ?? {}), ...(this.config.env ?? {}) }, this.config.inheritEnv);
        const mcpServers = [...(builtFromEnv?.mcpServers ?? [])];
        for (const server of this.config.mcpServers ?? []) {
            const normalized = normalizeMcpServer(server);
            if (normalized)
                mcpServers.push(normalized);
            else
                this.logger?.warn?.(`[AcpDriver] Ignoring invalid MCP server in provider "${this.name}"`);
        }
        if (this.config.enableProjectMcp) {
            if (this.config.projectMcp) {
                const project = buildProjectMcpServer(this.config.projectMcp, this.logger);
                if (project)
                    mcpServers.push(project);
            }
            else {
                this.logger?.warn?.(`[AcpDriver] enableProjectMcp is set on "${this.name}" but "projectMcp.path" is missing; skipping.`);
            }
        }
        return {
            command,
            args,
            cwd,
            env,
            mcpServers,
            authMethodId: this.config.authMethodId ?? builtFromEnv?.authMethodId ?? predefined?.authMethodId,
        };
    }
    async createModel(runtimeConfig) {
        this.logger?.info?.(`[ACP] Starting ACP agent session: ${runtimeConfig.command} in ${runtimeConfig.cwd}`);
        let acpModule;
        try {
            acpModule = await import('@mcpc-tech/acp-ai-provider');
        }
        catch (err) {
            throw new AiException(`Package "@mcpc-tech/acp-ai-provider" is required to use ACP drivers: ${err instanceof Error ? err.message : String(err)}`, 'E_AI_MISSING_DEPENDENCY', err);
        }
        const provider = acpModule.createACPProvider({
            command: runtimeConfig.command,
            args: runtimeConfig.args,
            env: runtimeConfig.env,
            authMethodId: runtimeConfig.authMethodId,
            session: {
                cwd: runtimeConfig.cwd,
                mcpServers: runtimeConfig.mcpServers,
            },
        });
        this.providers.add(provider);
        const model = provider.languageModel();
        this.installPermissionHandler(model, runtimeConfig.command);
        return model;
    }
    /**
     * The ACP provider auto-selects the first permission option when no handler is set, and offers
     * no public API to set one. The handler is installed on the model's client right after every
     * connection is established. If it cannot be installed the model refuses to connect (fail-closed).
     */
    installPermissionHandler(model, agentLabel) {
        const connect = model.connectClient.bind(model);
        const handler = (params) => this.answerPermission(params, agentLabel);
        model.connectClient = async () => {
            await connect();
            const client = model.client;
            if (!client || typeof client.setPermissionRequestHandler !== 'function') {
                throw new AiException('Unable to install the ACP permission handler (unsupported @mcpc-tech/acp-ai-provider version); refusing to run the agent without permission control.', 'E_AI_ACP_UNSAFE');
            }
            client.setPermissionRequestHandler(handler);
        };
    }
    async answerPermission(params, agentLabel) {
        const options = params.options ?? [];
        const select = (kinds) => {
            const option = options.find((o) => kinds.includes(o.kind));
            return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : null;
        };
        const reject = () => select(['reject_once', 'reject_always']) ?? { outcome: { outcome: 'cancelled' } };
        // Never answer with `allow_always`: a single approval must not become a standing grant.
        const allow = () => select(['allow_once']) ?? reject();
        const title = params.toolCall?.title ?? params.toolCall?.kind ?? 'agent action';
        if (this.permissionPolicy === 'deny') {
            this.logger?.warn?.(`[ACP] Denied "${title}" requested by ${agentLabel} (policy: deny)`);
            return reject();
        }
        if (this.permissionPolicy === 'allow') {
            return allow();
        }
        if (!this.confirmation) {
            this.logger?.warn?.(`[ACP] Denied "${title}" requested by ${agentLabel}: no ConfirmationService to ask a human`);
            return reject();
        }
        const response = await this.confirmation.waitForResponse({
            sessionId: params.sessionId,
            toolName: `acp:${agentLabel}`,
            action: String(title),
            params: {
                kind: params.toolCall?.kind ?? null,
                rawInput: params.toolCall?.rawInput ?? null,
                locations: params.toolCall?.locations ?? null,
            },
        }, this.config.permissionTimeoutMs);
        return response.status === 'approved' ? allow() : reject();
    }
}
/**
 * Factory for creating an AcpDriver instance.
 */
export function createAcpDriver(name, config, deps = {}) {
    return new AcpDriver(name, config, deps);
}
//# sourceMappingURL=provider.js.map