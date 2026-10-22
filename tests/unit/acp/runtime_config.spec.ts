import { test } from '@japa/runner'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import {
  buildAcpRuntimeConfig,
  createAcpProviderEntry,
  getAcpAgentConfig,
  getAcpEnvVarKeys,
  isAcpAgent,
  listAcpAgentIds,
  parseAcpArgs,
  registerAcpAgent,
  resetAcpAgents,
} from '../../../src/acp/acp_agents.js'

const envOf = (vars: Record<string, string>) => (key: string) => vars[key]

function withTempServers<T>(count: number, run: (files: string[]) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'acp-project-mcp-'))
  try {
    const files = Array.from({ length: count }, (_, i) => {
      const file = join(dir, `server${i}.js`)
      writeFileSync(file, '// fake mcp server')
      return file
    })
    return run(files)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test.group('acp runtime config', (group) => {
  group.each.teardown(() => resetAcpAgents())

  test('a registered agent maps its credentials from credentialEnv', ({ assert }) => {
    registerAcpAgent('x', {
      id: 'x',
      name: 'X',
      description: '',
      command: 'x-acp',
      args: [],
      envVarPrefix: 'ACP_X',
      supportsMcpServers: true,
      credentialEnv: [{ target: 'X_API_KEY', sources: ['X_KEY', 'X_API_KEY'] }],
    })
    const cfg = buildAcpRuntimeConfig('x', { getEnv: envOf({ X_KEY: 's' }), envSource: {} })
    assert.equal(cfg!.env.X_API_KEY, 's')
  })

  test('credentialEnv sets nothing when no source is present', ({ assert }) => {
    const cfg = buildAcpRuntimeConfig('codex', { getEnv: () => undefined, envSource: {} })
    assert.deepEqual(cfg!.env, {})
  })

  test('default agents keep their credential mapping', ({ assert }) => {
    const cases: Array<[string, Record<string, string>, Record<string, string>]> = [
      ['gemini', { GOOGLE_API_KEY: 'g' }, { GEMINI_API_KEY: 'g' }],
      ['gemini', { GEMINI_API_KEY: 'a', GOOGLE_API_KEY: 'g' }, { GEMINI_API_KEY: 'a' }],
      ['claude-code', { ANTHROPIC_API_KEY: 'k' }, { ANTHROPIC_API_KEY: 'k' }],
      ['codex', { OPENAI_API_KEY: 'o' }, { OPENAI_API_KEY: 'o' }],
      ['qwen-code', { QWEN_API_KEY: 'q' }, { DASHSCOPE_API_KEY: 'q' }],
      ['opencode', { OPENCODE_API_KEY: 'oc' }, { OPENCODE_API_KEY: 'oc' }],
      ['freebuff', { FREEBUFF_API_KEY: 'f' }, { CODEBUFF_API_KEY: 'f', FREEBUFF_API_KEY: 'f' }],
    ]
    for (const [agent, vars, expected] of cases) {
      const cfg = buildAcpRuntimeConfig(agent, { getEnv: envOf(vars), envSource: {} })
      assert.deepEqual(cfg!.env, expected, agent)
    }
  })

  test('projectMcpPath is used when the env path is absent', ({ assert }) => {
    withTempServers(1, ([file]) => {
      const cfg = buildAcpRuntimeConfig('claude-code', {
        getEnv: envOf({ ACP_CLAUDE_CODE_ENABLE_PROJECT_MCP: 'true' }),
        envSource: {},
        projectMcpPath: file,
      })
      assert.deepEqual(cfg!.mcpServers, [
        { name: 'project-tools', command: 'node', args: [path.resolve(file)], env: [] },
      ])
    })
  })

  test('env path wins over projectMcpPath', ({ assert }) => {
    withTempServers(2, ([fromEnv, fromOptions]) => {
      const cfg = buildAcpRuntimeConfig('claude-code', {
        getEnv: envOf({
          ACP_CLAUDE_CODE_ENABLE_PROJECT_MCP: 'true',
          ACP_CLAUDE_CODE_PROJECT_MCP_PATH: fromEnv,
        }),
        envSource: {},
        projectMcpPath: fromOptions,
      })
      assert.lengthOf(cfg!.mcpServers, 1)
      assert.deepEqual((cfg!.mcpServers[0] as { args: string[] }).args, [path.resolve(fromEnv)])
    })
  })

  test('projectMcpPath is ignored unless project MCP is enabled', ({ assert }) => {
    withTempServers(1, ([file]) => {
      const cfg = buildAcpRuntimeConfig('claude-code', {
        getEnv: () => undefined,
        envSource: {},
        projectMcpPath: file,
      })
      assert.deepEqual(cfg!.mcpServers, [])
    })
  })

  test('positional signature still works', ({ assert }) => {
    const cfg = buildAcpRuntimeConfig('codex', envOf({ OPENAI_API_KEY: 'o' }), {})
    assert.equal(cfg!.env.OPENAI_API_KEY, 'o')
  })

  test('positional form still reads ACP_<AGENT>_ENV_* from envSource and passes the logger', ({
    assert,
  }) => {
    const warnings: string[] = []
    const cfg = buildAcpRuntimeConfig(
      'gemini',
      envOf({ ACP_GEMINI_MCP_SERVERS: '{bad' }),
      { ACP_GEMINI_ENV_FOO: 'bar' },
      { warn: (m: string) => warnings.push(m) } as never
    )
    assert.equal(cfg!.env.FOO, 'bar')
    assert.lengthOf(warnings, 1)
  })

  test('options form reads process.env by default', ({ assert }) => {
    assert.isNotNull(buildAcpRuntimeConfig('codex'))
    assert.isNotNull(buildAcpRuntimeConfig('codex', {}))
  })

  test('returns null for unknown agent', ({ assert }) => {
    assert.isNull(buildAcpRuntimeConfig('unknown', { getEnv: () => undefined, envSource: {} }))
    assert.isNull(buildAcpRuntimeConfig('unknown', () => undefined, {}))
  })

  test('uses defaults when no env overrides', ({ assert }) => {
    const cfg = buildAcpRuntimeConfig('claude-code', { getEnv: () => undefined, envSource: {} })
    assert.equal(cfg?.command, 'claude-agent-acp')
    assert.equal(cfg?.cwd, process.cwd())
    assert.deepEqual(cfg?.args, [])
    assert.deepEqual(cfg?.mcpServers, [])
  })

  test('overrides command and args via env', ({ assert }) => {
    const cfg = buildAcpRuntimeConfig('gemini', {
      getEnv: envOf({ ACP_GEMINI_PATH: '/custom/gemini', ACP_GEMINI_ARGS: '--a,--b' }),
      envSource: {},
    })
    assert.equal(cfg?.command, '/custom/gemini')
    assert.deepEqual(cfg?.args, ['--a', '--b'])
  })

  test('reads custom env vars from envSource', ({ assert }) => {
    const cfg = buildAcpRuntimeConfig('gemini', {
      getEnv: () => undefined,
      envSource: { ACP_GEMINI_ENV_FOO: 'bar', ACP_GEMINI_ENV_BAZ: 'qux' },
    })
    assert.equal(cfg?.env.FOO, 'bar')
    assert.equal(cfg?.env.BAZ, 'qux')
  })

  test('parses MCP servers JSON and drops invalid entries', ({ assert }) => {
    const ok = buildAcpRuntimeConfig('claude-code', {
      getEnv: envOf({ ACP_CLAUDE_CODE_MCP_SERVERS: '[{"name":"test","command":"node"}]' }),
      envSource: {},
    })
    assert.lengthOf(ok!.mcpServers, 1)
    assert.equal(ok!.mcpServers[0].name, 'test')

    const bad = buildAcpRuntimeConfig('claude-code', {
      getEnv: envOf({ ACP_CLAUDE_CODE_MCP_SERVERS: '[{"name":"no-command"}]' }),
      envSource: {},
    })
    assert.lengthOf(bad!.mcpServers, 0)
  })

  test('registry helpers know the default agents', ({ assert }) => {
    assert.exists(getAcpAgentConfig('claude-code'))
    assert.isUndefined(getAcpAgentConfig('unknown-agent'))
    assert.deepEqual(
      listAcpAgentIds().sort(),
      ['claude-code', 'codex', 'freebuff', 'gemini', 'opencode', 'qwen-code', 'sourcecraft'].sort()
    )
    assert.isTrue(isAcpAgent('gemini'))
    assert.isFalse(isAcpAgent('openai'))
  })

  test('parseAcpArgs handles fallback, commas and JSON', ({ assert }) => {
    assert.deepEqual(parseAcpArgs(undefined, ['--default']), ['--default'])
    assert.deepEqual(parseAcpArgs('', ['--default']), ['--default'])
    assert.deepEqual(parseAcpArgs('--verbose,--sandbox', []), ['--verbose', '--sandbox'])
    assert.deepEqual(parseAcpArgs('["--flag","--opt","val"]', []), ['--flag', '--opt', 'val'])
  })

  test('createAcpProviderEntry returns the catalog shape', ({ assert }) => {
    assert.isNull(createAcpProviderEntry('unknown'))
    const entry = createAcpProviderEntry('gemini')
    assert.equal(entry?.id, 'acp-gemini')
    assert.equal(entry?.protocol, 'acp')
    assert.include(entry?.env, 'ACP_GEMINI_PROJECT_MCP_PATH')
  })

  test('getAcpEnvVarKeys exposes per-agent keys', ({ assert }) => {
    const keys = getAcpEnvVarKeys()
    assert.equal(keys.agents['claude-code'].path, 'ACP_CLAUDE_CODE_PATH')
    assert.include(keys.apiKeys, 'ANTHROPIC_API_KEY')
  })
})
