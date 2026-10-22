import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Logger } from '../logger.js'
import type {
  AcpAgentConfig,
  AcpAgentRuntimeConfig,
  AcpMcpServerConfig,
  AcpNameValue,
  AcpProjectMcpConfig,
} from './types.js'

/**
 * Built-in ACP agent configurations. These are the ONLY commands that may be started from a
 * model name; anything else must be configured explicitly via `AcpProviderConfig.command`.
 *
 * Commands follow the agents' own ACP docs: Claude via the `claude-agent-acp` adapter, Gemini CLI
 * with `--acp`, Qwen Code's `qwen --acp`, Codex via `codex-acp`, `opencode acp`.
 * `sourcecraft` and `freebuff` could not be verified against upstream docs; override them with
 * `ACP_<AGENT>_PATH` / `ACP_<AGENT>_ARGS` if your install differs.
 */
const DEFAULT_ACP_AGENTS: Record<string, AcpAgentConfig> = Object.freeze({
  'claude-code': {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's agentic coding CLI tool",
    command: 'claude-agent-acp',
    args: [],
    envVarPrefix: 'ACP_CLAUDE_CODE',
    supportsMcpServers: true,
  },
  'gemini': {
    id: 'gemini',
    name: 'Gemini CLI',
    description: "Google's Gemini CLI agent",
    command: 'gemini',
    args: ['--acp'],
    envVarPrefix: 'ACP_GEMINI',
    supportsMcpServers: true,
    authMethodId: 'gemini-api-key',
  },
  'codex': {
    id: 'codex',
    name: 'Codex CLI',
    description: "OpenAI's Codex CLI agent",
    command: 'codex-acp',
    args: [],
    envVarPrefix: 'ACP_CODEX',
    supportsMcpServers: true,
  },
  'qwen-code': {
    id: 'qwen-code',
    name: 'Qwen Code',
    description: "Alibaba's Qwen Code CLI agent",
    command: 'qwen',
    args: ['--acp'],
    envVarPrefix: 'ACP_QWEN_CODE',
    supportsMcpServers: true,
  },
  'sourcecraft': {
    id: 'sourcecraft',
    name: 'SourceCraft Code Assistant',
    description: "SourceCraft's Code Assistant agent via CLI",
    command: 'src',
    args: ['code', '--', 'acp'],
    envVarPrefix: 'ACP_SOURCECRAFT',
    supportsMcpServers: true,
  },
  'opencode': {
    id: 'opencode',
    name: 'OpenCode',
    description: 'OpenCode AI coding assistant',
    command: 'opencode',
    args: ['acp'],
    envVarPrefix: 'ACP_OPENCODE',
    supportsMcpServers: true,
  },
  'freebuff': {
    id: 'freebuff',
    name: 'Freebuff',
    description: 'Freebuff AI coding agent',
    command: 'codebuff-agent-acp',
    args: [],
    envVarPrefix: 'ACP_FREEBUFF',
    supportsMcpServers: true,
  },
})

/**
 * Registry of the ACP agents this application may start.
 *
 * It starts with the built-in agents, and an application can replace it with the
 * binaries that are actually installed on the operator's machine
 * (`setAcpAgents`) or extend it (`registerAcpAgent`).
 */
export const ACP_AGENTS: Record<string, AcpAgentConfig> = { ...DEFAULT_ACP_AGENTS }

/**
 * Registers (or replaces) one ACP agent.
 */
export function registerAcpAgent(agentId: string, config: AcpAgentConfig): void {
  ACP_AGENTS[agentId] = config
}

/**
 * Replaces the whole agent registry, e.g. with the binaries of a given deployment.
 */
export function setAcpAgents(agents: Record<string, AcpAgentConfig>): void {
  for (const key of Object.keys(ACP_AGENTS)) delete ACP_AGENTS[key]
  Object.assign(ACP_AGENTS, agents)
}

/**
 * Restores the built-in agent registry.
 */
export function resetAcpAgents(): void {
  setAcpAgents(DEFAULT_ACP_AGENTS)
}

/**
 * Get ACP agent configuration by ID.
 */
export function getAcpAgentConfig(agentId: string): AcpAgentConfig | undefined {
  return ACP_AGENTS[agentId]
}

/**
 * List all available ACP agent IDs.
 */
export function listAcpAgentIds(): string[] {
  return Object.keys(ACP_AGENTS)
}

/**
 * Check if an agent ID is a valid ACP agent.
 */
export function isAcpAgent(agentId: string): boolean {
  return agentId in ACP_AGENTS
}

