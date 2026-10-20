const DEFAULT_CONFIG = {
    basePerAgent: 50_000,
    basePerSession: 200_000,
    maxPerAgent: 75_000,
    maxPerSession: 300_000,
    maxModifierPct: 50,
    minModifierPct: -50,
};
function finiteOr(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
/**
 * Computes dynamic token allocation per agent and session based on context modifiers.
 *
 * The allocator knows nothing about any business domain: all adjustments come from
 * `BudgetRule`s registered via `addRule()` or from explicit `additionalModifiers`.
 */
export class BudgetAllocator {
    config;
    rules = [];
    constructor(config = {}) {
        const minModifierPct = finiteOr(config.minModifierPct, DEFAULT_CONFIG.minModifierPct);
        const maxModifierPct = finiteOr(config.maxModifierPct, DEFAULT_CONFIG.maxModifierPct);
        if (minModifierPct > maxModifierPct) {
            throw new RangeError('[BudgetAllocator] minModifierPct must be <= maxModifierPct');
        }
        this.config = {
            basePerAgent: Math.max(0, finiteOr(config.basePerAgent, DEFAULT_CONFIG.basePerAgent)),
            basePerSession: Math.max(0, finiteOr(config.basePerSession, DEFAULT_CONFIG.basePerSession)),
            maxPerAgent: Math.max(0, finiteOr(config.maxPerAgent, DEFAULT_CONFIG.maxPerAgent)),
            maxPerSession: Math.max(0, finiteOr(config.maxPerSession, DEFAULT_CONFIG.maxPerSession)),
            maxModifierPct,
            minModifierPct,
        };
    }
    addRule(rule) {
        this.rules.push(rule);
        return this;
    }
    compute(ctx = {}, additionalModifiers = []) {
        const modifiers = [];
        const push = (mod) => {
            if (mod && Number.isFinite(mod.pctChange))
                modifiers.push(mod);
        };
        additionalModifiers.forEach(push);
        for (const rule of this.rules) {
            const result = rule.evaluate(ctx);
            if (Array.isArray(result))
                result.forEach(push);
            else
                push(result);
        }
        const rawPct = modifiers.reduce((sum, m) => sum + m.pctChange, 0);
        const totalModifierPct = Math.max(this.config.minModifierPct, Math.min(this.config.maxModifierPct, rawPct));
        const multiplier = 1 + totalModifierPct / 100;
        const perAgent = Math.max(0, Math.min(this.config.maxPerAgent, Math.round(this.config.basePerAgent * multiplier)));
        const perSession = Math.max(0, Math.min(this.config.maxPerSession, Math.round(this.config.basePerSession * multiplier)));
        const reasons = modifiers.map((m) => `${m.factor} (${m.pctChange > 0 ? '+' : ''}${m.pctChange}%)`);
        const cappedSuffix = rawPct > this.config.maxModifierPct
            ? ` → capped at +${this.config.maxModifierPct}%`
            : rawPct < this.config.minModifierPct
                ? ` → capped at ${this.config.minModifierPct}%`
                : '';
        const reason = reasons.length > 0
            ? reasons.join(', ') + cappedSuffix
            : 'base allocation (no modifiers)';
        return { perAgent, perSession, modifiers, totalModifierPct, reason };
    }
}
/** Rule: applies `pctChange` when `ctx[field]` strictly equals `value`. */
export function equalsRule(field, value, pctChange, factor = `${field} = ${String(value)}`) {
    return {
        name: `equals:${field}`,
        evaluate: (ctx) => (ctx[field] === value ? { factor, pctChange } : null),
    };
}
/** Rule: applies `pctChange` when numeric `ctx[field]` is >= `threshold`. */
export function atLeastRule(field, threshold, pctChange, factor = `${field} >= ${threshold}`) {
    return {
        name: `atLeast:${field}`,
        evaluate: (ctx) => {
            const v = ctx[field];
            return typeof v === 'number' && v >= threshold ? { factor, pctChange } : null;
        },
    };
}
/** Rule: applies `pctChange` when numeric `ctx[field]` is < `threshold`. */
export function belowRule(field, threshold, pctChange, factor = `${field} < ${threshold}`) {
    return {
        name: `below:${field}`,
        evaluate: (ctx) => {
            const v = ctx[field];
            return typeof v === 'number' && v < threshold ? { factor, pctChange } : null;
        },
    };
}
//# sourceMappingURL=budget_allocator.js.map