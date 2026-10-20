import type { BudgetAllocation, BudgetModifier } from './types.js'

/**
 * A domain-agnostic rule that inspects a caller-defined context and optionally
 * returns one or more budget modifiers (positive = more tokens, negative = fewer).
 */
export interface BudgetRule<TCtx = Record<string, unknown>> {
  name: string
  evaluate: (ctx: TCtx) => BudgetModifier | BudgetModifier[] | null | undefined
}

export interface BudgetAllocatorConfig {
  basePerAgent?: number
  basePerSession?: number
  maxPerAgent?: number
  maxPerSession?: number
  maxModifierPct?: number
  minModifierPct?: number
}

const DEFAULT_CONFIG: Required<BudgetAllocatorConfig> = {
  basePerAgent: 50_000,
  basePerSession: 200_000,
  maxPerAgent: 75_000,
  maxPerSession: 300_000,
  maxModifierPct: 50,
  minModifierPct: -50,
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Computes dynamic token allocation per agent and session based on context modifiers.
 *
 * The allocator knows nothing about any business domain: all adjustments come from
 * `BudgetRule`s registered via `addRule()` or from explicit `additionalModifiers`.
 */
export class BudgetAllocator<TCtx extends Record<string, unknown> = Record<string, unknown>> {
  private config: Required<BudgetAllocatorConfig>
  private rules: BudgetRule<TCtx>[] = []

  constructor(config: BudgetAllocatorConfig = {}) {
    const minModifierPct = finiteOr(config.minModifierPct, DEFAULT_CONFIG.minModifierPct)
    const maxModifierPct = finiteOr(config.maxModifierPct, DEFAULT_CONFIG.maxModifierPct)
    if (minModifierPct > maxModifierPct) {
      throw new RangeError('[BudgetAllocator] minModifierPct must be <= maxModifierPct')
    }

    this.config = {
      basePerAgent: Math.max(0, finiteOr(config.basePerAgent, DEFAULT_CONFIG.basePerAgent)),
      basePerSession: Math.max(0, finiteOr(config.basePerSession, DEFAULT_CONFIG.basePerSession)),
      maxPerAgent: Math.max(0, finiteOr(config.maxPerAgent, DEFAULT_CONFIG.maxPerAgent)),
      maxPerSession: Math.max(0, finiteOr(config.maxPerSession, DEFAULT_CONFIG.maxPerSession)),
      maxModifierPct,
      minModifierPct,
    }
  }

  addRule(rule: BudgetRule<TCtx>): this {
    this.rules.push(rule)
    return this
  }

  compute(ctx: TCtx = {} as TCtx, additionalModifiers: BudgetModifier[] = []): BudgetAllocation {
    const modifiers: BudgetModifier[] = []
    const push = (mod: BudgetModifier | null | undefined) => {
      if (mod && Number.isFinite(mod.pctChange)) modifiers.push(mod)
    }

    additionalModifiers.forEach(push)
    for (const rule of this.rules) {
      const result = rule.evaluate(ctx)
      if (Array.isArray(result)) result.forEach(push)
      else push(result)
    }

    const rawPct = modifiers.reduce((sum, m) => sum + m.pctChange, 0)
    const totalModifierPct = Math.max(
      this.config.minModifierPct,
      Math.min(this.config.maxModifierPct, rawPct)
    )
    const multiplier = 1 + totalModifierPct / 100

    const perAgent = Math.max(
      0,
      Math.min(this.config.maxPerAgent, Math.round(this.config.basePerAgent * multiplier))
    )
    const perSession = Math.max(
      0,
      Math.min(this.config.maxPerSession, Math.round(this.config.basePerSession * multiplier))
    )

    const reasons = modifiers.map(
      (m) => `${m.factor} (${m.pctChange > 0 ? '+' : ''}${m.pctChange}%)`
    )

    const cappedSuffix =
      rawPct > this.config.maxModifierPct
        ? ` → capped at +${this.config.maxModifierPct}%`
        : rawPct < this.config.minModifierPct
          ? ` → capped at ${this.config.minModifierPct}%`
          : ''

    const reason =
      reasons.length > 0
        ? reasons.join(', ') + cappedSuffix
        : 'base allocation (no modifiers)'

    return { perAgent, perSession, modifiers, totalModifierPct, reason }
  }
}

/** Rule: applies `pctChange` when `ctx[field]` strictly equals `value`. */
export function equalsRule<TCtx extends Record<string, unknown>>(
  field: keyof TCtx & string,
  value: unknown,
  pctChange: number,
  factor: string = `${field} = ${String(value)}`
): BudgetRule<TCtx> {
  return {
    name: `equals:${field}`,
    evaluate: (ctx) => (ctx[field] === value ? { factor, pctChange } : null),
  }
}

/** Rule: applies `pctChange` when numeric `ctx[field]` is >= `threshold`. */
export function atLeastRule<TCtx extends Record<string, unknown>>(
  field: keyof TCtx & string,
  threshold: number,
  pctChange: number,
  factor: string = `${field} >= ${threshold}`
): BudgetRule<TCtx> {
  return {
    name: `atLeast:${field}`,
    evaluate: (ctx) => {
      const v = ctx[field]
      return typeof v === 'number' && v >= threshold ? { factor, pctChange } : null
    },
  }
}

/** Rule: applies `pctChange` when numeric `ctx[field]` is < `threshold`. */
export function belowRule<TCtx extends Record<string, unknown>>(
  field: keyof TCtx & string,
  threshold: number,
  pctChange: number,
  factor: string = `${field} < ${threshold}`
): BudgetRule<TCtx> {
  return {
    name: `below:${field}`,
    evaluate: (ctx) => {
      const v = ctx[field]
      return typeof v === 'number' && v < threshold ? { factor, pctChange } : null
    },
  }
}
