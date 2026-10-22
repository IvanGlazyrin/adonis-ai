import { test } from '@japa/runner'
import { AcpDriver } from '../../../src/acp/provider.js'
import { ConfirmationService } from '../../../src/guard/confirmation.js'
import { LanguageModelFactory } from '../../../src/models/language_model_factory.js'
import { ProviderFactoryRegistry } from '../../../src/models/provider_factories.js'

test.group('LanguageModelFactory', () => {
  test('throws for unsupported provider npm package', async ({ assert }) => {
    await assert.rejects(
      () => new LanguageModelFactory().create({ providerID: 'fake', modelID: 'x', npm: 'unknown-pkg' }),
      /unknown-pkg/
    )
  })

  test('creates a language model through a registered provider factory', async ({ assert }) => {
    const created = { id: 'test-model' } as any
    const factories = new ProviderFactoryRegistry().register('@ai-sdk/openai-compatible', (s) => ({
      languageModel: (id: string) => ({ ...created, id, provider: s.name }),
    }))
    const model = await new LanguageModelFactory({ factories }).create({
      providerID: 'local-openai',
      modelID: 'test-model',
      npm: '@ai-sdk/openai-compatible',
      apiUrl: 'http://127.0.0.1:9766/v1',
      apiKey: 'test-key',
      headers: { 'X-Test': 'yes' },
    })
    assert.include(model as any, { id: 'test-model', provider: 'local-openai' })
  })

  test('ACP model without runtime config is a config error', async ({ assert }) => {
    await assert.rejects(
      () =>
        new LanguageModelFactory().create({
          providerID: 'acp-x',
          modelID: 'x',
          npm: '@mcpc-tech/acp-ai-provider',
        }),
      /runtime config/
    )
  })

  test('factory receives credentials and a timeout fetch', async ({ assert }) => {
    let seen: any
    const factories = new ProviderFactoryRegistry().register('mock', (s) => {
      seen = s
      return { languageModel: () => ({}) as any }
    })
    await new LanguageModelFactory({ factories }).create({
      providerID: 'p',
      modelID: 'm',
      npm: 'mock',
      apiKey: 'k',
      apiUrl: 'http://u',
    })
    assert.include(seen, { name: 'p', apiKey: 'k', baseURL: 'http://u' })
    assert.isFunction(seen.fetch)
  })

  test('logs redact secret headers', async ({ assert }) => {
    const lines: string[] = []
    const push = (m: string) => void lines.push(m)
    const logger = { debug: push, info: push, warn: push, error: push }
    const factories = new ProviderFactoryRegistry().register('mock', () => ({
      languageModel: () => ({}) as any,
    }))
    await new LanguageModelFactory({ factories, logger }).create({
      providerID: 'p',
      modelID: 'm',
      npm: 'mock',
      headers: { Authorization: 's', 'X-Title': 't' },
    })
    const all = lines.join('\n')
    assert.notMatch(all, /Authorization":"s/)
    assert.include(all, '"X-Title":"t"')
    assert.include(all, '***')
  })

  test('shutdown without ACP models is a no-op', async () => {
    await new LanguageModelFactory().shutdown()
  })
})

const acpModel = (cwd: string) => ({
  providerID: 'acp-x',
  modelID: 'x',
  npm: '@mcpc-tech/acp-ai-provider',
  acpConfig: { command: 'agent', args: [], cwd, env: {}, mcpServers: [] },
})

/** Stubs `AcpDriver.getModel` (no agent process) and records every driver that served a call. */
async function withStubbedAcp(run: (served: AcpDriver[]) => Promise<void>) {
  const original = AcpDriver.prototype.getModel
  const served: AcpDriver[] = []
  AcpDriver.prototype.getModel = async function (this: AcpDriver) {
    served.push(this)
    return {} as any
  }
  try {
    await run(served)
  } finally {
    AcpDriver.prototype.getModel = original
  }
}

test.group('LanguageModelFactory ACP options', () => {
  test('shares one driver per command and cwd by default and stops it on shutdown', async ({ assert }) => {
    await withStubbedAcp(async (served) => {
      const factory = new LanguageModelFactory()
      await factory.create(acpModel(process.cwd()) as any)
      await factory.create(acpModel(process.cwd()) as any)
      assert.strictEqual(served[0], served[1])
      assert.equal((served[0] as any).config.inheritEnv, false)
    })
  })

  test('shareDriver: false creates a driver per call and shutdown stops them all', async ({ assert }) => {
    await withStubbedAcp(async (served) => {
      const factory = new LanguageModelFactory({ acp: { shareDriver: false, inheritEnv: true } })
      await factory.create(acpModel(process.cwd()) as any)
      await factory.create(acpModel(process.cwd()) as any)
      assert.notStrictEqual(served[0], served[1])
      assert.isTrue((served[0] as any).config.inheritEnv)

      const stopped: AcpDriver[] = []
      const originalShutdown = AcpDriver.prototype.shutdown
      AcpDriver.prototype.shutdown = async function (this: AcpDriver) {
        stopped.push(this)
      }
      try {
        await factory.shutdown()
      } finally {
        AcpDriver.prototype.shutdown = originalShutdown
      }
      assert.sameMembers(stopped, served)
    })
  })

  test('passes the confirmation service to the driver', async ({ assert }) => {
    await withStubbedAcp(async (served) => {
      const confirmation = new ConfirmationService()
      await new LanguageModelFactory({ acp: { confirmation } }).create(acpModel(process.cwd()) as any)
      assert.strictEqual((served[0] as any).confirmation, confirmation)
      confirmation.dispose()
    })
  })
})
