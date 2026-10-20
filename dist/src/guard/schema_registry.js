/**
 * Registry for structured agent outputs and input schemas using Zod.
 */
export class SchemaRegistry {
    schemas = new Map();
    register(name, schema) {
        this.schemas.set(name, schema);
        return this;
    }
    registerMany(schemas) {
        for (const [name, schema] of Object.entries(schemas)) {
            this.schemas.set(name, schema);
        }
        return this;
    }
    get(name) {
        return this.schemas.get(name);
    }
    validate(schemaName, data) {
        const schema = this.get(schemaName);
        if (!schema) {
            return {
                success: false,
                error: `Schema "${schemaName}" is not registered in SchemaRegistry`,
                issues: [],
            };
        }
        const parsed = schema.safeParse(data);
        if (parsed.success) {
            return {
                success: true,
                data: parsed.data,
            };
        }
        const issues = parsed.error.issues;
        return {
            success: false,
            error: this.formatZodIssues(issues),
            issues,
        };
    }
    /**
     * Formats Zod validation issues into actionable prompt text for LLM self-correction.
     */
    formatZodIssues(issues) {
        return issues
            .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.map(String).join('.') : 'root';
            return `- Field "${path}": ${issue.message}`;
        })
            .join('\n');
    }
    getAllNames() {
        return Array.from(this.schemas.keys());
    }
}
//# sourceMappingURL=schema_registry.js.map