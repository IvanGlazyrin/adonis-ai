export class AgentRunner {
    manager;
    config;
    defaultOptions;
    constructor(manager, config, options = {}) {
        this.manager = manager;
        this.config = config;
        this.defaultOptions = options;
    }
    getId() {
        return this.config.id;
    }
    getDescription() {
        return this.config.description;
    }
    getSystemPrompt() {
        return this.config.systemPrompt;
    }
    getConfig() {
        return this.config;
    }
    getPermissions() {
        return this.config.permissions;
    }
    permissionFor(toolName) {
        const own = Object.hasOwn(this.config.permissions, toolName)
            ? this.config.permissions[toolName]
            : undefined;
        return own ?? this.defaultOptions.defaultToolPermission ?? 'allow';
    }
    /**
     * Filters tools according to the agent manifest. `deny` tools are removed; the permissions map is
     * returned so the manager enforces `ask` (human confirmation) and the tool guard at call time.
     */
    prepareTools(runtimeTools) {
        const rawTools = runtimeTools ?? this.defaultOptions.tools;
        const toolPermissions = {};
        if (!rawTools || Object.keys(rawTools).length === 0) {
            return { tools: undefined, toolPermissions };
        }
        const filtered = {};
        for (const [name, tool] of Object.entries(rawTools)) {
            const permission = this.permissionFor(name);
            if (permission === 'deny') {
                continue;
            }
            filtered[name] = tool;
            toolPermissions[name] = permission;
        }
        return {
            tools: Object.keys(filtered).length > 0 ? filtered : undefined,
            toolPermissions,
        };
    }
    mergedSystem(extra) {
        return [this.config.systemPrompt, this.defaultOptions.system, extra].filter(Boolean).join('\n\n');
    }
    /**
     * Executes a text generation step with agent instructions, budget tracking, and tool permissions.
     *
     * Security: `tools`, `toolPermissions`, `system` and `toolGuard` are spread AFTER the caller's
     * options so a caller can neither re-introduce a denied tool nor replace the agent's prompt.
     */
    async run(promptOrOptions) {
        const baseOpts = typeof promptOrOptions === 'string' ? { prompt: promptOrOptions } : { ...promptOrOptions };
        const { tools, toolPermissions } = this.prepareTools(baseOpts.tools);
        return this.manager.generateText({
            ...baseOpts,
            agentName: this.config.id,
            system: this.mergedSystem(baseOpts.system),
            model: baseOpts.model ?? this.defaultOptions.model ?? this.config.model,
            provider: baseOpts.provider ?? this.defaultOptions.provider ?? this.config.provider,
            temperature: baseOpts.temperature ?? this.defaultOptions.temperature ?? this.config.temperature,
            maxOutputTokens: this.maxOutputTokens(baseOpts),
            maxSteps: baseOpts.maxSteps ?? this.config.stopSteps,
            tools,
            toolPermissions,
            toolGuard: baseOpts.toolGuard ?? this.defaultOptions.toolGuard,
        });
    }
    /**
     * Streams responses with agent instructions, skills, and budget attribution.
     */
    async runStream(promptOrOptions) {
        const baseOpts = typeof promptOrOptions === 'string' ? { prompt: promptOrOptions } : { ...promptOrOptions };
        const { tools, toolPermissions } = this.prepareTools(baseOpts.tools);
        return this.manager.streamText({
            ...baseOpts,
            agentName: this.config.id,
            system: this.mergedSystem(baseOpts.system),
            model: baseOpts.model ?? this.defaultOptions.model ?? this.config.model,
            provider: baseOpts.provider ?? this.defaultOptions.provider ?? this.config.provider,
            temperature: baseOpts.temperature ?? this.defaultOptions.temperature ?? this.config.temperature,
            maxOutputTokens: this.maxOutputTokens(baseOpts),
            maxSteps: baseOpts.maxSteps ?? this.config.stopSteps,
            tools,
            toolPermissions,
            toolGuard: baseOpts.toolGuard ?? this.defaultOptions.toolGuard,
        });
    }
    /** Alias of `runStream()`. */
    stream(promptOrOptions) {
        return this.runStream(promptOrOptions);
    }
    /**
     * Generates structured output conforming to a Zod schema or the agent's outputSchema.
     */
    async runStructured(schema, promptOrOptions) {
        const targetSchema = schema ?? this.config.outputSchema;
        if (!targetSchema) {
            throw new Error(`No schema provided for structured output in agent "${this.config.id}"`);
        }
        const baseOpts = typeof promptOrOptions === 'string' ? { prompt: promptOrOptions } : (promptOrOptions ?? {});
        return this.manager.generateObject({
            ...baseOpts,
            schema: targetSchema,
            schemaName: baseOpts.schemaName ?? this.config.outputSchemaName ?? this.config.id,
            agentName: this.config.id,
            system: this.mergedSystem(baseOpts.system),
            model: baseOpts.model ?? this.defaultOptions.model ?? this.config.model,
            provider: baseOpts.provider ?? this.defaultOptions.provider ?? this.config.provider,
            temperature: baseOpts.temperature ?? this.defaultOptions.temperature ?? this.config.temperature,
            maxOutputTokens: this.maxOutputTokens(baseOpts),
        });
    }
    maxOutputTokens(opts) {
        return (opts.maxOutputTokens ??
            opts.maxTokens ??
            this.defaultOptions.maxOutputTokens ??
            this.defaultOptions.maxTokens ??
            this.config.maxTokens);
    }
}
//# sourceMappingURL=agent_runner.js.map