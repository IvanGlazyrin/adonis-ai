import { ProviderUnavailableError } from './errors.js'
import type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from './types.js'

interface InternalStats {
  state: CircuitBreakerState
  failures: number
  successes: number
  inFlightProbes: number
  lastFailureTime: number | null
  nextAttemptAllowedAt: number | null
}

/**
 * Resilient Circuit Breaker to prevent cascading failures of upstream LLM APIs.
 * Supports CLOSED, OPEN, and HALF_OPEN state transitions.
 *
 * State is tracked per breaker key. `AiManager` uses `provider:model`, so one misbehaving model
 * does not take the whole provider down. A plain provider name works as a key too.
 */
export class CircuitBreaker {
  private stats: Map<string, InternalStats> = new Map()
  private failureThreshold: number
  private recoveryTimeoutMs: number
  private halfOpenMaxAttempts: number
  private halfOpenMaxConcurrent: number
  private onStateChange?: (key: string, from: CircuitBreakerState, to: CircuitBreakerState) => void

  constructor(config: CircuitBreakerConfig = {}) {
    this.failureThreshold = Math.max(1, config.failureThreshold ?? 5)
    this.recoveryTimeoutMs = Math.max(0, config.recoveryTimeoutMs ?? 30_000)
    this.halfOpenMaxAttempts = Math.max(1, config.halfOpenMaxAttempts ?? 2)
    this.halfOpenMaxConcurrent = Math.max(1, config.halfOpenMaxConcurrent ?? 1)
    this.onStateChange = config.onStateChange
  }

  private getOrInitStats(key: string): InternalStats {
    let s = this.stats.get(key)
    if (!s) {
      s = {
        state: 'closed',
        failures: 0,
        successes: 0,
        inFlightProbes: 0,
        lastFailureTime: null,
        nextAttemptAllowedAt: null,
      }
      this.stats.set(key, s)
    }
    return s
  }

  getState(key: string): CircuitBreakerState {
    const s = this.getOrInitStats(key)
    if (s.state === 'open' && s.nextAttemptAllowedAt !== null && Date.now() >= s.nextAttemptAllowedAt) {
      this.transition(key, s, 'half_open')
    }
    return s.state
  }

  /** Non-acquiring availability check (a half-open breaker is available while probe slots remain). */
  isAvailable(key: string): boolean {
    const state = this.getState(key)
    if (state === 'closed') return true
    if (state === 'half_open') {
      return this.getOrInitStats(key).inFlightProbes < this.halfOpenMaxConcurrent
    }
    return false
  }

  /**
   * Runs `action` through the breaker.
   *
   * `isFailure` decides whether a thrown error counts against the breaker; errors that are the
   * caller's fault (bad request, abort, validation) should not trip it.
   */
  async execute<T>(
    key: string,
    action: () => Promise<T>,
    isFailure: (error: unknown) => boolean = () => true
  ): Promise<T> {
    const s = this.getOrInitStats(key)
    const state = this.getState(key)

    if (state === 'open') {
      const remainingMs = s.nextAttemptAllowedAt
        ? Math.max(0, s.nextAttemptAllowedAt - Date.now())
        : this.recoveryTimeoutMs
      throw new ProviderUnavailableError(
        key,
        `Circuit breaker is OPEN. Cooldown remaining: ${Math.ceil(remainingMs / 1000)}s`
      )
    }

    const isProbe = state === 'half_open'
    if (isProbe) {
      if (s.inFlightProbes >= this.halfOpenMaxConcurrent) {
        throw new ProviderUnavailableError(key, 'Circuit breaker is HALF-OPEN and probe limit is reached')
      }
      s.inFlightProbes++
    }

    try {
      const result = await action()
      this.recordSuccess(key)
      return result
    } catch (error) {
      if (isFailure(error)) {
        this.recordFailure(key, error)
      }
      throw error
    } finally {
      if (isProbe) s.inFlightProbes = Math.max(0, s.inFlightProbes - 1)
    }
  }

  recordSuccess(key: string): void {
    const s = this.getOrInitStats(key)
    if (s.state === 'half_open') {
      s.successes++
      if (s.successes >= this.halfOpenMaxAttempts) {
        s.failures = 0
        s.successes = 0
        s.lastFailureTime = null
        s.nextAttemptAllowedAt = null
        this.transition(key, s, 'closed')
      }
    } else if (s.state === 'closed') {
      s.failures = 0
    }
  }

  recordFailure(key: string, _error?: unknown): void {
    const s = this.getOrInitStats(key)
    s.lastFailureTime = Date.now()

    if (s.state === 'closed') {
      s.failures++
      if (s.failures >= this.failureThreshold) {
        this.open(key, s)
      }
    } else if (s.state === 'half_open') {
      this.open(key, s)
    }
  }

  reset(key: string): void {
    const s = this.getOrInitStats(key)
    const prev = s.state
    s.failures = 0
    s.successes = 0
    s.inFlightProbes = 0
    s.lastFailureTime = null
    s.nextAttemptAllowedAt = null
    this.transition(key, s, 'closed', prev)
  }

  getStats(key: string): CircuitBreakerStats {
    const s = this.getOrInitStats(key)
    const state = this.getState(key)
    return {
      state,
      failures: s.failures,
      successes: s.successes,
      lastFailureTime: s.lastFailureTime,
      nextAttemptAllowedAt: s.nextAttemptAllowedAt,
    }
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    return Object.fromEntries([...this.stats.keys()].map((key) => [key, this.getStats(key)]))
  }

  /**
   * Moves to OPEN with a fresh counter set. All state is written BEFORE the user callback runs,
   * so a throwing `onStateChange` can never leave the breaker without a cooldown deadline.
   */
  private open(key: string, s: InternalStats): void {
    s.successes = 0
    s.inFlightProbes = 0
    s.nextAttemptAllowedAt = Date.now() + this.recoveryTimeoutMs
    this.transition(key, s, 'open')
  }

  private transition(
    key: string,
    stats: InternalStats,
    to: CircuitBreakerState,
    from: CircuitBreakerState = stats.state
  ): void {
    if (from === to) return
    stats.state = to
    if (to === 'half_open') {
      stats.successes = 0
      stats.inFlightProbes = 0
    }
    try {
      this.onStateChange?.(key, from, to)
    } catch {
      // A faulty observer must not break request handling or leave the breaker inconsistent.
    }
  }
}
