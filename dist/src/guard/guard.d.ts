import type { ActionGuard, ExecutionReconciliation } from './types.js';
export interface ParameterRule<T = unknown> {
    field: string;
    validate: (value: T, allArgs: Record<string, unknown>) => string | null;
}
export interface PolicyGuardOptions {
    maxCalls?: number;
    allowedTools?: string[];
    rules?: Record<string, ParameterRule[]>;
}
/**
 * Flexible policy guard for constraining tool arguments and invocation counts.
 *
 * `check()` reserves a call slot when it allows a call, so parallel tool calls cannot all pass
 * the `maxCalls` check before any of them is recorded. The slot is turned into a counted call by
 * `record()`, or given back by `release()`.
 */
export declare class PolicyGuard implements ActionGuard {
    private callCount;
    private successfulCalls;
    private inFlight;
    private maxCalls;
    private allowedTools?;
    private rules;
    constructor(opts?: PolicyGuardOptions);
    addRule(toolName: string, rule: ParameterRule): this;
    check(toolName: string, args: unknown): string | null;
    record(_toolName: string, result: unknown): void;
    release(_toolName: string): void;
    get totalCalls(): number;
    get acceptedCalls(): number;
    summary(): Record<string, unknown>;
}
/**
 * Reconciles the number of claims made by an LLM with the verified executions in the guard.
 */
export declare function reconcileExecutionClaims(claimedCount: unknown, guard?: ActionGuard): ExecutionReconciliation;
/**
 * Creates a numeric range validation rule.
 * Only real numbers (or numeric strings) pass: `''`, `null`, booleans and arrays are rejected.
 */
export declare function rangeRule(field: string, min: number, max: number, label?: string): ParameterRule<unknown>;
/**
 * Creates an allowed values enum validation rule.
 */
export declare function enumRule<T extends string>(field: string, allowed: readonly T[], label?: string): ParameterRule<unknown>;
//# sourceMappingURL=guard.d.ts.map