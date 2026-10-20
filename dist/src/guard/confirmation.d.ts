import type { ConfirmationResponse, Logger, PendingAction } from './types.js';
export type ConfirmationCallback = (response: ConfirmationResponse) => void;
export type ActionCreatedListener = (action: PendingAction) => void;
export type ActionResolvedListener = (action: PendingAction, response: ConfirmationResponse) => void;
export interface ConfirmationServiceOptions {
    defaultTimeoutMs?: number;
    logger?: Logger;
}
/** Largest delay `setTimeout` accepts; larger values fire after ~1ms with a TimeoutOverflowWarning. */
export declare const MAX_TIMEOUT_MS: number;
/**
 * Manages human-in-the-loop confirmations for sensitive or irreversible actions.
 *
 * Actions are kept in memory with a configurable TTL.
 * External interfaces (web UI, telegram bots, webhooks) approve or reject them.
 * If no response arrives within the timeout window, the action automatically times out.
 *
 * Timers are `unref()`'d so a pending confirmation never keeps the process alive; call
 * `dispose()` on shutdown to settle everything that is still pending.
 */
export declare class ConfirmationService {
    private pending;
    private defaultTimeoutMs;
    private logger?;
    private createdListeners;
    private resolvedListeners;
    private disposed;
    constructor(opts?: ConfirmationServiceOptions);
    setLogger(logger: Logger): void;
    onActionCreated(listener: ActionCreatedListener): () => void;
    onActionResolved(listener: ActionResolvedListener): () => void;
    /**
     * Create a pending action and wait for human confirmation, timeout, or abort.
     * Never approves implicitly: timeout, abort and disposal all resolve as non-approved.
     */
    waitForResponse(action: Omit<PendingAction, 'id' | 'status' | 'createdAt' | 'expiresAt'>, timeoutMs?: number, abortSignal?: AbortSignal): Promise<ConfirmationResponse>;
    /**
     * Approve a pending action. If the action is bound to a session, the caller must present the
     * same `sessionId`; otherwise the approval is refused and the action stays pending.
     */
    approve(actionId: string, reason?: string, sessionId?: string): boolean;
    /**
     * Reject a pending action. Same session binding rules as `approve()`.
     */
    reject(actionId: string, reason?: string, sessionId?: string): boolean;
    /**
     * List current pending actions, optionally restricted to one session.
     */
    getPendingActions(sessionId?: string): PendingAction[];
    /**
     * Get a specific pending action by ID.
     */
    getPendingAction(actionId: string): PendingAction | null;
    /**
     * Resolves expired items as `timeout`, invoking `onActionResolved` listeners.
     */
    clearExpired(): void;
    /**
     * Settles every pending action as rejected, clears timers and listeners.
     * Further `waitForResponse()` calls resolve as rejected immediately.
     */
    dispose(): void;
    private resolveAction;
    private notifyCreated;
    private notifyResolved;
}
//# sourceMappingURL=confirmation.d.ts.map