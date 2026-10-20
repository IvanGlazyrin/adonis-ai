import type { LanguageModel } from 'ai';
import type { ConfirmationService } from '../guard/confirmation.js';
import type { AiDriver } from '../types.js';
import type { LoggerContract } from '../ai_manager.js';
import type { AcpProviderConfig } from './types.js';
/**
 * Builds the environment for the agent process.
 *
 * `@mcpc-tech/acp-ai-provider` spawns the agent with `{ ...process.env, ...env }`, so the server's
 * secrets cannot be left out by omission. Instead every variable that is not allowlisted is
 * explicitly blanked, and only the allowlist plus `extra` (agent credentials, configured env)
 * keep real values.
 */
export declare function buildAgentEnv(source: Record<string, string | undefined>, extra: Record<string, string>, inheritEnv?: boolean): Record<string, string>;
export interface AcpDriverDeps {
    logger?: LoggerContract;
    /** Answers agent permission requests when `permissionPolicy` is `ask`. */
    confirmation?: ConfirmationService;
    /** Environment to derive the agent environment from. Default: `process.env` */
    env?: Record<string, string | undefined>;
}
export declare class AcpDriver implements AiDriver {
    readonly name: string;
    readonly defaultModel: string;
    private config;
    private logger?;
    private confirmation?;
    private env;
    private cachedModels;
    private providers;
    private permissionPolicy;
    constructor(name: string, config: AcpProviderConfig, deps?: AcpDriverDeps);
    /**
     * Lazily loads and instantiates an AI SDK language model backed by the ACP agent.
     * `modelName` selects among the built-in agents; it is never executed as a command.
     */
    getModel(modelName?: string): Promise<LanguageModel>;
    /**
     * Tests whether the ACP agent can be resolved and its model instantiated.
     */
    ping(): Promise<{
        ok: boolean;
        latencyMs: number;
        error?: string;
    }>;
    /**
     * Terminates every agent process started by this driver.
     */
    shutdown(): Promise<void>;
    private resolveRuntimeConfig;
    private createModel;
    /**
     * The ACP provider auto-selects the first permission option when no handler is set, and offers
     * no public API to set one. The handler is installed on the model's client right after every
     * connection is established. If it cannot be installed the model refuses to connect (fail-closed).
     */
    private installPermissionHandler;
    private answerPermission;
}
/**
 * Factory for creating an AcpDriver instance.
 */
export declare function createAcpDriver(name: string, config: AcpProviderConfig, deps?: AcpDriverDeps): AcpDriver;
//# sourceMappingURL=provider.d.ts.map