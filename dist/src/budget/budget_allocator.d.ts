import type { BudgetAllocation, BudgetModifier } from './types.js';
/**
 * A domain-agnostic rule that inspects a caller-defined context and optionally
 * returns one or more budget modifiers (positive = more tokens, negative = fewer).
 */
export interface BudgetRule<TCtx = Record<string, unknown>> {
    name: string;
    evaluate: (ctx: TCtx) => BudgetModifier | BudgetModifier[] | null | undefined;
}
export interface BudgetAllocatorConfig {
    basePerAgent?: number;
    basePerSession?: number;
    maxPerAgent?: number;
    maxPerSession?: number;
    maxModifierPct?: number;
    minModifierPct?: number;
}
/**
 * Computes dynamic token allocation per agent and session based on context modifiers.
 *
 * The allocator knows nothing about any business domain: all adjustments come from
 * `BudgetRule`s registered via `addRule()` or from explicit `additionalModifiers`.
 */
export declare class BudgetAllocator<TCtx extends Record<string, unknown> = Record<string, unknown>> {
    private config;
    private rules;
    constructor(config?: BudgetAllocatorConfig);
    addRule(rule: BudgetRule<TCtx>): this;
    compute(ctx?: TCtx, additionalModifiers?: BudgetModifier[]): BudgetAllocation;
}
/** Rule: applies `pctChange` when `ctx[field]` strictly equals `value`. */
export declare function equalsRule<TCtx extends Record<string, unknown>>(field: keyof TCtx & string, value: unknown, pctChange: number, factor?: string): BudgetRule<TCtx>;
/** Rule: applies `pctChange` when numeric `ctx[field]` is >= `threshold`. */
export declare function atLeastRule<TCtx extends Record<string, unknown>>(field: keyof TCtx & string, threshold: number, pctChange: number, factor?: string): BudgetRule<TCtx>;
/** Rule: applies `pctChange` when numeric `ctx[field]` is < `threshold`. */
export declare function belowRule<TCtx extends Record<string, unknown>>(field: keyof TCtx & string, threshold: number, pctChange: number, factor?: string): BudgetRule<TCtx>;
//# sourceMappingURL=budget_allocator.d.ts.map