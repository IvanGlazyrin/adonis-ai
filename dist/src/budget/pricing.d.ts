import type { ModelPricing, TokenUsageDetails } from './types.js';
/**
 * Default pricing catalog for popular LLM models (USD per 1M tokens).
 *
 * Prices drift: treat this table as a fallback and prefer `CostTracker.setPricing()` /
 * `registerPricingLoader()` (e.g. backed by models.dev) for authoritative values.
 */
export declare const DEFAULT_MODEL_PRICING: Readonly<Record<string, ModelPricing>>;
/**
 * Extracts normalized model name (removes provider prefix like 'openai/gpt-4o' -> 'gpt-4o').
 */
export declare function normalizeModelName(model: string): string;
/**
 * Candidate pricing keys for a model id, from most to least specific:
 * `claude-3-7-sonnet-20250219` -> `claude-3-7-sonnet`, `gpt-4o-2024-08-06` -> `gpt-4o`,
 * `claude-3-7-sonnet-latest` -> `claude-3-7-sonnet`.
 */
export declare function pricingKeyCandidates(model: string): string[];
/**
 * Looks up pricing in `table`, tolerating dated/`-latest` variants of a known model.
 * Uses own-property lookups only, so keys like `__proto__` or `constructor` never match.
 */
export declare function lookupPricing(model: string, table: ReadonlyMap<string, ModelPricing> | Readonly<Record<string, ModelPricing>>): ModelPricing | undefined;
/** Coerces untrusted numbers (NaN, Infinity, negatives, non-numbers) to a safe non-negative value. */
export declare function toSafeTokens(value: unknown): number;
/**
 * Computes USD cost for a call.
 *
 * `inputTokens` is the total input (cache reads/writes included) and `outputTokens` is the total
 * output (reasoning included), matching the AI SDK usage convention. Cached tokens are billed at
 * their dedicated rates and removed from the regular input charge; reasoning tokens are billed at
 * `reasoningCostPer1M` when set, otherwise at the output rate.
 */
export declare function computeCost(pricing: ModelPricing, inputTokens: number, outputTokens: number, details?: TokenUsageDetails): number;
//# sourceMappingURL=pricing.d.ts.map