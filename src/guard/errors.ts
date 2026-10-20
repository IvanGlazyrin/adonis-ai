/**
 * Thrown when a tool call is refused by security policy and must not run:
 * permission is `deny`, or `ask` without any way to obtain a confirmation (fail-closed).
 */
export class PolicyViolationError extends Error {
  readonly code = 'E_POLICY_VIOLATION'

  constructor(
    public readonly toolName: string,
    message: string
  ) {
    super(`Tool "${toolName}" blocked by policy: ${message}`)
    this.name = 'PolicyViolationError'
  }
}
