import { z } from 'zod';
export declare const toolPermissionSchema: z.ZodEnum<{
    allow: "allow";
    ask: "ask";
    deny: "deny";
}>;
export type ToolPermission = z.infer<typeof toolPermissionSchema>;
export declare const agentManifestSchema: z.ZodPipe<z.ZodObject<{
    id: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    mode: z.ZodDefault<z.ZodEnum<{
        primary: "primary";
        subagent: "subagent";
    }>>;
    stop_steps: z.ZodOptional<z.ZodNumber>;
    stopSteps: z.ZodOptional<z.ZodNumber>;
    skills: z.ZodDefault<z.ZodArray<z.ZodString>>;
    outputSchema: z.ZodOptional<z.ZodString>;
    permissions: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodEnum<{
        allow: "allow";
        ask: "ask";
        deny: "deny";
    }>>>;
    phases: z.ZodDefault<z.ZodArray<z.ZodString>>;
    model: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>, z.ZodTransform<{
    id: string;
    description: string;
    mode: "primary" | "subagent";
    stopSteps: number;
    skills: string[];
    outputSchema: string | undefined;
    permissions: Record<string, "allow" | "ask" | "deny">;
    phases: string[];
    model: string | undefined;
    provider: string | undefined;
    temperature: number | undefined;
    maxTokens: number | undefined;
    metadata: Record<string, unknown> | undefined;
}, {
    id: string;
    description: string;
    mode: "primary" | "subagent";
    skills: string[];
    permissions: Record<string, "allow" | "ask" | "deny">;
    phases: string[];
    stop_steps?: number | undefined;
    stopSteps?: number | undefined;
    outputSchema?: string | undefined;
    model?: string | undefined;
    provider?: string | undefined;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
}>>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;
//# sourceMappingURL=manifest.d.ts.map