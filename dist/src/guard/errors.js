/**
 * Thrown when a tool call is refused by security policy and must not run:
 * permission is `deny`, or `ask` without any way to obtain a confirmation (fail-closed).
 */
export class PolicyViolationError extends Error {
    toolName;
    code = 'E_POLICY_VIOLATION';
    constructor(toolName, message) {
        super(`Tool "${toolName}" blocked by policy: ${message}`);
        this.toolName = toolName;
        this.name = 'PolicyViolationError';
    }
}
//# sourceMappingURL=errors.js.map