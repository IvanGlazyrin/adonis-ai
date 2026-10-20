import type { z } from 'zod';
import type { ToolSet } from 'ai';
import type { GenerateObjectOptions, GenerateObjectResult, GenerateTextOptions, GenerateTextResult, StreamTextOptions, StreamTextResult } from '../types.js';
import type { AiManager } from '../ai_manager.js';
import type { AgentPromptConfig } from './loader.js';
import type { ToolPermission } from './manifest.js';
export interface AgentRunnerOptions {
    tools?: ToolSet;
    system?: string;
    model?: string;
    provider?: string;
    temperature?: number;
    maxOutputTokens?: number;
    /** @deprecated Use `maxOutputTokens`. */
    maxTokens?: number;
    sessionId?: string;
    toolGuard?: GenerateTextOptions['toolGuard'];
    /**
     * Permission of tools the agent manifest does not mention. Default: 'allow' (the manifest then
     * acts as a deny/ask list). Use 'deny' for strict allow-list mode.
     */
    defaultToolPermission?: ToolPermission;
}
export declare class AgentRunner {
    private manager;
    private config;
    private defaultOptions;
    constructor(manager: AiManager, config: AgentPromptConfig, options?: AgentRunnerOptions);
    getId(): string;
    getDescription(): string;
    getSystemPrompt(): string;
    getConfig(): AgentPromptConfig;
    getPermissions(): Record<string, ToolPermission>;
    private permissionFor;
    /**
     * Filters tools according to the agent manifest. `deny` tools are removed; the permissions map is
     * returned so the manager enforces `ask` (human confirmation) and the tool guard at call time.
     */
    private prepareTools;
    private mergedSystem;
    /**
     * Executes a text generation step with agent instructions, budget tracking, and tool permissions.
     *
     * Security: `tools`, `toolPermissions`, `system` and `toolGuard` are spread AFTER the caller's
     * options so a caller can neither re-introduce a denied tool nor replace the agent's prompt.
     */
    run(promptOrOptions: string | GenerateTextOptions): Promise<GenerateTextResult>;
    /**
     * Streams responses with agent instructions, skills, and budget attribution.
     */
    runStream(promptOrOptions: string | StreamTextOptions): Promise<StreamTextResult>;
    /** Alias of `runStream()`. */
    stream(promptOrOptions: string | StreamTextOptions): Promise<StreamTextResult>;
    /**
     * Generates structured output conforming to a Zod schema or the agent's outputSchema.
     */
    runStructured<T>(schema?: z.ZodType<T>, promptOrOptions?: string | Partial<GenerateObjectOptions<T>>): Promise<GenerateObjectResult<T>>;
    private maxOutputTokens;
}
//# sourceMappingURL=agent_runner.d.ts.map