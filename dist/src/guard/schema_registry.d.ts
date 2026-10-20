import type { z } from 'zod';
/**
 * Minimal structural view of a Zod issue.
 * Declared locally so the package works unchanged with Zod 3.24+ (`ZodIssue`) and Zod 4
 * (`$ZodIssue`, where `ZodIssue` is deprecated).
 */
export interface SchemaIssue {
    code?: string;
    message: string;
    path: ReadonlyArray<PropertyKey>;
}
export interface ValidationSuccess<T> {
    success: true;
    data: T;
}
export interface ValidationFailure {
    success: false;
    error: string;
    issues: SchemaIssue[];
}
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;
/**
 * Registry for structured agent outputs and input schemas using Zod.
 */
export declare class SchemaRegistry {
    private schemas;
    register(name: string, schema: z.ZodTypeAny): this;
    registerMany(schemas: Record<string, z.ZodTypeAny>): this;
    get(name: string): z.ZodTypeAny | undefined;
    validate<T = unknown>(schemaName: string, data: unknown): ValidationResult<T>;
    /**
     * Formats Zod validation issues into actionable prompt text for LLM self-correction.
     */
    formatZodIssues(issues: ReadonlyArray<SchemaIssue>): string;
    getAllNames(): string[];
}
//# sourceMappingURL=schema_registry.d.ts.map