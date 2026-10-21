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
/**
 * Fine-grained taxonomy of an LLM API failure.
 *
 * `ErrorKind` answers "should we fall back to the next provider?".
 * `ErrorClass` answers "what actually went wrong?", which is what belongs in logs,
 * dashboards and user-facing messages.
 */
export type ErrorClass = 'rate_limit' | 'overloaded' | 'timeout' | 'auth_error' | 'model_not_found' | 'prompt_too_long' | 'invalid_request' | 'server_error' | 'network_error' | 'no_output_generated' | 'unknown';
/**
 * Classifies an error into the fine-grained {@link ErrorClass} taxonomy.
 */
export declare function classifyErrorClass(error: unknown): ErrorClass;
/**
 * Whether an error class is transient and therefore eligible for fallback routing.
 */
export declare function isRetryableError(errorClass: ErrorClass): boolean;
/**
 * Human-readable message for an error class, safe to show to an operator.
 */
export declare function getUserFriendlyMessage(errorClass: ErrorClass): string;
//# sourceMappingURL=error_classifier.d.ts.map