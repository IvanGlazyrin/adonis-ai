import { DEFAULT_MODEL_PRICING, computeCost, lookupPricing, normalizeModelName, toSafeTokens, } from './pricing.js';
const DEFAULT_MAX_RECORDS = 10_000;
const MAX_WARNED_MODELS = 1_000;
function newAggregate() {
    return { tokens: 0, cost: 0, calls: 0, totalDurationMs: 0 };
}
function addTo(agg, record) {
    agg.tokens += record.totalTokens;
    agg.cost += record.costUsd;
    agg.calls += 1;
    agg.totalDurationMs += record.durationMs;
}
/**
 * Tracks token usage and monetary cost per agent, model, and session.
 * Provides aggregations and logging without framework dependencies.
 *
 * All keyed state uses `Map`, so agent/model names such as `__proto__` or `constructor`
 * cannot pollute prototypes. Memory is bounded by `maxRecords`.
 */
export class CostTracker {
    ring = [];
    ringStart = 0;
    ringSize = 0;
    maxRecords;
    sink;
    byAgent = new Map();
    byModel = new Map();
    total = newAggregate();
    customPricing = new Map();
    defaultPricing = new Map(Object.entries(DEFAULT_MODEL_PRICING));
    warnedModels = new Set();
    logger;
    pricingLoader;
    constructor(opts = {}) {
        const max = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
        if (!Number.isInteger(max) || max < 0) {
            throw new RangeError(`[CostTracker] maxRecords must be a non-negative integer, got ${max}`);
        }
        this.maxRecords = max;
        this.sink = opts.sink;
        if (opts.pricing) {
            this.setPricing(opts.pricing);
        }
        this.logger = opts.logger;
        this.pricingLoader = opts.pricingLoader;
    }
    setLogger(logger) {
        this.logger = logger;
    }
    setPricing(pricing) {
        for (const [model, price] of Object.entries(pricing)) {
            this.customPricing.set(model, price);
        }
    }
    registerPricingLoader(loader) {
        this.pricingLoader = loader;
    }
    async loadPricing() {
        if (!this.pricingLoader)
            return;
        try {
            const loaded = await this.pricingLoader();
            this.setPricing(loaded);
        }
        catch (err) {
            this.logger?.warn?.('[CostTracker] Failed to load dynamic pricing:', err);
        }
    }
    /**
     * Backwards-compatible initialization alias.
     */
    async initFromCatalog() {
        return this.loadPricing();
    }
    record(entry) {
        const inputTokens = toSafeTokens(entry.inputTokens);
        const outputTokens = toSafeTokens(entry.outputTokens);
        const details = {
            cacheReadTokens: toSafeTokens(entry.cacheReadTokens),
            cacheWriteTokens: toSafeTokens(entry.cacheWriteTokens),
            reasoningTokens: toSafeTokens(entry.reasoningTokens),
        };
        const costUsd = this.calculateCost(entry.model, inputTokens, outputTokens, details);
        const record = {
            ...entry,
            agentName: String(entry.agentName || 'unknown'),
            inputTokens,
            outputTokens,
            cacheReadTokens: details.cacheReadTokens,
            cacheWriteTokens: details.cacheWriteTokens,
            reasoningTokens: details.reasoningTokens,
            totalTokens: toSafeTokens(entry.totalTokens) || inputTokens + outputTokens,
            durationMs: toSafeTokens(entry.durationMs),
            costUsd,
            timestamp: Date.now(),
        };
        this.aggregate(record);
        this.store(record);
        if (this.sink) {
            try {
                this.sink(record);
            }
            catch (err) {
                this.logger?.warn?.('[CostTracker] Sink failed:', err);
            }
        }
        return costUsd;
    }
    /**
     * Cost in USD. `inputTokens` is the total input (cached included), `outputTokens` the total
     * output (reasoning included); `details` carves cache/reasoning tokens out at their own rates.
     */
    calculateCost(model, inputTokens, outputTokens, details = {}) {
        const pricing = lookupPricing(model, this.customPricing) ?? lookupPricing(model, this.defaultPricing);
        if (!pricing) {
            const shortModel = normalizeModelName(model);
            if (!this.warnedModels.has(shortModel) && this.warnedModels.size < MAX_WARNED_MODELS) {
                this.warnedModels.add(shortModel);
                this.logger?.warn?.(`[CostTracker] Unknown model "${shortModel}" (full: "${model}"). Cost tracking will report $0. Consider configuring pricing.`);
            }
            return 0;
        }
        return computeCost(pricing, inputTokens, outputTokens, details);
    }
    getByAgent() {
        return Object.fromEntries([...this.byAgent].map(([name, v]) => [
            name,
            {
                tokens: v.tokens,
                cost: v.cost,
                calls: v.calls,
                avgDurationMs: v.calls > 0 ? Math.round(v.totalDurationMs / v.calls) : 0,
                totalDurationMs: v.totalDurationMs,
            },
        ]));
    }
    getByModel() {
        return Object.fromEntries([...this.byModel].map(([model, v]) => [
            model,
            { tokens: v.tokens, cost: v.cost, calls: v.calls },
        ]));
    }
    getTotalCost() {
        return this.total.cost;
    }
    getTotalTokens() {
        return this.total.tokens;
    }
    getTotalCalls() {
        return this.total.calls;
    }
    /** Most recent records (at most `maxRecords`), oldest first. */
    getRecords() {
        const out = [];
        for (let i = 0; i < this.ringSize; i++) {
            out.push(this.ring[(this.ringStart + i) % this.maxRecords]);
        }
        return out;
    }
    reset() {
        this.ring = [];
        this.ringStart = 0;
        this.ringSize = 0;
        this.byAgent.clear();
        this.byModel.clear();
        this.total = newAggregate();
        this.warnedModels.clear();
    }
    toLogString() {
        const byAgent = this.getByAgent();
        const lines = Object.entries(byAgent).map(([name, { tokens, cost, calls, avgDurationMs }]) => `  ${name}: ${calls} calls, ${tokens} tokens, $${cost.toFixed(4)}, avg ${avgDurationMs}ms`);
        lines.push(`  TOTAL: ${this.total.calls} calls, ${this.getTotalTokens()} tokens, $${this.getTotalCost().toFixed(4)}`);
        return lines.join('\n');
    }
    aggregate(record) {
        addTo(this.total, record);
        let agent = this.byAgent.get(record.agentName);
        if (!agent)
            this.byAgent.set(record.agentName, (agent = newAggregate()));
        addTo(agent, record);
        const modelKey = normalizeModelName(record.model);
        let model = this.byModel.get(modelKey);
        if (!model)
            this.byModel.set(modelKey, (model = newAggregate()));
        addTo(model, record);
    }
    store(record) {
        if (this.maxRecords === 0)
            return;
        if (this.ringSize < this.maxRecords) {
            this.ring[(this.ringStart + this.ringSize) % this.maxRecords] = record;
            this.ringSize++;
            return;
        }
        this.ring[this.ringStart] = record;
        this.ringStart = (this.ringStart + 1) % this.maxRecords;
    }
}
//# sourceMappingURL=cost_tracker.js.map