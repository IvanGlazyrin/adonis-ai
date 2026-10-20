import type { ActionGuard, Logger, ToolDefinition, ToolPermission } from './types.js';
import type { ConfirmationService } from './confirmation.js';
export interface ToolAccessOptions {
    guard?: ActionGuard;
    confirmation?: ConfirmationService;
    sessionId?: string;
    timeoutMs?: number;
    /** Agent whose permission matrix applies in `getToolsByList()`. */
    agentName?: string;
}
export interface WrapToolOptions extends ToolAccessOptions {
    /**
     * Effective permission of the tool. `ask` requires a `confirmation` service (otherwise every
     * call is refused with `PolicyViolationError`); `deny` refuses every call.
     * Defaults to `allow` because `wrapTool()` is a low-level primitive; the registry's
     * `getToolsForAgent()` / `getToolsByList()` always pass the resolved permission.
     */
    permission?: ToolPermission;
}
export interface ToolRegistryOptions {
    logger?: Logger;
    askByDefault?: string[];
    /**
     * Permission of tools that have neither an agent-specific nor a tool-level permission.
     * Default: `deny` (fail-closed).
     */
    defaultPermission?: ToolPermission;
}
/**
 * Registry for managing AI agent tools, access permissions, policy guards,
 * and Human-in-the-loop confirmation hooks.
 *
 * Fail-closed: unknown permissions resolve to `deny`, `ask` without a confirmation service
 * never executes, and every tool that is handed out goes through the policy guard.
 */
export declare class ToolRegistry {
    private tools;
    private agentPermissions;
    private defaultPermissions;
    private askByDefault;
    private defaultPermission;
    private logger?;
    constructor(opts?: ToolRegistryOptions);
    setLogger(logger: Logger): void;
    registerTool(name: string, tool: ToolDefinition, defaultPermission?: ToolPermission): this;
    registerTools(tools: Record<string, ToolDefinition>, defaultPermission?: ToolPermission): this;
    setAgentPermissions(agentName: string, permissions: Record<string, ToolPermission>): this;
    getAgentPermission(agentName: string, toolName: string): ToolPermission;
    /**
     * Wraps a tool with policy guard validation and, for `ask`, Human-in-the-loop confirmation.
     * Tools without an `execute` function (provider-executed / client-side tools) are returned as is.
     */
    wrapTool(name: string, tool: ToolDefinition, options?: WrapToolOptions): ToolDefinition;
    /**
     * Returns the tools an agent may use. `deny` tools are omitted, `ask` tools require
     * confirmation, and every returned tool is checked by `options.guard` when one is provided.
     */
    getToolsForAgent(agentName: string, options?: ToolAccessOptions): Record<string, ToolDefinition>;
    /**
     * Returns the requested tools, subject to the permission matrix of `options.agentName`
     * (or the tool-level / registry defaults when no agent is given).
     */
    getToolsByList(toolNames: string[], options?: ToolAccessOptions): Record<string, ToolDefinition>;
    private resolveTool;
}
//# sourceMappingURL=registry.d.ts.map