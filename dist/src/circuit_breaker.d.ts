import type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStats } from './types.js';
/**
 * Resilient Circuit Breaker to prevent cascading failures of upstream LLM APIs.
 * Supports CLOSED, OPEN, and HALF_OPEN state transitions.
 *
 * State is tracked per breaker key. `AiManager` uses `provider:model`, so one misbehaving model
 * does not take the whole provider down. A plain provider name works as a key too.
 */
export declare class CircuitBreaker {
    private stats;
    private failureThreshold;
    private recoveryTimeoutMs;
    private halfOpenMaxAttempts;
    private halfOpenMaxConcurrent;
    private onStateChange?;
    constructor(config?: CircuitBreakerConfig);
    private getOrInitStats;
    getState(key: string): CircuitBreakerState;
    /** Non-acquiring availability check (a half-open breaker is available while probe slots remain). */
    isAvailable(key: string): boolean;
    /**
     * Runs `action` through the breaker.
     *
     * `isFailure` decides whether a thrown error counts against the breaker; errors that are the
     * caller's fault (bad request, abort, validation) should not trip it.
     */
    execute<T>(key: string, action: () => Promise<T>, isFailure?: (error: unknown) => boolean): Promise<T>;
    recordSuccess(key: string): void;
    recordFailure(key: string, _error?: unknown): void;
    reset(key: string): void;
    getStats(key: string): CircuitBreakerStats;
    getAllStats(): Record<string, CircuitBreakerStats>;
    /**
     * Moves to OPEN with a fresh counter set. All state is written BEFORE the user callback runs,
     * so a throwing `onStateChange` can never leave the breaker without a cooldown deadline.
     */
    private open;
    private transition;
}
//# sourceMappingURL=circuit_breaker.d.ts.map