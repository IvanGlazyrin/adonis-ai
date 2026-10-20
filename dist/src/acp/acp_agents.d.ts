import type { LoggerContract } from '../ai_manager.js';
import type { AcpAgentConfig, AcpAgentRuntimeConfig, AcpMcpServerConfig, AcpProjectMcpConfig } from './types.js';
/**
 * Built-in ACP agent configurations. These are the ONLY commands that may be started from a
 * model name; anything else must be configured explicitly via `AcpProviderConfig.command`.
 *
 * Commands follow the agents' own ACP docs: Claude via the `claude-agent-acp` adapter, Gemini CLI
 * with `--acp`, Qwen Code's `qwen --acp`, Codex via `codex-acp`, `opencode acp`.
 * `sourcecraft` and `freebuff` could not be verified against upstream docs; override them with
 * `ACP_<AGENT>_PATH` / `ACP_<AGENT>_ARGS` if your install differs.
 */
export declare const ACP_AGENTS: Record<string, AcpAgentConfig>;
/**
 * Get ACP agent configuration by ID.
 */
export declare function getAcpAgentConfig(agentId: string): AcpAgentConfig | undefined;
/**
 * List all available ACP agent IDs.
 */
export declare function listAcpAgentIds(): string[];
/**
 * Check if an agent ID is a valid ACP agent.
 */
export declare function isAcpAgent(agentId: string): boolean;
/**
 * Parse agent arguments from env string.
 * Supports JSON arrays (e.g., '["--flag","--opt","val"]')
 * and falls back to comma-separated values.
 */
export declare function parseAcpArgs(argsOverride: string | undefined, fallback: string[], logger?: LoggerContract): string[];
/**
 * Validates an MCP server definition and converts it to the exact shape required by the ACP
 * schema: stdio servers have no `type` and an `env` array; remote servers have `type`
 * 'http' | 'sse' and a `headers` array. Legacy `Record` env/headers and `httpUrl` are accepted.
 * Returns `null` for unusable entries.
 */
export declare function normalizeMcpServer(input: unknown): AcpMcpServerConfig | null;
/** Builds the stdio MCP server entry for a project-local MCP server file. */
export declare function buildProjectMcpServer(config: AcpProjectMcpConfig, logger?: LoggerContract): AcpMcpServerConfig | null;
/**
 * Build runtime configuration for an ACP agent.
 */
export declare function buildAcpRuntimeConfig(agentId: string, getEnv?: (key: string) => string | undefined, envSource?: Record<string, string | undefined>, logger?: LoggerContract): AcpAgentRuntimeConfig | null;
/**
 * Create provider entry for models.dev registry.
 */
export declare function createAcpProviderEntry(agentId: string): {
    id: string;
    name: string;
    env: string[];
    npm: string;
    protocol: string;
    models: Record<string, {
        id: string;
        name: string;
    }>;
} | null;
/**
 * Get all ACP provider entries for models catalog.
 */
export declare function getAllAcpProviderEntries(): ReturnType<typeof createAcpProviderEntry>[];
/**
 * Environment variable keys used across ACP agents.
 */
export declare function getAcpEnvVarKeys(): {
    apiKeys: string[];
    agents: Record<string, {
        path: string;
        cwd: string;
        args: string;
        mcpServers: string;
        enableProjectMcp: string;
    }>;
};
//# sourceMappingURL=acp_agents.d.ts.map