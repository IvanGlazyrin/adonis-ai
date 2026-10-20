var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BaseCommand, flags } from '@adonisjs/core/ace';
export default class AiTestCommand extends BaseCommand {
    static commandName = 'ai:test';
    static description = 'Test connectivity, latency, and generation with configured AI providers';
    static options = {
        startApp: true,
    };
    async run() {
        const ai = await this.app.container.make('ai');
        this.ui.logger.info('🤖 Testing Adonis AI Provider Connectivity...\n');
        const config = ai.getConfig();
        const providersToTest = this.provider ? [this.provider] : Object.keys(config.providers);
        if (providersToTest.length === 0) {
            this.ui.logger.error('No AI providers configured in config/ai.ts!');
            return;
        }
        const table = this.ui.table();
        table.head(['Provider', 'Model', 'Status', 'Latency', 'Circuit Breaker', 'Cost ($)']);
        for (const pName of providersToTest) {
            const pConfig = config.providers[pName];
            if (!pConfig) {
                this.ui.logger.error(`Provider "${pName}" not found in config!`);
                continue;
            }
            const testModel = this.model ?? pConfig.defaultModel ?? 'default';
            const start = Date.now();
            try {
                const response = await ai.generateText({
                    provider: pName,
                    model: this.model,
                    prompt: this.testPrompt || "Respond with PONG and your model identity in 10 words or less.",
                    maxOutputTokens: 50,
                    agentName: 'ace-ai-test',
                });
                const latency = Date.now() - start;
                const stats = ai.getCircuitBreaker().getStats(`${response.provider}:${response.model}`);
                // A fallback provider answering is NOT a pass for the provider under test
                const answeredByFallback = response.provider !== pName;
                table.row([
                    this.colors.cyan(pName),
                    response.model,
                    answeredByFallback
                        ? this.colors.yellow(`⚠ FALLBACK (${response.provider})`)
                        : this.colors.green('✔ OK'),
                    `${latency}ms`,
                    this.colors.green(stats.state.toUpperCase()),
                    response.costUsd !== undefined ? `$${response.costUsd.toFixed(6)}` : 'N/A',
                ]);
                this.ui.logger.info(`[${pName}] Output: "${response.text.trim()}"`);
            }
            catch (err) {
                const latency = Date.now() - start;
                const stats = ai.getCircuitBreaker().getStats(`${pName}:${testModel}`);
                table.row([
                    this.colors.cyan(pName),
                    testModel,
                    this.colors.red('✖ FAILED'),
                    `${latency}ms`,
                    this.colors.red(stats.state.toUpperCase()),
                    'N/A',
                ]);
                this.ui.logger.error(`[${pName}] Error: ${err.message}`);
            }
        }
        this.ui.logger.log('');
        table.render();
        this.ui.logger.log('');
        const totalCost = ai.getCostTracker().getTotalCost();
        const totalTokens = ai.getCostTracker().getTotalTokens();
        this.ui.logger.info(`Total session cost: ${totalCost.toFixed(6)} | Tokens: ${totalTokens}`);
    }
}
__decorate([
    flags.string({ description: 'Specific provider to test (e.g. openai, anthropic, gemini, groq, ollama)' }),
    __metadata("design:type", String)
], AiTestCommand.prototype, "provider", void 0);
__decorate([
    flags.string({ description: 'Model to test with' }),
    __metadata("design:type", String)
], AiTestCommand.prototype, "model", void 0);
__decorate([
    flags.string({
        name: 'prompt',
        description: 'Test prompt to send',
        default: 'Respond with "PONG" and your model identity in 10 words or less.',
    }),
    __metadata("design:type", String)
], AiTestCommand.prototype, "testPrompt", void 0);
//# sourceMappingURL=ai_test.js.map