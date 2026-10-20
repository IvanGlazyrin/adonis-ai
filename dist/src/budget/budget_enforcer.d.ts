import type { BudgetAllocation, BudgetEnforcerOptions, BudgetSummary } from './types.js';
/**
 * A hold on part of a budget, taken before an async call so that concurrent callers
 * cannot all pass the check and then collectively overshoot the limit.
 */
export interface BudgetReservation {
    readonly id: number;
    readonly agentName: string;
    readonly tokens: number;
    readonly costUsd: number;
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
export declare class BudgetEnforcer {
    private perAgentMaxTokens;
    private perSessionMaxTokens;
    private perAgentMaxCostUsd;
    private perSessionMaxCostUsd;
    private sessionTokensUsed;
    private sessionCostUsd;
    private agentTokensUsed;
    private agentCostUsd;
    private sessionTokensReserved;
    private sessionCostReserved;
    private agentTokensReserved;
    private agentCostReserved;
    private activeReservations;
    private nextReservationId;
    constructor(opts?: BudgetEnforcerOptions);
    applyAllocation(allocation: BudgetAllocation): void;
    setCostLimits(opts: {
        perSessionMaxCostUsd?: number;
        perAgentMaxCostUsd?: number;
    }): void;
    setTokenLimits(opts: {
        perSessionMaxTokens?: number;
        perAgentMaxTokens?: number;
    }): void;
    canAgentContinue(agentName: string, projectedTokens?: number, projectedCost?: number): boolean;
    canSessionContinue(projectedTokens?: number, projectedCost?: number): boolean;
    /**
     * Atomically checks agent AND session limits and, when they allow it, holds the projected
     * amounts. Returns `null` when the call must not proceed. Always follow up with `settle()`
     * (call completed) or `release()` (call abandoned/failed).
     */
    reserve(agentName: string, projectedTokens: number, projectedCost?: number): BudgetReservation | null;
    /** Replaces a reservation with the actual usage. Safe to call more than once. */
    settle(reservation: BudgetReservation, actualTokens: number, actualCostUsd?: number): void;
    /** Drops a reservation without recording usage. Safe to call more than once. */
    release(reservation: BudgetReservation): void;
    recordAgentUsage(agentName: string, tokens: number, costUsd?: number): void;
    getSessionCostUsd(): number;
    getSessionTokensUsed(): number;
    getAgentCostUsd(agentName: string): number;
    getAgentTokensUsed(agentName: string): number;
    getSummary(): BudgetSummary;
    reset(): void;
    toLogString(): string;
    private agentTokensOf;
    private agentCostOf;
    private releaseHold;
}
//# sourceMappingURL=budget_enforcer.d.ts.map