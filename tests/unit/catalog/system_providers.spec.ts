import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { ModelsDevSource } from '../../../src/catalog/source.js'

type Options = ConstructorParameters<typeof ModelsDevSource>[0]

const source = (options: Options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'adonis-ai-catalog-'))
  const overridePath = join(dir, 'override.json')
  writeFileSync(
    overridePath,
    JSON.stringify({ fake: { id: 'fake', name: 'Fake', env: [], models: {} } })
  )
  return new ModelsDevSource({ overridePath, cachePath: join(dir, 'cache.json'), ...options })
}

test.group('ModelsDevSource system providers', () => {
  test('acp only', async ({ assert }) => {
    const cat = await source({ systemProviders: { fallback: false, acp: true } }).load()
    assert.notProperty(cat, 'openai')
    assert.property(cat, 'acp-claude-code')
  })

  test('fallback only', async ({ assert }) => {
    const cat = await source({ systemProviders: { fallback: true, acp: false } }).load()
    assert.property(cat, 'openai')
    assert.isFalse(Object.keys(cat).some((k) => k.startsWith('acp-')))
  })

  test('legacy flag disables both', async ({ assert }) => {
    const cat = await source({ injectSystemProviders: false }).load()
    assert.deepEqual(Object.keys(cat), ['fake'])
  })

  test('explicit systemProviders wins over the legacy flag', async ({ assert }) => {
    const cat = await source({
      injectSystemProviders: false,
      systemProviders: { acp: true },
    }).load()
    assert.property(cat, 'acp-claude-code')
    assert.property(cat, 'openai')
  })
})
