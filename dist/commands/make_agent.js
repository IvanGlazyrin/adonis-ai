var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BaseCommand, args, flags } from '@adonisjs/core/ace';
import fs from 'node:fs/promises';
import path from 'node:path';
export default class MakeAiAgentCommand extends BaseCommand {
    static commandName = 'make:ai-agent';
    static description = 'Scaffold a production-grade typed AI Agent class';
    static options = {
        startApp: false,
    };
    async run() {
        const rawName = this.name.replace(/Agent$/i, '');
        const className = rawName.charAt(0).toUpperCase() + rawName.slice(1) + 'Agent';
        const fileName = rawName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + '_agent.ts';
        const targetDir = path.join(this.app.makePath('app/ai/agents'));
        await fs.mkdir(targetDir, { recursive: true });
        const targetFile = path.join(targetDir, fileName);
        const exists = await fs
            .access(targetFile)
            .then(() => true)
            .catch(() => false);
        if (exists) {
            this.ui.logger.error(`Agent file already exists: ${targetFile}`);
            return;
        }
        const template = `import ai from 'adonis-ai-kit/services/main'
import type { GenerateTextResult, StreamTextResult } from 'adonis-ai-kit/types'

export interface ${className}Input {
  prompt: string
  context?: Record<string, unknown>
}

/**
 * ${className}
 * Production-ready AI agent with token budgeting and structured execution.
 */
export class ${className} {
  public readonly agentName = '${rawName.toLowerCase()}-agent'
  public readonly defaultProvider = ${this.provider ? `'${this.provider}'` : 'undefined'}
  public readonly defaultModel = ${this.model ? `'${this.model}'` : 'undefined'}
  public readonly maxOutputTokens = ${this.maxTokens}

  /**
   * System prompt establishing role, instructions, and guardrails.
   */
  protected getSystemPrompt(): string {
    return [
      'You are ${className}, an expert AI assistant.',
      'Provide concise, accurate, and actionable answers.',
      'Always follow system security guidelines.',
    ].join('\\n')
  }

  /**
   * Executes synchronous text generation.
   */
  async run(input: ${className}Input): Promise<GenerateTextResult> {
    return ai.generateText({
      agentName: this.agentName,
      provider: this.defaultProvider,
      model: this.defaultModel,
      maxOutputTokens: this.maxOutputTokens,
      system: this.getSystemPrompt(),
      prompt: input.prompt,
      metadata: input.context,
    })
  }

  /**
   * Streams response in real time (e.g. for Server-Sent Events or WebSockets).
   */
  async stream(input: ${className}Input): Promise<StreamTextResult> {
    return ai.streamText({
      agentName: this.agentName,
      provider: this.defaultProvider,
      model: this.defaultModel,
      maxOutputTokens: this.maxOutputTokens,
      system: this.getSystemPrompt(),
      prompt: input.prompt,
      metadata: input.context,
    })
  }
}

export default new ${className}()
`;
        await fs.writeFile(targetFile, template.trim() + '\n', 'utf8');
        this.ui.logger.success(`Created AI Agent: ${targetFile}`);
    }
}
__decorate([
    args.string({ description: 'Name of the AI Agent class (e.g. MarketAnalysis, SupportChat, Coder)' }),
    __metadata("design:type", String)
], MakeAiAgentCommand.prototype, "name", void 0);
__decorate([
    flags.string({ description: 'AI provider to use (default: app default)', default: '' }),
    __metadata("design:type", String)
], MakeAiAgentCommand.prototype, "provider", void 0);
__decorate([
    flags.string({ description: 'Model to use (e.g. gpt-4o, claude-3-7-sonnet-latest)', default: '' }),
    __metadata("design:type", String)
], MakeAiAgentCommand.prototype, "model", void 0);
__decorate([
    flags.number({ description: 'Max token budget per request', default: 2048 }),
    __metadata("design:type", Number)
], MakeAiAgentCommand.prototype, "maxTokens", void 0);
//# sourceMappingURL=make_agent.js.map