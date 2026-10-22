import { test } from '@japa/runner'
import { breakerKeyFor, modelKeyFor } from '../../../src/models/keys.js'

test.group('model keys', () => {
  test('model key is provider/model', ({ assert }) => {
    assert.equal(modelKeyFor({ providerID: 'openai', modelID: 'gpt-4.1' }), 'openai/gpt-4.1')
    assert.equal(
      modelKeyFor({ providerID: 'openrouter', modelID: 'openrouter/hunter-alpha' }),
      'openrouter/openrouter/hunter-alpha'
    )
  })

  test('breaker key is the credential key when present', ({ assert }) => {
    assert.equal(
      breakerKeyFor({ providerID: 'openai', modelID: 'gpt-4o', credentialKey: 'key:7' }),
      'key:7'
    )
  })

  test('breaker key falls back to the model key without a credential key', ({ assert }) => {
    assert.equal(breakerKeyFor({ providerID: 'openai', modelID: 'gpt-4o' }), 'openai/gpt-4o')
  })

  test('breaker key prefers a non-empty credential', ({ assert }) => {
    assert.equal(breakerKeyFor({ providerID: 'p', modelID: 'm', credentialKey: 'key:1' }), 'key:1')
    assert.equal(breakerKeyFor({ providerID: 'p', modelID: 'm', credentialKey: '' }), 'p/m')
  })
})
