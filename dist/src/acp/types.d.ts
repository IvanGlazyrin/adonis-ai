import type { BaseProviderConfig } from '../types.js';
/** `{ name, value }` pair as required by the ACP schema for `env` and `headers`. */
export interface AcpNameValue {
    name: string;
    value: string;
}
/** Stdio MCP server, exactly as in the ACP schema (`McpServerStdio`: no `type`, `env` is an array). */
export interface AcpStdioMcpServer {
    type?: 'stdio';
    name: string;
    command: string;
    args?: string[];
    env?: AcpNameValue[];
}
/** Remote MCP server (`McpServerHttp` / `McpServerSse`), `headers` is an array of `{name,value}`. */
export interface AcpRemoteMcpServer {
    type: 'http' | 'sse';
    name: string;
    url: string;
    headers?: AcpNameValue[];
}
export type AcpMcpServerConfig = AcpStdioMcpServer | AcpRemoteMcpServer;
/**
 * What to do when the ACP agent asks for permission (shell commands, file writes, ...).
 * - `ask`   (default) require a human decision via the ConfirmationService; denied if none
 * - `deny`  refuse everything
 * - `allow` auto-approve (once). Only for fully trusted, sandboxed setups.
 */
export type AcpPermissionPolicy = 'ask' | 'deny' | 'allow';
export interface AcpAgentConfig {
    id: string;
    name: string;
    description: string;
    command: string;
    args: string[];
    envVarPrefix: string;
    supportsMcpServers: boolean;
    authMethodId?: string;
}
export interface AcpAgentRuntimeConfig {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    mcpServers: AcpMcpServerConfig[];
    authMethodId?: string;
}
export interface AcpProjectMcpConfig {
    /** Absolute or cwd-relative path to the MCP server entry file. */
    path: string;
    /** Executable used to run it. Default: `node` */
    command?: string;
    /** Server name reported to the agent. Default: `project-tools` */
    name?: string;
}
export interface AcpProviderConfig extends BaseProviderConfig {
    driver: 'acp';
    /**
     * Predefined agent ID (e.g. 'claude-code', 'gemini', 'codex', 'opencode', 'qwen-code').
     * Defaults to 'claude-code'. Must be a known agent unless `command` is set.
     */
    agentId?: string;
    /**
     * Explicit executable for a custom agent. Only values written in config are ever executed;
     * a model name coming from a request is never treated as a command.
     */
    command?: string;
    /**
     * Override CLI command arguments
     */
    args?: string[];
    /**
     * Custom working directory for the agent process (must be an absolute path)
     */
    cwd?: string;
    /**
     * Extra environment variables passed to the agent CLI
     */
    env?: Record<string, string>;
    /**
     * Forward the complete server environment to the agent (secrets included).
     * Default: false - only a safe allowlist plus the agent's own credentials is forwarded.
     */
    inheritEnv?: boolean;
    /**
     * MCP servers to attach to the ACP agent session
     */
    mcpServers?: AcpMcpServerConfig[];
    /**
     * Optional authentication method identifier
     */
    authMethodId?: string;
    /**
     * Attach the project's own MCP server (requires `projectMcp.path`).
     */
    enableProjectMcp?: boolean;
    projectMcp?: AcpProjectMcpConfig;
    /**
     * How permission requests from the agent are answered. Default: 'ask'.
     */
    permissionPolicy?: AcpPermissionPolicy;
    /**
     * How long to wait for a human to answer a permission request, in ms. Default: 60000
     */
    permissionTimeoutMs?: number;
}
//# sourceMappingURL=types.d.ts.map