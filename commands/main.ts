import type { CommandMetaData } from '@adonisjs/core/types/ace'
import type { BaseCommand } from '@adonisjs/core/ace'

type CommandClass = typeof BaseCommand

const loaders: Array<() => Promise<{ default: CommandClass }>> = [
  () => import('./ai_test.js'),
  () => import('./make_agent.js'),
]

let cachedMetaData: CommandMetaData[] | undefined
const cachedCommands = new Map<string, CommandClass>()

async function loadAll(): Promise<CommandClass[]> {
  return Promise.all(loaders.map(async (load) => (await load()).default))
}

/**
 * Ace command loader contract: returns metadata of every command in this package.
 * Metadata is derived from the command classes themselves, so no generated `commands.json` is needed.
 */
export async function getMetaData(): Promise<CommandMetaData[]> {
  if (cachedMetaData) return cachedMetaData
  const commands = await loadAll()
  for (const command of commands) cachedCommands.set(command.commandName, command)
  cachedMetaData = commands.map((command) => command.serialize())
  return cachedMetaData
}

/**
 * Ace command loader contract: resolves the command class for the given metadata.
 */
export async function getCommand(metaData: Pick<CommandMetaData, 'commandName'>): Promise<CommandClass | null> {
  if (cachedCommands.size === 0) await getMetaData()
  return cachedCommands.get(metaData.commandName) ?? null
}