/**
 * Parse agent arguments from env string.
 * Supports JSON arrays (e.g., '["--flag","--opt","val"]')
 * and falls back to comma-separated values.
 */
export function parseAcpArgs(
  argsOverride: string | undefined,
  fallback: string[],
  logger?: Logger
): string[] {
  if (!argsOverride) return fallback
  const trimmed = argsOverride.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed
      }
    } catch {
      logger?.warn?.(`[ACP] Invalid JSON array in args override: ${trimmed}`)
    }
  }
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function toNameValueList(input: unknown): AcpNameValue[] {
  if (Array.isArray(input)) {
    return input.filter(
      (item): item is AcpNameValue =>
        item !== null &&
        typeof item === 'object' &&
        typeof (item as AcpNameValue).name === 'string' &&
        typeof (item as AcpNameValue).value === 'string'
    )
  }
  if (input !== null && typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string')
      .map(([name, value]) => ({ name, value: value as string }))
  }
  return []
}

/**
 * Validates an MCP server definition and converts it to the exact shape required by the ACP
 * schema: stdio servers have no `type` and an `env` array; remote servers have `type`
 * 'http' | 'sse' and a `headers` array. Legacy `Record` env/headers and `httpUrl` are accepted.
 * Returns `null` for unusable entries.
 */
export function normalizeMcpServer(input: unknown): AcpMcpServerConfig | null {
  if (input === null || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  if (typeof raw.name !== 'string' || raw.name.length === 0) return null

  const url =
    typeof raw.url === 'string' ? raw.url : typeof raw.httpUrl === 'string' ? raw.httpUrl : undefined
  if (raw.type === 'http' || raw.type === 'sse' || (raw.type === undefined && url && !raw.command)) {
    if (!url) return null
    return {
      type: raw.type === 'sse' ? 'sse' : 'http',
      name: raw.name,
      url,
      headers: toNameValueList(raw.headers),
    }
  }

  if (typeof raw.command !== 'string' || raw.command.length === 0) return null
  return {
    name: raw.name,
    command: raw.command,
    args: Array.isArray(raw.args) ? raw.args.filter((a): a is string => typeof a === 'string') : [],
    env: toNameValueList(raw.env),
  }
}

/** Builds the stdio MCP server entry for a project-local MCP server file. */
export function buildProjectMcpServer(
  config: AcpProjectMcpConfig,
  logger?: Logger
): AcpMcpServerConfig | null {
  const serverPath = path.resolve(config.path)
  if (!existsSync(serverPath)) {
    logger?.warn?.(`[ACP] Project MCP server not found: ${serverPath}. Skipping project MCP.`)
    return null
  }
  return {
    name: config.name ?? 'project-tools',
    command: config.command ?? 'node',
    args: [serverPath],
    env: [],
  }
}

/**
 * Build runtime configuration for an ACP agent.
 */
export function buildAcpRuntimeConfig(
  agentId: string,
  getEnv: (key: string) => string | undefined = (key) => process.env[key],
  envSource: Record<string, string | undefined> = process.env,
  logger?: Logger
): AcpAgentRuntimeConfig | null {
  const config = getAcpAgentConfig(agentId)
  if (!config) return null

  const prefix = config.envVarPrefix

  // Build command (allow override via env)
  const command = getEnv(`${prefix}_PATH`) || config.command

  // Build args (allow override via env)
  const args = parseAcpArgs(getEnv(`${prefix}_ARGS`), config.args, logger)

  // Build cwd (allow override via env, default to current working directory)
  const cwd = path.resolve(getEnv(`${prefix}_CWD`) || process.cwd())

  // Build environment variables
  const env: Record<string, string> = {}

  // Add auth-related env vars based on agent type
  if (agentId === 'gemini') {
    const apiKey = getEnv('GEMINI_API_KEY') || getEnv('GOOGLE_API_KEY')
    if (apiKey) env.GEMINI_API_KEY = apiKey
  } else if (agentId === 'claude-code') {
    const apiKey = getEnv('ANTHROPIC_API_KEY')
    if (apiKey) env.ANTHROPIC_API_KEY = apiKey
  } else if (agentId === 'codex') {
    const apiKey = getEnv('OPENAI_API_KEY')
    if (apiKey) env.OPENAI_API_KEY = apiKey
  } else if (agentId === 'qwen-code') {
    const apiKey = getEnv('DASHSCOPE_API_KEY') || getEnv('QWEN_API_KEY')
    if (apiKey) env.DASHSCOPE_API_KEY = apiKey
  } else if (agentId === 'opencode') {
    const apiKey = getEnv('OPENCODE_API_KEY')
    if (apiKey) env.OPENCODE_API_KEY = apiKey
  } else if (agentId === 'freebuff') {
    const apiKey = getEnv('CODEBUFF_API_KEY') || getEnv('FREEBUFF_API_KEY')
    if (apiKey) {
      env.CODEBUFF_API_KEY = apiKey
      env.FREEBUFF_API_KEY = apiKey
    }
  }

  // Add custom env vars from ACP_<AGENT>_ENV_* pattern
  const envPrefix = `${prefix}_ENV_`
  for (const [key, value] of Object.entries(envSource)) {
    if (key.startsWith(envPrefix) && value !== undefined) {
      const envKey = key.slice(envPrefix.length)
      env[envKey] = value
    }
  }

  // Parse MCP servers configuration (validated and converted to the ACP schema shape)
  const mcpServers: AcpMcpServerConfig[] = []
  const mcpConfigJson = getEnv(`${prefix}_MCP_SERVERS`)
  if (mcpConfigJson) {
    try {
      const parsed = JSON.parse(mcpConfigJson)
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          const server = normalizeMcpServer(entry)
          if (server) mcpServers.push(server)
          else logger?.warn?.(`[ACP] Ignoring invalid MCP server entry for ${agentId}`)
        }
      }
    } catch {
      logger?.warn?.(`[ACP] Invalid MCP servers JSON for ${agentId}`)
    }
  }

  // Add the project's MCP server if enabled and an explicit path was given
  if (getEnv(`${prefix}_ENABLE_PROJECT_MCP`) === 'true') {
    const projectPath = getEnv(`${prefix}_PROJECT_MCP_PATH`)
    if (projectPath) {
      const server = buildProjectMcpServer({ path: projectPath }, logger)
      if (server) mcpServers.push(server)
    } else {
      logger?.warn?.(
        `[ACP] ${prefix}_ENABLE_PROJECT_MCP is set but ${prefix}_PROJECT_MCP_PATH is not; skipping project MCP.`
      )
    }
  }

  return {
    command,
    args,
    cwd,
    env,
    mcpServers,
    authMethodId: config.authMethodId,
  }
}

