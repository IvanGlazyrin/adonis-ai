import type { BaseProviderConfig } from '../types.js'
import type { Logger } from '../logger.js'

/** `{ name, value }` pair as required by the ACP schema for `env` and `headers`. */
export interface AcpNameValue {
  name: string
  value: string
}

/** Stdio MCP server, exactly as in the ACP schema (`McpServerStdio`: no `type`, `env` is an array). */
export interface AcpStdioMcpServer {
  type?: 'stdio'
  name: string
  command: string
  args?: string[]
  env?: AcpNameValue[]
}

/** Remote MCP server (`McpServerHttp` / `McpServerSse`), `headers` is an array of `{name,value}`. */
export interface AcpRemoteMcpServer {
  type: 'http' | 'sse'
  name: string
  url: string
  headers?: AcpNameValue[]
}

export type AcpMcpServerConfig = AcpStdioMcpServer | AcpRemoteMcpServer

/**
 * What to do when the ACP agent asks for permission (shell commands, file writes, ...).
 * - `ask`   (default) require a human decision via the ConfirmationService; denied if none
 * - `deny`  refuse everything
 * - `allow` auto-approve (once). Only for fully trusted, sandboxed setups.
 */
export type AcpPermissionPolicy = 'ask' | 'deny' | 'allow'

export interface AcpAgentConfig {
  id: string
  name: string
  description: string
  command: string
  args: string[]
  envVarPrefix: string
  supportsMcpServers: boolean
  authMethodId?: string
  /**
   * Environment variables the agent needs: for each `target`, the first of `sources`
   * that is set is passed to the agent process as `target`.
   *
   * When omitted (`undefined`), the `credentialEnv` of the built-in default agent with the
   * same id is used, if any. An explicit value, including `[]`, is used as-is, so `[]` opts out.
   */
  credentialEnv?: Array<{ target: string; sources: string[] }>
}

export interface AcpAgentRuntimeConfig {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  mcpServers: AcpMcpServerConfig[]
  authMethodId?: string
}

export interface AcpRuntimeOptions {
  /** Environment lookup. Default: `process.env` */
  getEnv?: (key: string) => string | undefined
  /** Source scanned for `ACP_<AGENT>_ENV_*` entries. Default: `process.env` */
  envSource?: Record<string, string | undefined>
  logger?: Logger
  /** Project MCP server file, used when `<prefix>_PROJECT_MCP_PATH` is not set. */
  projectMcpPath?: string
}

export interface AcpProjectMcpConfig {
  /** Absolute or cwd-relative path to the MCP server entry file. */
  path: string
  /** Executable used to run it. Default: `node` */
  command?: string
  /** Server name reported to the agent. Default: `project-tools` */
  name?: string
}

export interface AcpProviderConfig extends BaseProviderConfig {
  driver: 'acp'
  /**
   * Predefined agent ID (e.g. 'claude-code', 'gemini', 'codex', 'opencode', 'qwen-code').
   * Defaults to 'claude-code'. Must be a known agent unless `command` is set.
   */
  agentId?: string
  /**
   * Explicit executable for a custom agent. Only values written in config are ever executed;
   * a model name coming from a request is never treated as a command.
   */
  command?: string
  /**
   * Override CLI command arguments
   */
  args?: string[]
  /**
   * Custom working directory for the agent process (must be an absolute path)
   */
  cwd?: string
  /**
   * Extra environment variables passed to the agent CLI
   */
  env?: Record<string, string>
  /**
   * Forward the complete server environment to the agent (secrets included).
   * Default: false - only a safe allowlist plus the agent's own credentials is forwarded.
   */
  inheritEnv?: boolean
  /**
   * MCP servers to attach to the ACP agent session
   */
  mcpServers?: AcpMcpServerConfig[]
  /**
   * Optional authentication method identifier
   */
  authMethodId?: string
  /**
   * Attach the project's own MCP server (requires `projectMcp.path`).
   */
  enableProjectMcp?: boolean
  projectMcp?: AcpProjectMcpConfig
  /**
   * How permission requests from the agent are answered. Default: 'ask'.
   */
  permissionPolicy?: AcpPermissionPolicy
  /**
   * How long to wait for a human to answer a permission request, in ms. Default: 60000
   */
  permissionTimeoutMs?: number
}
