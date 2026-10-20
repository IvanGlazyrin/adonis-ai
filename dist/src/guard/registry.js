import { PolicyViolationError } from './errors.js';
/**
 * Registry for managing AI agent tools, access permissions, policy guards,
 * and Human-in-the-loop confirmation hooks.
 *
 * Fail-closed: unknown permissions resolve to `deny`, `ask` without a confirmation service
 * never executes, and every tool that is handed out goes through the policy guard.
 */
export class ToolRegistry {
    tools = new Map();
    agentPermissions = new Map();
    defaultPermissions = new Map();
    askByDefault;
    defaultPermission;
    logger;
    constructor(opts = {}) {
        this.logger = opts.logger;
        this.askByDefault = new Set(opts.askByDefault ?? []);
        this.defaultPermission = opts.defaultPermission ?? 'deny';
    }
    setLogger(logger) {
        this.logger = logger;
    }
    registerTool(name, tool, defaultPermission) {
        this.tools.set(name, tool);
        if (defaultPermission) {
            this.defaultPermissions.set(name, defaultPermission);
        }
        return this;
    }
    registerTools(tools, defaultPermission) {
        for (const [name, tool] of Object.entries(tools)) {
            this.registerTool(name, tool, defaultPermission);
        }
        return this;
    }
    setAgentPermissions(agentName, permissions) {
        const map = this.agentPermissions.get(agentName) ?? new Map();
        for (const [tool, perm] of Object.entries(permissions)) {
            map.set(tool, perm);
        }
        this.agentPermissions.set(agentName, map);
        return this;
    }
    getAgentPermission(agentName, toolName) {
        const agentMap = this.agentPermissions.get(agentName);
        if (agentMap?.has(toolName)) {
            return agentMap.get(toolName);
        }
        if (this.defaultPermissions.has(toolName)) {
            return this.defaultPermissions.get(toolName);
        }
        if (this.askByDefault.has(toolName)) {
            return 'ask';
        }
        return this.defaultPermission;
    }
    /**
     * Wraps a tool with policy guard validation and, for `ask`, Human-in-the-loop confirmation.
     * Tools without an `execute` function (provider-executed / client-side tools) are returned as is.
     */
    wrapTool(name, tool, options = {}) {
        const originalExecute = tool.execute?.bind(tool);
        if (!originalExecute) {
            return tool;
        }
        const permission = options.permission ?? 'allow';
        return {
            ...tool,
            execute: async (args, execOptions) => {
                // 0. Defense in depth: a denied tool never runs, even if it slipped past filtering.
                if (permission === 'deny') {
                    throw new PolicyViolationError(name, 'permission is "deny"');
                }
                // 1. Guard check (also reserves a call slot in guards that support it)
                if (options.guard) {
                    const violation = options.guard.check(name, args);
                    if (violation) {
                        this.logger?.warn?.(`[ToolRegistry] Tool "${name}" call rejected by guard: ${violation}`, args);
                        return {
                            error: `Rejected by policy guard: ${violation}. Adjust parameters to match approved bounds.`,
                        };
                    }
                }
                // From here on a call slot may be held in the guard: it must end in exactly one
                // record() (tool ran) or release() (tool did not run).
                let executed = false;
                let slotSettled = false;
                const settleSlot = (result) => {
                    if (slotSettled)
                        return;
                    slotSettled = true;
                    options.guard?.record?.(name, result);
                };
                try {
                    // 2. Human-in-the-loop confirmation. Fail-closed: `ask` without a service never runs.
                    if (permission === 'ask') {
                        if (!options.confirmation) {
                            throw new PolicyViolationError(name, 'permission is "ask" but no ConfirmationService was provided');
                        }
                        this.logger?.info?.(`[ToolRegistry] Requesting confirmation for "${name}"`);
                        const confirmation = await options.confirmation.waitForResponse({
                            sessionId: options.sessionId,
                            toolName: name,
                            action: tool.description || name,
                            params: args ?? {},
                        }, options.timeoutMs, execOptions?.abortSignal);
                        if (confirmation.status !== 'approved') {
                            this.logger?.warn?.(`[ToolRegistry] Tool "${name}" execution not approved: ${confirmation.status} (${confirmation.reason ?? 'no reason'})`);
                            return {
                                error: `Tool "${name}" was not executed: ${confirmation.status}. ${confirmation.reason ?? ''}`.trim(),
                            };
                        }
                    }
                    // 3. Execute underlying tool
                    executed = true;
                    const result = await originalExecute(args, execOptions);
                    // 4. Record execution stats in guard
                    settleSlot(result);
                    return result;
                }
                catch (err) {
                    if (executed) {
                        settleSlot({ error: err instanceof Error ? err.message : String(err) });
                    }
                    throw err;
                }
                finally {
                    if (!slotSettled && options.guard) {
                        slotSettled = true;
                        options.guard.release?.(name);
                    }
                }
            },
        };
    }
    /**
     * Returns the tools an agent may use. `deny` tools are omitted, `ask` tools require
     * confirmation, and every returned tool is checked by `options.guard` when one is provided.
     */
    getToolsForAgent(agentName, options = {}) {
        const result = {};
        for (const [name, tool] of this.tools.entries()) {
            const wrapped = this.resolveTool(agentName, name, tool, options);
            if (wrapped)
                result[name] = wrapped;
        }
        return result;
    }
    /**
     * Returns the requested tools, subject to the permission matrix of `options.agentName`
     * (or the tool-level / registry defaults when no agent is given).
     */
    getToolsByList(toolNames, options = {}) {
        const result = {};
        for (const name of toolNames) {
            const tool = this.tools.get(name);
            if (!tool) {
                this.logger?.warn?.(`[ToolRegistry] Unknown tool requested: "${name}"`);
                continue;
            }
            const wrapped = this.resolveTool(options.agentName ?? '', name, tool, options);
            if (wrapped)
                result[name] = wrapped;
        }
        return result;
    }
    resolveTool(agentName, name, tool, options) {
        const permission = this.getAgentPermission(agentName, name);
        if (permission === 'deny') {
            return null;
        }
        if (permission === 'ask' && !options.confirmation) {
            this.logger?.warn?.(`[ToolRegistry] Tool "${name}" requires confirmation but no ConfirmationService was provided; calls will be refused.`);
        }
        if (permission === 'allow' && !options.guard) {
            return tool;
        }
        return this.wrapTool(name, tool, { ...options, permission });
    }
}
//# sourceMappingURL=registry.js.map