import { BaseCommand } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';
export default class AiTestCommand extends BaseCommand {
    static commandName: string;
    static description: string;
    static options: CommandOptions;
    provider?: string;
    model?: string;
    testPrompt: string;
    run(): Promise<void>;
}
//# sourceMappingURL=ai_test.d.ts.map