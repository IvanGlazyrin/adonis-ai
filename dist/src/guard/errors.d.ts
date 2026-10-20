/**
 * Thrown when a tool call is refused by security policy and must not run:
 * permission is `deny`, or `ask` without any way to obtain a confirmation (fail-closed).
 */
export declare class PolicyViolationError extends Error {
    readonly toolName: string;
    readonly code = "E_POLICY_VIOLATION";
    constructor(toolName: string, message: string);
}
//# sourceMappingURL=errors.d.ts.map