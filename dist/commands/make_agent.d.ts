import { BaseCommand } from '@adonisjs/core/ace';
import type { CommandOptions } from '@adonisjs/core/types/ace';
export default class MakeAiAgentCommand extends BaseCommand {
    static commandName: string;
    static description: string;
    static options: CommandOptions;
    name: string;
    provider: string;
    model: string;
    maxTokens: number;
    run(): Promise<void>;
}
//# sourceMappingURL=make_agent.d.ts.map