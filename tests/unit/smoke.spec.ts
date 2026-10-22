import { test } from '@japa/runner'
import { CircuitBreaker } from '../../src/circuit_breaker.js'

test('ts sources run under japa', ({ assert }) => {
  assert.equal(new CircuitBreaker().getState('k'), 'closed')
})
