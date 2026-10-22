import { test } from '@japa/runner'
import { CircuitBreaker } from '../../src/circuit_breaker.js'
import { ProviderUnavailableError } from '../../src/errors.js'

const cb = () =>
  new CircuitBreaker({
    failureThreshold: 1,
    recoveryTimeoutMs: 0,
    halfOpenMaxAttempts: 2,
    halfOpenMaxConcurrent: 1,
  })

test.group('CircuitBreaker permits', () => {
  test('half-open lets exactly one probe through', ({ assert }) => {
    const b = cb()
    b.recordFailure('k')
    const p1 = b.acquire('k')
    assert.isTrue(p1!.isProbe)
    assert.isNull(b.acquire('k'))
    p1!.release()
    assert.isNotNull(b.acquire('k'))
  })

  test('a permit settles once', ({ assert }) => {
    const b = cb()
    b.recordFailure('k')
    const p = b.acquire('k')!
    p.success()
    p.success()
    assert.equal(b.getState('k'), 'half_open') // one successful probe out of two
  })

  test('closed permits are not probes and do not block', ({ assert }) => {
    const b = cb()
    const p = b.acquire('k')!
    assert.isFalse(p.isProbe)
    assert.isNotNull(b.acquire('k'))
  })

  test('open breaker yields no permit', ({ assert }) => {
    const b = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 60_000 })
    b.recordFailure('k')
    assert.isNull(b.acquire('k'))
  })

  test('a stale probe permit does not free a slot of a later half-open cycle', ({ assert }) => {
    const b = cb()
    b.recordFailure('k')
    const stale = b.acquire('k')!
    b.recordFailure('k') // probe failed elsewhere: open -> half-open again (zero cooldown)
    const fresh = b.acquire('k')!
    stale.release()
    assert.isNull(b.acquire('k'))
    fresh.release()
    assert.isNotNull(b.acquire('k'))
  })

  test('resetAll closes every key', ({ assert }) => {
    const b = cb()
    b.recordFailure('a')
    b.recordFailure('b')
    b.resetAll()
    assert.deepEqual([b.getState('a'), b.getState('b')], ['closed', 'closed'])
  })

  test('execute keeps its unavailable errors', async ({ assert }) => {
    const b = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 60_000 })
    b.recordFailure('k')
    const err = await b.execute('k', async () => 1).catch((e) => e)
    assert.instanceOf(err, ProviderUnavailableError)
    assert.include(err.message, 'Circuit breaker is OPEN')

    const h = cb()
    h.recordFailure('k')
    const probe = h.acquire('k')!
    const err2 = await h.execute('k', async () => 1).catch((e) => e)
    assert.include(err2.message, 'HALF-OPEN and probe limit is reached')
    probe.release()
  })
})

test.group('CircuitBreaker.execute slot handling', () => {
  test('a throwing isFailure leaves no probe slot taken', async ({ assert }) => {
    const b = cb()
    b.recordFailure('k')
    await assert.rejects(
      () =>
        b.execute(
          'k',
          async () => {
            throw new Error('x')
          },
          () => {
            throw new Error('classifier broke')
          }
        ),
      /classifier broke/
    )
    assert.isNotNull(b.acquire('k'))
  })

  test('execute releases the slot on a non-counted error', async ({ assert }) => {
    const b = cb()
    b.recordFailure('k')
    await assert.rejects(
      () =>
        b.execute(
          'k',
          async () => {
            throw new Error('caller fault')
          },
          () => false
        ),
      /caller fault/
    )
    assert.isNotNull(b.acquire('k'))
  })

  test('permit.failure() in half-open re-opens the breaker', ({ assert }) => {
    const transitions: string[] = []
    const b = new CircuitBreaker({
      failureThreshold: 1,
      recoveryTimeoutMs: 0,
      halfOpenMaxConcurrent: 1,
      onStateChange: (_key, from, to) => void transitions.push(`${from}->${to}`),
    })
    b.recordFailure('k')
    const p = b.acquire('k')!
    assert.isTrue(p.isProbe)
    transitions.length = 0
    p.failure(new Error('still down'))
    assert.deepEqual(transitions, ['half_open->open'])
  })
})
