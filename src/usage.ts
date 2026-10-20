import type { TokenUsage } from './types.js'

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export const EMPTY_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
})

/**
 * Normalizes AI SDK usage into `TokenUsage`.
 *
 * Reads the v7 shape (`inputTokens`, `outputTokens`, `inputTokenDetails.cacheReadTokens`,
 * `outputTokenDetails.reasoningTokens`) and falls back to the legacy v4 names
 * (`promptTokens`, `completionTokens`, `cachedInputTokens`, `reasoningTokens`).
 */
export function normalizeUsage(raw: unknown): TokenUsage {
  const u = obj(raw)
  const inputDetails = obj(u.inputTokenDetails)
  const outputDetails = obj(u.outputTokenDetails)

  const inputTokens = num(u.inputTokens) || num(u.promptTokens)
  const outputTokens = num(u.outputTokens) || num(u.completionTokens)
  const cacheReadTokens =
    num(inputDetails.cacheReadTokens) || num(u.cacheReadTokens) || num(u.cachedInputTokens)
  const cacheWriteTokens = num(inputDetails.cacheWriteTokens) || num(u.cacheWriteTokens)
  const reasoningTokens = num(outputDetails.reasoningTokens) || num(u.reasoningTokens)
  const totalTokens = num(u.totalTokens) || inputTokens + outputTokens

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
  }
}

/** Sums usage over several steps (used when a stream is aborted before the final total exists). */
export function sumUsage(items: unknown[]): TokenUsage {
  const total = { ...EMPTY_USAGE }
  for (const item of items) {
    const u = normalizeUsage(item)
    total.inputTokens += u.inputTokens
    total.outputTokens += u.outputTokens
    total.totalTokens += u.totalTokens
    total.cacheReadTokens += u.cacheReadTokens
    total.cacheWriteTokens += u.cacheWriteTokens
    total.reasoningTokens += u.reasoningTokens
  }
  total.promptTokens = total.inputTokens
  total.completionTokens = total.outputTokens
  return total
}
