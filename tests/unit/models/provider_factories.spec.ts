import { test } from '@japa/runner'
import {
  BUILTIN_PROVIDER_EXPORTS,
  ProviderFactoryRegistry,
  type ProviderFactory,
} from '../../../src/models/provider_factories.js'
import { PROTOCOL_TO_NPM } from '../../../src/models/protocols.js'

test.group('ProviderFactoryRegistry', () => {
  test('missing provider package gives a clear error', async ({ assert }) => {
    const r = new ProviderFactoryRegistry()
    await assert.rejects(() => r.get('@ai-sdk/definitely-not-installed'), /@ai-sdk\/definitely-not-installed/)
  })

  test('error for an unknown package hints at register()', async ({ assert }) => {
    await assert.rejects(() => new ProviderFactoryRegistry().get('@x/y'), /register\(\)/)
  })

  test('registered factory wins over import', async ({ assert }) => {
    const f: ProviderFactory = () => ({ languageModel: () => ({}) as any })
    assert.strictEqual(
      await new ProviderFactoryRegistry().register('@ai-sdk/openai', f).get('@ai-sdk/openai'),
      f
    )
  })

  test('has() reflects registration', ({ assert }) => {
    const r = new ProviderFactoryRegistry()
    assert.isFalse(r.has('@x/y'))
    r.register('@x/y', () => ({ languageModel: () => ({}) as any }))
    assert.isTrue(r.has('@x/y'))
  })

  test('builtin import resolves an installed package', async ({ assert }) => {
    assert.isFunction(await new ProviderFactoryRegistry().get('@ai-sdk/openai'))
  })

  test('qwencode alias loads the openai-compatible export name', ({ assert }) => {
    assert.equal(BUILTIN_PROVIDER_EXPORTS['qwencode'], 'createOpenAICompatible')
  })

  test('every protocol npm package is covered by the builtin table', ({ assert }) => {
    for (const npm of Object.values(PROTOCOL_TO_NPM)) {
      if (npm === '@mcpc-tech/acp-ai-provider') continue
      assert.property(BUILTIN_PROVIDER_EXPORTS, npm)
    }
  })
})
