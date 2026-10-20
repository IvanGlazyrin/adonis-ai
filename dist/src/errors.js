/**
 * Base exception class for all Adonis AI package errors.
 */
export class AiException extends Error {
    code;
    cause;
    constructor(message, code = 'E_AI_ERROR', cause) {
        super(message);
        this.code = code;
        this.cause = cause;
        this.name = 'AiException';
    }
}
/**
 * Thrown when an AI provider is unreachable or circuit breaker is open.
 */
export class ProviderUnavailableError extends AiException {
    provider;
    constructor(provider, reason) {
        super(`AI provider "${provider}" is currently unavailable: ${reason ?? 'Circuit breaker is OPEN'}`, 'E_AI_PROVIDER_UNAVAILABLE');
        this.provider = provider;
        this.name = 'ProviderUnavailableError';
    }
}
/**
 * Thrown when provider configuration is invalid or missing required credentials.
 */
export class ProviderConfigError extends AiException {
    provider;
    constructor(provider, message) {
        super(`Invalid configuration for AI provider "${provider}": ${message}`, 'E_AI_CONFIG_ERROR');
        this.provider = provider;
        this.name = 'ProviderConfigError';
    }
}
/**
 * Thrown when primary provider and all fallback cascade providers fail.
 */
export class CascadingFallbackError extends AiException {
    attempts;
    constructor(attempts) {
        const errorDetails = attempts.map((a) => `[${a.provider}:${a.model}] ${a.error.message}`).join('; ');
        super(`All AI fallback providers failed: ${errorDetails}`, 'E_AI_FALLBACK_FAILED');
        this.attempts = attempts;
        this.name = 'CascadingFallbackError';
    }
}
/**
 * Thrown when token or cost budget thresholds are exceeded.
 */
export class BudgetExceededError extends AiException {
    currentUsage;
    constructor(message, currentUsage) {
        super(message, 'E_AI_BUDGET_EXCEEDED');
        this.currentUsage = currentUsage;
        this.name = 'BudgetExceededError';
    }
}
/**
 * Thrown when a tool execution is rejected by security policy or fails during run.
 */
export class ToolExecutionError extends AiException {
    toolName;
    constructor(toolName, message, cause) {
        super(`Tool execution error for "${toolName}": ${message}`, 'E_AI_TOOL_EXECUTION_ERROR', cause);
        this.toolName = toolName;
        this.name = 'ToolExecutionError';
    }
}
//# sourceMappingURL=errors.js.map