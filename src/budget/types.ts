export type { Logger } from '../logger.js'

export interface ModelPricing {
  /** Price in USD per 1M input tokens (non-cached input) */
  input: number
  /** Price in USD per 1M output tokens (reasoning tokens included unless `reasoningCostPer1M` is set) */
  output: number
  /**
   * Price in USD per 1M cached-read input tokens.
   * When omitted, cached reads are billed at the regular `input` price (conservative).
   */
  cacheReadCostPer1M?: number
  /**
   * Price in USD per 1M cache-write input tokens.
   * When omitted, cache writes are billed at the regular `input` price (conservative).
   */
  cacheWriteCostPer1M?: number
  /**
   * Price in USD per 1M reasoning tokens, when a provider bills them separately from output.
   * When omitted, reasoning tokens are billed at the `output` price.
   */
  reasoningCostPer1M?: number
  /** @deprecated Use `cacheReadCostPer1M`. */
  cacheRead?: number
  /** @deprecated Use `cacheWriteCostPer1M`. */
  cacheWrite?: number
}

/**
 * Token breakdown used for cost calculation.
 *
 * Follows the AI SDK convention: `inputTokens` is the TOTAL input (cached tokens included)
 * and `outputTokens` is the TOTAL output (reasoning tokens included).
 */
export interface TokenUsageDetails {
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export interface AgentCostRecord {
  agentName: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  totalTokens: number
  durationMs: number
  costUsd: number
  timestamp: number
  metadata?: Record<string, unknown>
}

export interface AgentCostSummary {
  tokens: number
  cost: number
  calls: number
  avgDurationMs: number
  totalDurationMs: number
}

export interface BudgetModifier {
  factor: string
  pctChange: number
}

export interface BudgetAllocation {
  perAgent: number
  perSession: number
  modifiers: BudgetModifier[]
  totalModifierPct: number
  reason: string
}

export interface BudgetEnforcerOptions {
  perAgentMaxTokens?: number
  perSessionMaxTokens?: number
  perAgentMaxCostUsd?: number
  perSessionMaxCostUsd?: number
}

export interface BudgetSummary {
  sessionTokensUsed: number
  sessionMaxTokens: number
  sessionCostUsd: number
  sessionMaxCostUsd: number
  agentUsage: Record<string, { tokens: number; costUsd: number }>
}
