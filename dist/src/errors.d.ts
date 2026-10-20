/**
 * Base exception class for all Adonis AI package errors.
 */
export declare class AiException extends Error {
    code: string;
    cause?: unknown | undefined;
    constructor(message: string, code?: string, cause?: unknown | undefined);
}
/**
 * Thrown when an AI provider is unreachable or circuit breaker is open.
 */
export declare class ProviderUnavailableError extends AiException {
    provider: string;
    constructor(provider: string, reason?: string);
}
/**
 * Thrown when provider configuration is invalid or missing required credentials.
 */
export declare class ProviderConfigError extends AiException {
    provider: string;
    constructor(provider: string, message: string);
}
/**
 * Thrown when primary provider and all fallback cascade providers fail.
 */
export declare class CascadingFallbackError extends AiException {
    attempts: Array<{
        provider: string;
        model: string;
        error: Error;
    }>;
    constructor(attempts: Array<{
        provider: string;
        model: string;
        error: Error;
    }>);
}
/**
 * Thrown when token or cost budget thresholds are exceeded.
 */
export declare class BudgetExceededError extends AiException {
    currentUsage?: unknown | undefined;
    constructor(message: string, currentUsage?: unknown | undefined);
}
/**
 * Thrown when a tool execution is rejected by security policy or fails during run.
 */
export declare class ToolExecutionError extends AiException {
    toolName: string;
    constructor(toolName: string, message: string, cause?: unknown);
}
//# sourceMappingURL=errors.d.ts.map