/**
 * Create provider entry for models.dev registry.
 */
export function createAcpProviderEntry(agentId: string): {
  id: string
  name: string
  env: string[]
  npm: string
  protocol: string
  models: Record<string, { id: string; name: string }>
} | null {
  const config = getAcpAgentConfig(agentId)
  if (!config) return null

  const prefix = config.envVarPrefix

  return {
    id: `acp-${agentId}`,
    name: config.name,
    env: [
      `${prefix}_PATH`,
      `${prefix}_CWD`,
      `${prefix}_ARGS`,
      `${prefix}_MCP_SERVERS`,
      `${prefix}_ENABLE_PROJECT_MCP`,
      `${prefix}_PROJECT_MCP_PATH`,
    ],
    npm: '@mcpc-tech/acp-ai-provider',
    protocol: 'acp',
    models: {
      [agentId]: {
        id: agentId,
        name: `${config.name} Agent`,
      },
    },
  }
}

/**
 * Get all ACP provider entries for models catalog.
 */
export function getAllAcpProviderEntries(): ReturnType<typeof createAcpProviderEntry>[] {
  return listAcpAgentIds()
    .map((id) => createAcpProviderEntry(id))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

/**
 * Environment variable keys used across ACP agents.
 */
export function getAcpEnvVarKeys(): {
  apiKeys: string[]
  agents: Record<
    string,
    {
      path: string
      cwd: string
      args: string
      mcpServers: string
      enableProjectMcp: string
    }
  >
} {
  const agents: Record<
    string,
    { path: string; cwd: string; args: string; mcpServers: string; enableProjectMcp: string }
  > = {}

  for (const [id, config] of Object.entries(ACP_AGENTS)) {
    const p = config.envVarPrefix
    agents[id] = {
      path: `${p}_PATH`,
      cwd: `${p}_CWD`,
      args: `${p}_ARGS`,
      mcpServers: `${p}_MCP_SERVERS`,
      enableProjectMcp: `${p}_ENABLE_PROJECT_MCP`,
    }
  }

  return {
    apiKeys: [
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'OPENAI_API_KEY',
      'DASHSCOPE_API_KEY',
      'OPENCODE_API_KEY',
      'FREEBUFF_API_KEY',
    ],
    agents,
  }
}
