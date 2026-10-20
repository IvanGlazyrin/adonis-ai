import type { AgentCostRecord, AgentCostSummary, Logger, ModelPricing, TokenUsageDetails } from './types.js';
export interface CostTrackerOptions {
    pricing?: Record<string, ModelPricing>;
    logger?: Logger;
    pricingLoader?: () => Promise<Record<string, ModelPricing>>;
    /**
     * Maximum number of individual records kept in memory (oldest are evicted first).
     * Aggregates (totals, per-agent, per-model) are maintained incrementally and are NOT
     * affected by eviction. Use `0` to keep aggregates only.
     * Default: 10_000
     */
    maxRecords?: number;
    /**
     * Called synchronously for every recorded entry, e.g. to persist it to a database.
     * Errors thrown by the sink are logged and never break the caller.
     */
    sink?: (record: AgentCostRecord) => void;
}
/**
 * Tracks token usage and monetary cost per agent, model, and session.
 * Provides aggregations and logging without framework dependencies.
 *
 * All keyed state uses `Map`, so agent/model names such as `__proto__` or `constructor`
 * cannot pollute prototypes. Memory is bounded by `maxRecords`.
 */
export declare class CostTracker {
    private ring;
    private ringStart;
    private ringSize;
    private maxRecords;
    private sink?;
    private byAgent;
    private byModel;
    private total;
    private customPricing;
    private defaultPricing;
    private warnedModels;
    private logger?;
    private pricingLoader?;
    constructor(opts?: CostTrackerOptions);
    setLogger(logger: Logger): void;
    setPricing(pricing: Record<string, ModelPricing>): void;
    registerPricingLoader(loader: () => Promise<Record<string, ModelPricing>>): void;
    loadPricing(): Promise<void>;
    /**
     * Backwards-compatible initialization alias.
     */
    initFromCatalog(): Promise<void>;
    record(entry: Omit<AgentCostRecord, 'costUsd' | 'timestamp'>): number;
    /**
     * Cost in USD. `inputTokens` is the total input (cached included), `outputTokens` the total
     * output (reasoning included); `details` carves cache/reasoning tokens out at their own rates.
     */
    calculateCost(model: string, inputTokens: number, outputTokens: number, details?: TokenUsageDetails): number;
    getByAgent(): Record<string, AgentCostSummary>;
    getByModel(): Record<string, {
        tokens: number;
        cost: number;
        calls: number;
    }>;
    getTotalCost(): number;
    getTotalTokens(): number;
    getTotalCalls(): number;
    /** Most recent records (at most `maxRecords`), oldest first. */
    getRecords(): readonly AgentCostRecord[];
    reset(): void;
    toLogString(): string;
    private aggregate;
    private store;
}
//# sourceMappingURL=cost_tracker.d.ts.map