const loaders = [
    () => import('./ai_test.js'),
    () => import('./make_agent.js'),
];
let cachedMetaData;
const cachedCommands = new Map();
async function loadAll() {
    return Promise.all(loaders.map(async (load) => (await load()).default));
}
/**
 * Ace command loader contract: returns metadata of every command in this package.
 * Metadata is derived from the command classes themselves, so no generated `commands.json` is needed.
 */
export async function getMetaData() {
    if (cachedMetaData)
        return cachedMetaData;
    const commands = await loadAll();
    for (const command of commands)
        cachedCommands.set(command.commandName, command);
    cachedMetaData = commands.map((command) => command.serialize());
    return cachedMetaData;
}
/**
 * Ace command loader contract: resolves the command class for the given metadata.
 */
export async function getCommand(metaData) {
    if (cachedCommands.size === 0)
        await getMetaData();
    return cachedCommands.get(metaData.commandName) ?? null;
}
//# sourceMappingURL=main.js.map