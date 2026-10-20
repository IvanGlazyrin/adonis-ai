/**
 * - `retryable`: transient upstream failure; try the next provider and count it against the breaker
 * - `skip`:      this provider cannot serve the request (open breaker, missing package/config);
 *                try the next provider but do not count it against the breaker
 * - `fatal`:     the request itself is wrong or was cancelled; fail immediately, no fallback
 */
export type ErrorKind = 'retryable' | 'skip' | 'fatal';
export interface ErrorClassification {
    kind: ErrorKind;
    reason: string;
}
/**
 * Classifies an error for fallback / circuit-breaker decisions.
 * `abortSignal` is the caller's signal: when it is aborted the failure is the caller's doing.
 */
export declare function classifyError(error: unknown, abortSignal?: AbortSignal): ErrorClassification;
//# sourceMappingURL=error_classifier.d.ts.map