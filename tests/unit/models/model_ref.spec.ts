import { test } from '@japa/runner'
import { parseModelRef } from '../../../src/models/model_ref.js'

test.group('parseModelRef', () => {
  const knownProviderIds = ['openai', 'openrouter', 'anthropic']

  test('splits a known provider prefix from an explicit model ref', ({ assert }) => {
    assert.deepEqual(parseModelRef({ modelRef: 'openai/gpt-4.1', knownProviderIds }), {
      providerId: 'openai',
      modelId: 'gpt-4.1',
      wasProviderPrefixed: true,
    })
  })

  test('strips only the matching explicit provider prefix', ({ assert }) => {
    assert.deepEqual(
      parseModelRef({ modelRef: 'openai/gpt-4.1', explicitProvider: 'openai', knownProviderIds }),
      { providerId: 'openai', modelId: 'gpt-4.1', wasProviderPrefixed: true }
    )
  })

  test('keeps slash-containing model ids when an explicit provider is present', ({ assert }) => {
    assert.deepEqual(
      parseModelRef({
        modelRef: 'minimax/minimax-m2.5:free',
        explicitProvider: 'openrouter',
        knownProviderIds,
      }),
      { providerId: 'openrouter', modelId: 'minimax/minimax-m2.5:free', wasProviderPrefixed: false }
    )
  })

  test('throws unknown provider only when no explicit provider can own the model ref', ({
    assert,
  }) => {
    assert.throws(
      () => parseModelRef({ modelRef: 'unknown/model', knownProviderIds }),
      /Unknown provider: unknown/
    )
  })

  test('rejects an unknown explicit provider', ({ assert }) => {
    assert.throws(
      () => parseModelRef({ modelRef: 'x', explicitProvider: 'nope', knownProviderIds }),
      /Unknown provider: nope/
    )
  })

  test('requires a model id after the provider prefix', ({ assert }) => {
    assert.throws(
      () => parseModelRef({ modelRef: 'openai/', knownProviderIds }),
      /Model id is required for provider: openai/
    )
  })

  test('an empty ref without a provider is rejected', ({ assert }) => {
    assert.throws(
      () => parseModelRef({ knownProviderIds }),
      /A model reference or an explicit provider is required/
    )
  })
})
