import { test } from '@japa/runner'
import { fileURLToPath } from 'node:url'
import { ModelsDevSource } from '../../../src/catalog/source.js'
import { CatalogModelResolver } from '../../../src/models/catalog_resolver.js'

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url))
const catalogFor = (name: string) => new ModelsDevSource({ overridePath: fixture(name) })

test.group('CatalogModelResolver', () => {
  test('resolves model from models.dev fixture', async ({ assert }) => {
    const resolver = new CatalogModelResolver({ catalog: catalogFor('models.dev.json') })
    const model = await resolver.resolve('openai/gpt-4.1')
    assert.equal(model.providerID, 'openai')
    assert.equal(model.modelID, 'gpt-4.1')
  })

  test('normalizes matching provider prefix from the default model', async ({ assert }) => {
    const resolver = new CatalogModelResolver({
      catalog: catalogFor('models.dev.json'),
      explicitProvider: () => 'openai',
      defaultModelRef: () => 'openai/gpt-4.1',
    })
    const model = await resolver.resolve()
    assert.equal(model.providerID, 'openai')
    assert.equal(model.modelID, 'gpt-4.1')
  })

  test('resolves openrouter model keys with provider prefix', async ({ assert }) => {
    const resolver = new CatalogModelResolver({
      catalog: catalogFor('models.dev.json'),
      getApiKey: () => 'test-openrouter-key',
    })
    const model = await resolver.resolve('openrouter/hunter-alpha')
    assert.equal(model.providerID, 'openrouter')
    assert.equal(model.modelID, 'openrouter/hunter-alpha')
    assert.equal(model.apiKey, 'test-openrouter-key')
  })

  test('resolves vendor-prefixed model via explicit provider', async ({ assert }) => {
    const resolver = new CatalogModelResolver({
      catalog: catalogFor('models.dev.json'),
      explicitProvider: () => 'openrouter',
      defaultModelRef: () => 'minimax/minimax-m2.5:free',
      getApiKey: () => 'test-openrouter-key',
    })
    const model = await resolver.resolve()
    assert.equal(model.providerID, 'openrouter')
    assert.equal(model.modelID, 'minimax/minimax-m2.5:free')
    assert.equal(model.apiKey, 'test-openrouter-key')
  })

  test('default getApiKey reads the first non-empty env var', async ({ assert }) => {
    process.env.KIMI_API_KEY = 'kimi-secret'
    try {
      const resolver = new CatalogModelResolver({ catalog: catalogFor('models.dev.json') })
      const model = await resolver.resolve('kimi-for-coding/k2p5')
      assert.equal(model.apiKey, 'kimi-secret')
    } finally {
      delete process.env.KIMI_API_KEY
    }
  })

  test('preserves model headers from models.dev', async ({ assert }) => {
    const resolver = new CatalogModelResolver({ catalog: catalogFor('models.dev.json') })
    const model = await resolver.resolve('kimi-for-coding/k2p5')
    assert.deepEqual(model.headers, {
      'User-Agent': 'claude-code/0.1.0',
      'X-Client-Name': 'claude-code',
    })
  })

  test('unknown provider and missing configuration errors', async ({ assert }) => {
    const resolver = new CatalogModelResolver({ catalog: catalogFor('models.dev.json') })
    await assert.rejects(() => resolver.resolve('nope/model-x'), /Unknown provider: nope/)
    await assert.rejects(() => resolver.resolve(), /model or provider is required/i)
  })

  test('resolves ACP provider with runtime config', async ({ assert }) => {
    const env: Record<string, string> = {
      ACP_CLAUDE_CODE_PATH: '/custom/claude',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
    }
    const resolver = new CatalogModelResolver({
      catalog: catalogFor('models.dev.json'),
      explicitProvider: () => 'acp-claude-code',
      defaultModelRef: () => 'claude-code',
      acp: { getEnv: (k) => env[k], envSource: env },
    })
    const model = await resolver.resolve()
    assert.equal(model.providerID, 'acp-claude-code')
    assert.equal(model.modelID, 'claude-code')
    assert.equal(model.npm, '@mcpc-tech/acp-ai-provider')
    assert.equal(model.acpAgentId, 'claude-code')
    assert.equal(model.acpConfig?.command, '/custom/claude')
    assert.equal(model.acpConfig?.env.ANTHROPIC_API_KEY, 'test-anthropic-key')
  })
})
