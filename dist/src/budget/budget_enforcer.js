/** Limits must be numbers >= 0; `Infinity` means "unlimited". `NaN` and negatives are rejected. */
function assertLimit(name, value) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
        throw new RangeError(`[BudgetEnforcer] ${name} must be a number >= 0 (or Infinity), got ${value}`);
    }
    return value;
}
/** Usage amounts from untrusted sources: NaN / negative / non-finite become 0. */
function safeAmount(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
/**
 * Enforces per-agent and per-session token and USD cost limits.
 *
 * Semantics: an agent/session may continue while `used + reserved + projected` is STRICTLY below
 * the limit, so a budget that is exactly exhausted does not allow further calls.
 *
 * Because JavaScript awaits between "check" and "record", `canAgentContinue()` followed by an LLM
 * call is racy under concurrency. Use `reserve()` + `settle()` / `release()` for atomic accounting.
 */
export class BudgetEnforcer {
    perAgentMaxTokens;
    perSessionMaxTokens;
    perAgentMaxCostUsd;
    perSessionMaxCostUsd;
    sessionTokensUsed = 0;
    sessionCostUsd = 0;
    agentTokensUsed = new Map();
    agentCostUsd = new Map();
    sessionTokensReserved = 0;
    sessionCostReserved = 0;
    agentTokensReserved = new Map();
    agentCostReserved = new Map();
    activeReservations = new Map();
    nextReservationId = 1;
    constructor(opts = {}) {
        this.perAgentMaxTokens = assertLimit('perAgentMaxTokens', opts.perAgentMaxTokens ?? 50_000);
        this.perSessionMaxTokens = assertLimit('perSessionMaxTokens', opts.perSessionMaxTokens ?? 200_000);
        this.perAgentMaxCostUsd = assertLimit('perAgentMaxCostUsd', opts.perAgentMaxCostUsd ?? Infinity);
        this.perSessionMaxCostUsd = assertLimit('perSessionMaxCostUsd', opts.perSessionMaxCostUsd ?? Infinity);
    }
    applyAllocation(allocation) {
        const perAgent = assertLimit('allocation.perAgent', allocation.perAgent);
        const perSession = assertLimit('allocation.perSession', allocation.perSession);
        this.perAgentMaxTokens = perAgent;
        this.perSessionMaxTokens = perSession;
    }
    setCostLimits(opts) {
        if (opts.perSessionMaxCostUsd !== undefined) {
            this.perSessionMaxCostUsd = assertLimit('perSessionMaxCostUsd', opts.perSessionMaxCostUsd);
        }
        if (opts.perAgentMaxCostUsd !== undefined) {
            this.perAgentMaxCostUsd = assertLimit('perAgentMaxCostUsd', opts.perAgentMaxCostUsd);
        }
    }
    setTokenLimits(opts) {
        if (opts.perSessionMaxTokens !== undefined) {
            this.perSessionMaxTokens = assertLimit('perSessionMaxTokens', opts.perSessionMaxTokens);
        }
        if (opts.perAgentMaxTokens !== undefined) {
            this.perAgentMaxTokens = assertLimit('perAgentMaxTokens', opts.perAgentMaxTokens);
        }
    }
    canAgentContinue(agentName, projectedTokens = 0, projectedCost = 0) {
        const tokens = this.agentTokensOf(agentName) + safeAmount(projectedTokens);
        const cost = this.agentCostOf(agentName) + safeAmount(projectedCost);
        return tokens < this.perAgentMaxTokens && cost < this.perAgentMaxCostUsd;
    }
    canSessionContinue(projectedTokens = 0, projectedCost = 0) {
        const tokens = this.sessionTokensUsed + this.sessionTokensReserved + safeAmount(projectedTokens);
        const cost = this.sessionCostUsd + this.sessionCostReserved + safeAmount(projectedCost);
        return tokens < this.perSessionMaxTokens && cost < this.perSessionMaxCostUsd;
    }
    /**
     * Atomically checks agent AND session limits and, when they allow it, holds the projected
     * amounts. Returns `null` when the call must not proceed. Always follow up with `settle()`
     * (call completed) or `release()` (call abandoned/failed).
     */
    reserve(agentName, projectedTokens, projectedCost = 0) {
        const tokens = safeAmount(projectedTokens);
        const costUsd = safeAmount(projectedCost);
        if (!this.canAgentContinue(agentName, tokens, costUsd))
            return null;
        if (!this.canSessionContinue(tokens, costUsd))
            return null;
        const reservation = {
            id: this.nextReservationId++,
            agentName,
            tokens,
            costUsd,
        };
        this.activeReservations.set(reservation.id, reservation);
        this.agentTokensReserved.set(agentName, (this.agentTokensReserved.get(agentName) ?? 0) + tokens);
        this.agentCostReserved.set(agentName, (this.agentCostReserved.get(agentName) ?? 0) + costUsd);
        this.sessionTokensReserved += tokens;
        this.sessionCostReserved += costUsd;
        return reservation;
    }
    /** Replaces a reservation with the actual usage. Safe to call more than once. */
    settle(reservation, actualTokens, actualCostUsd = 0) {
        if (!this.releaseHold(reservation))
            return;
        this.recordAgentUsage(reservation.agentName, actualTokens, actualCostUsd);
    }
    /** Drops a reservation without recording usage. Safe to call more than once. */
    release(reservation) {
        this.releaseHold(reservation);
    }
    recordAgentUsage(agentName, tokens, costUsd = 0) {
        const t = safeAmount(tokens);
        const c = safeAmount(costUsd);
        this.agentTokensUsed.set(agentName, (this.agentTokensUsed.get(agentName) ?? 0) + t);
        this.sessionTokensUsed += t;
        this.agentCostUsd.set(agentName, (this.agentCostUsd.get(agentName) ?? 0) + c);
        this.sessionCostUsd += c;
    }
    getSessionCostUsd() {
        return this.sessionCostUsd;
    }
    getSessionTokensUsed() {
        return this.sessionTokensUsed;
    }
    getAgentCostUsd(agentName) {
        return this.agentCostUsd.get(agentName) ?? 0;
    }
    getAgentTokensUsed(agentName) {
        return this.agentTokensUsed.get(agentName) ?? 0;
    }
    getSummary() {
        const agentNames = new Set([...this.agentTokensUsed.keys(), ...this.agentCostUsd.keys()]);
        const agentUsage = Object.fromEntries([...agentNames].map((name) => [
            name,
            {
                tokens: this.agentTokensUsed.get(name) ?? 0,
                costUsd: this.agentCostUsd.get(name) ?? 0,
            },
        ]));
        return {
            sessionTokensUsed: this.sessionTokensUsed,
            sessionMaxTokens: this.perSessionMaxTokens,
            sessionCostUsd: this.sessionCostUsd,
            sessionMaxCostUsd: this.perSessionMaxCostUsd,
            agentUsage,
        };
    }
    reset() {
        this.sessionTokensUsed = 0;
        this.sessionCostUsd = 0;
        this.agentTokensUsed.clear();
        this.agentCostUsd.clear();
        this.sessionTokensReserved = 0;
        this.sessionCostReserved = 0;
        this.agentTokensReserved.clear();
        this.agentCostReserved.clear();
        this.activeReservations.clear();
    }
    toLogString() {
        const tokenPct = this.perSessionMaxTokens > 0
            ? ((this.sessionTokensUsed / this.perSessionMaxTokens) * 100).toFixed(1)
            : '0.0';
        const costLimitStr = Number.isFinite(this.perSessionMaxCostUsd)
            ? `$${this.perSessionMaxCostUsd.toFixed(4)}`
            : 'unlimited';
        const costPct = Number.isFinite(this.perSessionMaxCostUsd) && this.perSessionMaxCostUsd > 0
            ? ` (${((this.sessionCostUsd / this.perSessionMaxCostUsd) * 100).toFixed(1)}%)`
            : '';
        const allAgents = new Set([...this.agentTokensUsed.keys(), ...this.agentCostUsd.keys()]);
        const agents = [...allAgents]
            .map((name) => {
            const tokens = this.agentTokensUsed.get(name) ?? 0;
            const cost = this.agentCostUsd.get(name) ?? 0;
            return `  ${name}: ${tokens} tokens ($${cost.toFixed(4)} USD)`;
        })
            .join('\n');
        return (`Session: ${this.sessionTokensUsed}/${this.perSessionMaxTokens} tokens (${tokenPct}%) | Cost: $${this.sessionCostUsd.toFixed(4)} / ${costLimitStr} USD${costPct}` +
            (agents ? `\nPer-agent:\n${agents}` : ''));
    }
    agentTokensOf(agentName) {
        return (this.agentTokensUsed.get(agentName) ?? 0) + (this.agentTokensReserved.get(agentName) ?? 0);
    }
    agentCostOf(agentName) {
        return (this.agentCostUsd.get(agentName) ?? 0) + (this.agentCostReserved.get(agentName) ?? 0);
    }
    releaseHold(reservation) {
        if (!this.activeReservations.delete(reservation.id))
            return false;
        const { agentName, tokens, costUsd } = reservation;
        this.agentTokensReserved.set(agentName, Math.max(0, (this.agentTokensReserved.get(agentName) ?? 0) - tokens));
        this.agentCostReserved.set(agentName, Math.max(0, (this.agentCostReserved.get(agentName) ?? 0) - costUsd));
        this.sessionTokensReserved = Math.max(0, this.sessionTokensReserved - tokens);
        this.sessionCostReserved = Math.max(0, this.sessionCostReserved - costUsd);
        return true;
    }
}
//# sourceMappingURL=budget_enforcer.js.map