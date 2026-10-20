import type { z } from 'zod';
import type { LoggerContract } from '../ai_manager.js';
import { type ToolPermission } from './manifest.js';
export interface AgentPromptConfig {
    id: string;
    description: string;
    mode: 'primary' | 'subagent';
    stopSteps: number;
    skills: string[];
    systemPrompt: string;
    body: string;
    skillPrompts: Record<string, string>;
    outputSchemaName?: string;
    outputSchema?: z.ZodTypeAny;
    permissions: Record<string, ToolPermission>;
    phases: string[];
    model?: string;
    provider?: string;
    temperature?: number;
    maxTokens?: number;
    metadata?: Record<string, unknown>;
}
export interface AgentLoaderOptions {
    configsDir?: string;
    skillsDir?: string;
    logger?: LoggerContract;
    schemaResolver?: (name: string) => z.ZodTypeAny | undefined;
}
export declare class AgentLoader {
    private cache;
    private configsDir?;
    private skillsDir?;
    private logger?;
    private schemaResolver?;
    constructor(options?: AgentLoaderOptions);
    setSchemaResolver(resolver: (name: string) => z.ZodTypeAny | undefined): void;
    setLogger(logger: LoggerContract): void;
    resolveDirs(customConfigsDir?: string, customSkillsDir?: string): Promise<{
        configsDir: string;
        skillsDir: string;
    }>;
    /**
     * Resolves `<dir>/<name>.md`, rejecting names that could escape `dir`
     * (`../`, absolute paths, separators). Returns `null` for unsafe names.
     */
    private safeResolve;
    loadSkill(skillName: string, skillsDir: string): string;
    loadAgentPrompt(agentId: string, customConfigsDir?: string, customSkillsDir?: string): Promise<AgentPromptConfig>;
    loadAllAgentPrompts(customConfigsDir?: string, customSkillsDir?: string): Promise<Record<string, AgentPromptConfig>>;
    invalidateCache(agentId?: string): void;
}
export declare const agentLoader: AgentLoader;
export declare function loadAgentPrompt(agentId: string, configsDir?: string, skillsDir?: string): Promise<AgentPromptConfig>;
export declare function loadAllAgentPrompts(configsDir?: string, skillsDir?: string): Promise<Record<string, AgentPromptConfig>>;
export declare function invalidateAgentCache(agentId?: string): void;
//# sourceMappingURL=loader.d.ts.map