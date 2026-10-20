import type { z } from 'zod'

/**
 * Minimal structural view of a Zod issue.
 * Declared locally so the package works unchanged with Zod 3.24+ (`ZodIssue`) and Zod 4
 * (`$ZodIssue`, where `ZodIssue` is deprecated).
 */
export interface SchemaIssue {
  code?: string
  message: string
  path: ReadonlyArray<PropertyKey>
}

export interface ValidationSuccess<T> {
  success: true
  data: T
}

export interface ValidationFailure {
  success: false
  error: string
  issues: SchemaIssue[]
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Registry for structured agent outputs and input schemas using Zod.
 */
export class SchemaRegistry {
  private schemas = new Map<string, z.ZodTypeAny>()

  register(name: string, schema: z.ZodTypeAny): this {
    this.schemas.set(name, schema)
    return this
  }

  registerMany(schemas: Record<string, z.ZodTypeAny>): this {
    for (const [name, schema] of Object.entries(schemas)) {
      this.schemas.set(name, schema)
    }
    return this
  }

  get(name: string): z.ZodTypeAny | undefined {
    return this.schemas.get(name)
  }

  validate<T = unknown>(schemaName: string, data: unknown): ValidationResult<T> {
    const schema = this.get(schemaName)
    if (!schema) {
      return {
        success: false,
        error: `Schema "${schemaName}" is not registered in SchemaRegistry`,
        issues: [],
      }
    }

    const parsed = schema.safeParse(data)
    if (parsed.success) {
      return {
        success: true,
        data: parsed.data as T,
      }
    }

    const issues = parsed.error.issues as SchemaIssue[]
    return {
      success: false,
      error: this.formatZodIssues(issues),
      issues,
    }
  }

  /**
   * Formats Zod validation issues into actionable prompt text for LLM self-correction.
   */
  formatZodIssues(issues: ReadonlyArray<SchemaIssue>): string {
    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'root'
        return `- Field "${path}": ${issue.message}`
      })
      .join('\n')
  }

  getAllNames(): string[] {
    return Array.from(this.schemas.keys())
  }
}
