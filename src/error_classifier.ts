import { AiException, ProviderUnavailableError } from './errors.js'

/**
 * - `retryable`: transient upstream failure; try the next provider and count it against the breaker
 * - `skip`:      this provider cannot serve the request (open breaker, missing package/config);
 *                try the next provider but do not count it against the breaker
 * - `fatal`:     the request itself is wrong or was cancelled; fail immediately, no fallback
 */
export type ErrorKind = 'retryable' | 'skip' | 'fatal'

export interface ErrorClassification {
  kind: ErrorKind
  reason: string
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429])

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
])

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
])

function statusOf(err: Record<string, any>): number | undefined {
  const candidates = [err.statusCode, err.status, err.response?.status, err.cause?.statusCode, err.cause?.status]
  return candidates.find((c): c is number => typeof c === 'number')
}

function codeOf(err: Record<string, any>): string | undefined {
  const c = err.code ?? err.cause?.code
  return typeof c === 'string' ? c : undefined
}

/**
 * Classifies an error for fallback / circuit-breaker decisions.
 * `abortSignal` is the caller's signal: when it is aborted the failure is the caller's doing.
 */
export function classifyError(error: unknown, abortSignal?: AbortSignal): ErrorClassification {
  if (abortSignal?.aborted) return { kind: 'fatal', reason: 'aborted by caller' }

  if (error instanceof ProviderUnavailableError) {
    return { kind: 'skip', reason: 'circuit breaker open' }
  }
  if (
    error instanceof AiException &&
    (error.code === 'E_AI_MISSING_DEPENDENCY' || error.code === 'E_AI_CONFIG_ERROR')
  ) {
    return { kind: 'skip', reason: error.code }
  }

  if (error === null || typeof error !== 'object') {
    return { kind: 'fatal', reason: 'unknown error' }
  }
  const err = error as Record<string, any>

  if (err.name === 'AbortError') return { kind: 'fatal', reason: 'aborted' }
  if (FATAL_NAMES.has(err.name)) return { kind: 'fatal', reason: `validation (${err.name})` }

  const status = statusOf(err)
  if (status !== undefined) {
    if (status >= 500 || RETRYABLE_STATUS.has(status)) {
      return { kind: 'retryable', reason: `HTTP ${status}` }
    }
    return { kind: 'fatal', reason: `HTTP ${status}` }
  }

  if (err.name === 'TimeoutError') return { kind: 'retryable', reason: 'timeout' }

  const code = codeOf(err)
  if (code && NETWORK_CODES.has(code)) return { kind: 'retryable', reason: `network (${code})` }

  const message = typeof err.message === 'string' ? err.message : ''
  if (/fetch failed|network|socket hang up|timed? ?out|connection (reset|refused|closed)/i.test(message)) {
    return { kind: 'retryable', reason: 'network' }
  }

  if (err.isRetryable === true) return { kind: 'retryable', reason: 'provider marked retryable' }

  return { kind: 'fatal', reason: 'unclassified error' }
}

/**
 * Fine-grained taxonomy of an LLM API failure.
 *
 * `ErrorKind` answers "should we fall back to the next provider?".
 * `ErrorClass` answers "what actually went wrong?", which is what belongs in logs,
 * dashboards and user-facing messages.
 */
export type ErrorClass =
  | 'rate_limit' // 429
  | 'overloaded' // 529
  | 'timeout' // 408
  | 'auth_error' // 401, 403
  | 'model_not_found' // 404
  | 'prompt_too_long' // 400 + specific message
  | 'invalid_request' // 400 other
  | 'server_error' // 5xx
  | 'network_error' // connection refused, DNS
  | 'no_output_generated' // AI SDK: model produced no output (transient)
  | 'unknown'

/** Extracts the HTTP status code from an error or from its `cause` chain. */
function classStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    if ('statusCode' in error) {
      const code = (error as { statusCode: unknown }).statusCode
      if (typeof code === 'number') return code
    }
    if ('cause' in error) {
      const cause = (error as { cause: unknown }).cause
      if (cause && typeof cause === 'object' && 'cause' in cause) {
        return classStatusCode(cause)
      }
    }
  }
  return null
}

function classByStatusCode(status: number, error: unknown): ErrorClass {
  if (status === 429) return 'rate_limit'
  if (status === 529) return 'overloaded'
  if (status === 408) return 'timeout'
  if (status === 401 || status === 403) return 'auth_error'
  if (status === 404) return 'model_not_found'
  if (status === 400) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('too long') ||
      message.includes('max_tokens') ||
      message.includes('context length')
    ) {
      return 'prompt_too_long'
    }
    return 'invalid_request'
  }
  if (status >= 500) return 'server_error'
  return 'unknown'
}

/**
 * Classifies an error into the fine-grained {@link ErrorClass} taxonomy.
 */
export function classifyErrorClass(error: unknown): ErrorClass {
  const statusCode = classStatusCode(error)
  if (statusCode !== null) {
    return classByStatusCode(statusCode, error)
  }

  if (error instanceof Error) {
    if (error.name === 'AI_NoOutputGeneratedError' || error.name === 'NoOutputGeneratedError') {
      const message = error.message
      if (message.includes('403') || message.includes('401')) return 'auth_error'
      if (message.includes('429')) return 'rate_limit'
      if (message.includes('500') || message.includes('502') || message.includes('503')) {
        return 'server_error'
      }
      return 'no_output_generated'
    }
    if (
      error.message.includes('fetch failed') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND')
    ) {
      return 'network_error'
    }
    if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) return 'timeout'
    if (error.message.includes('too long') || error.message.includes('context length')) {
      return 'prompt_too_long'
    }
  }

  return 'unknown'
}

const RETRYABLE_ERROR_CLASSES: ReadonlySet<ErrorClass> = new Set([
  'rate_limit',
  'overloaded',
  'timeout',
  'server_error',
  'network_error',
  'prompt_too_long',
  'no_output_generated',
])

/**
 * Whether an error class is transient and therefore eligible for fallback routing.
 */
export function isRetryableError(errorClass: ErrorClass): boolean {
  return RETRYABLE_ERROR_CLASSES.has(errorClass)
}

/**
 * Human-readable message for an error class, safe to show to an operator.
 */
export function getUserFriendlyMessage(errorClass: ErrorClass): string {
  switch (errorClass) {
    case 'rate_limit':
      return 'Rate limited by API provider'
    case 'overloaded':
      return 'API provider overloaded'
    case 'timeout':
      return 'API request timed out'
    case 'auth_error':
      return 'API authentication failed — check API key'
    case 'model_not_found':
      return 'Model not found — check LLM_MODEL config'
    case 'prompt_too_long':
      return 'Context too large for model — consider compaction'
    case 'invalid_request':
      return 'Invalid API request'
    case 'server_error':
      return 'API server error'
    case 'network_error':
      return 'Network error — check connectivity'
    case 'no_output_generated':
      return 'Model produced no output — transient error, will retry'
    default:
      return 'Unknown API error'
  }
}
