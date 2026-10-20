import type { CommandMetaData } from '@adonisjs/core/types/ace';
import type { BaseCommand } from '@adonisjs/core/ace';
type CommandClass = typeof BaseCommand;
/**
 * Ace command loader contract: returns metadata of every command in this package.
 * Metadata is derived from the command classes themselves, so no generated `commands.json` is needed.
 */
export declare function getMetaData(): Promise<CommandMetaData[]>;
/**
 * Ace command loader contract: resolves the command class for the given metadata.
 */
export declare function getCommand(metaData: Pick<CommandMetaData, 'commandName'>): Promise<CommandClass | null>;
export {};
//# sourceMappingURL=main.d.ts.map