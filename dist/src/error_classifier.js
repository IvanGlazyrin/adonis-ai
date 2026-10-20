import { AiException, ProviderUnavailableError } from './errors.js';
const RETRYABLE_STATUS = new Set([408, 409, 425, 429]);
const NETWORK_CODES = new Set([
    'ECONNRESET',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'UND_ERR_SOCKET',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
]);
const FATAL_NAMES = new Set([
    'AI_TypeValidationError',
    'AI_InvalidPromptError',
    'AI_InvalidArgumentError',
    'AI_NoObjectGeneratedError',
    'AI_NoSuchToolError',
    'AI_InvalidToolInputError',
    'AI_JSONParseError',
    'AI_UnsupportedFunctionalityError',
    'AI_LoadAPIKeyError',
    'ZodError',
]);
function statusOf(err) {
    const candidates = [err.statusCode, err.status, err.response?.status, err.cause?.statusCode, err.cause?.status];
    return candidates.find((c) => typeof c === 'number');
}
function codeOf(err) {
    const c = err.code ?? err.cause?.code;
    return typeof c === 'string' ? c : undefined;
}
/**
 * Classifies an error for fallback / circuit-breaker decisions.
 * `abortSignal` is the caller's signal: when it is aborted the failure is the caller's doing.
 */
export function classifyError(error, abortSignal) {
    if (abortSignal?.aborted)
        return { kind: 'fatal', reason: 'aborted by caller' };
    if (error instanceof ProviderUnavailableError) {
        return { kind: 'skip', reason: 'circuit breaker open' };
    }
    if (error instanceof AiException &&
        (error.code === 'E_AI_MISSING_DEPENDENCY' || error.code === 'E_AI_CONFIG_ERROR')) {
        return { kind: 'skip', reason: error.code };
    }
    if (error === null || typeof error !== 'object') {
        return { kind: 'fatal', reason: 'unknown error' };
    }
    const err = error;
    if (err.name === 'AbortError')
        return { kind: 'fatal', reason: 'aborted' };
    if (FATAL_NAMES.has(err.name))
        return { kind: 'fatal', reason: `validation (${err.name})` };
    const status = statusOf(err);
    if (status !== undefined) {
        if (status >= 500 || RETRYABLE_STATUS.has(status)) {
            return { kind: 'retryable', reason: `HTTP ${status}` };
        }
        return { kind: 'fatal', reason: `HTTP ${status}` };
    }
    if (err.name === 'TimeoutError')
        return { kind: 'retryable', reason: 'timeout' };
    const code = codeOf(err);
    if (code && NETWORK_CODES.has(code))
        return { kind: 'retryable', reason: `network (${code})` };
    const message = typeof err.message === 'string' ? err.message : '';
    if (/fetch failed|network|socket hang up|timed? ?out|connection (reset|refused|closed)/i.test(message)) {
        return { kind: 'retryable', reason: 'network' };
    }
    if (err.isRetryable === true)
        return { kind: 'retryable', reason: 'provider marked retryable' };
    return { kind: 'fatal', reason: 'unclassified error' };
}
//# sourceMappingURL=error_classifier.js.map