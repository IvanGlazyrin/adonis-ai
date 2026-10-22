import { test } from '@japa/runner'
import { PROTOCOL_TO_NPM, resolveProviderNpm } from '../../../src/models/protocols.js'

test.group('resolveProviderNpm', () => {
  test('keeps an explicit npm package before protocol fallback', ({ assert }) => {
    assert.equal(
      resolveProviderNpm({ npmPackage: '@custom/provider', protocol: 'openai' }),
      '@custom/provider'
    )
  })

  test('derives npm package from provider protocol', ({ assert }) => {
    assert.equal(resolveProviderNpm({ npmPackage: null, protocol: 'openai' }), '@ai-sdk/openai')
  })

  test('throws a clear error for unsupported provider protocol', ({ assert }) => {
    assert.throws(
      () => resolveProviderNpm({ npmPackage: null, protocol: 'unknown-protocol' }),
      /Unsupported provider protocol: unknown-protocol/
    )
  })

  test('throws with "unknown" when neither is given', ({ assert }) => {
    assert.throws(() => resolveProviderNpm({}), /Unsupported provider protocol: unknown/)
  })

  test('protocol table has 22 entries', ({ assert }) => {
    assert.lengthOf(Object.keys(PROTOCOL_TO_NPM), 22)
    assert.equal(PROTOCOL_TO_NPM['vertex-anthropic'], '@ai-sdk/google-vertex/anthropic')
  })
})
