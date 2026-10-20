import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import type { LoggerContract } from '../ai_manager.js'
import { agentManifestSchema, type ToolPermission } from './manifest.js'

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export interface AgentPromptConfig {
  id: string
  description: string
  mode: 'primary' | 'subagent'
  stopSteps: number
  skills: string[]
  systemPrompt: string
  body: string
  skillPrompts: Record<string, string>
  outputSchemaName?: string
  outputSchema?: z.ZodTypeAny
  permissions: Record<string, ToolPermission>
  phases: string[]
  model?: string
  provider?: string
  temperature?: number
  maxTokens?: number
  metadata?: Record<string, unknown>
}

export interface AgentLoaderOptions {
  configsDir?: string
  skillsDir?: string
  logger?: LoggerContract
  schemaResolver?: (name: string) => z.ZodTypeAny | undefined
}

export class AgentLoader {
  private cache = new Map<string, AgentPromptConfig>()
  private configsDir?: string
  private skillsDir?: string
  private logger?: LoggerContract
  private schemaResolver?: (name: string) => z.ZodTypeAny | undefined

  constructor(options: AgentLoaderOptions = {}) {
    this.configsDir = options.configsDir
    this.skillsDir = options.skillsDir
    this.logger = options.logger
    this.schemaResolver = options.schemaResolver
  }

  setSchemaResolver(resolver: (name: string) => z.ZodTypeAny | undefined) {
    this.schemaResolver = resolver
  }

  setLogger(logger: LoggerContract) {
    this.logger = logger
  }

  async resolveDirs(
    customConfigsDir?: string,
    customSkillsDir?: string
  ): Promise<{ configsDir: string; skillsDir: string }> {
    const configsDir = customConfigsDir ?? this.configsDir
    const skillsDir = customSkillsDir ?? this.skillsDir
    if (configsDir && skillsDir) {
      return { configsDir, skillsDir }
    }

    let defaultConfigs = configsDir
    let defaultSkills = skillsDir

    try {
      const { default: app } = await import('@adonisjs/core/services/app')
      if (!defaultConfigs) defaultConfigs = app.makePath('resources/agent-configs')
      if (!defaultSkills) defaultSkills = app.makePath('resources/agent-skills')
    } catch {
      if (!defaultConfigs) defaultConfigs = path.resolve(process.cwd(), 'resources', 'agent-configs')
      if (!defaultSkills) defaultSkills = path.resolve(process.cwd(), 'resources', 'agent-skills')
    }

    return { configsDir: defaultConfigs, skillsDir: defaultSkills }
  }

  /**
   * Resolves `<dir>/<name>.md`, rejecting names that could escape `dir`
   * (`../`, absolute paths, separators). Returns `null` for unsafe names.
   */
  private safeResolve(dir: string, name: string): string | null {
    if (!SAFE_NAME.test(name) || name.includes('..')) return null
    const root = path.resolve(dir)
    const resolved = path.resolve(root, `${name}.md`)
    return resolved.startsWith(root + path.sep) ? resolved : null
  }

  loadSkill(skillName: string, skillsDir: string): string {
    const skillPath = this.safeResolve(skillsDir, skillName)
    if (!skillPath) {
      this.logger?.warn?.(`[AgentLoader] Refusing unsafe skill name: ${JSON.stringify(skillName)}`)
      return ''
    }
    try {
      if (fs.existsSync(skillPath)) {
        return fs.readFileSync(skillPath, 'utf-8').trim()
      }
    } catch (err: unknown) {
      this.logger?.warn?.(`[AgentLoader] Failed to read skill file "${skillPath}": ${err instanceof Error ? err.message : String(err)}`)
    }
    this.logger?.warn?.(`[AgentLoader] Skill not found: ${skillName} at ${skillPath}`)
    return ''
  }

  async loadAgentPrompt(
    agentId: string,
    customConfigsDir?: string,
    customSkillsDir?: string
  ): Promise<AgentPromptConfig> {
    const dirs = await this.resolveDirs(customConfigsDir, customSkillsDir)
    const cacheKey = `${dirs.configsDir}::${dirs.skillsDir}::${agentId}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const filePath = this.safeResolve(dirs.configsDir, agentId)
    if (!filePath) {
      throw new Error(`Invalid agent id: ${JSON.stringify(agentId)}`)
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Agent prompt configuration file not found: ${filePath}`)
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    // Strip a UTF-8 BOM and normalize line endings so the frontmatter regex always matches.
    const raw = content.replace(/^\u{FEFF}/u, '').replace(/\r\n/g, '\n')

    let manifestRaw: Record<string, unknown> = { id: agentId }
    let body = raw.trim()

    const match = raw.match(/^---\n([\s\S]*?)\n---(?:\n([\s\S]*))?$/)
    if (match) {
      try {
        const parsed = parseYaml(match[1])
        // `id` defaults to the file name when the frontmatter omits it
        manifestRaw = { id: agentId, ...(parsed !== null && typeof parsed === 'object' ? parsed : {}) }
        body = (match[2] ?? '').trim()
      } catch (err: unknown) {
        throw new Error(
          `Failed to parse YAML frontmatter for agent "${agentId}": ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    const manifestResult = agentManifestSchema.safeParse(manifestRaw)
    if (!manifestResult.success) {
      throw new Error(
        `Invalid agent manifest for "${agentId}": ${manifestResult.error.message}`
      )
    }
    const manifest = manifestResult.data

    const skillPrompts: Record<string, string> = {}
    const loadedSkillSections: string[] = []

    for (const skillName of manifest.skills) {
      const skillText = this.loadSkill(skillName, dirs.skillsDir)
      if (skillText) {
        skillPrompts[skillName] = skillText
        loadedSkillSections.push(skillText)
      }
    }

    // Dynamic injection of skills into system prompt
    const systemPrompt = loadedSkillSections.length > 0
      ? [body, ...loadedSkillSections].join('\n\n---\n\n')
      : body

    const resolvedOutputSchema = manifest.outputSchema && this.schemaResolver
      ? this.schemaResolver(manifest.outputSchema)
      : undefined

    const config: AgentPromptConfig = {
      id: manifest.id,
      description: manifest.description,
      mode: manifest.mode,
      stopSteps: manifest.stopSteps,
      skills: manifest.skills,
      systemPrompt,
      body,
      skillPrompts,
      outputSchemaName: manifest.outputSchema,
      outputSchema: resolvedOutputSchema,
      permissions: manifest.permissions,
      phases: manifest.phases,
      model: manifest.model,
      provider: manifest.provider,
      temperature: manifest.temperature,
      maxTokens: manifest.maxTokens,
      metadata: manifest.metadata,
    }

    this.cache.set(cacheKey, config)
    return config
  }

  async loadAllAgentPrompts(
    customConfigsDir?: string,
    customSkillsDir?: string
  ): Promise<Record<string, AgentPromptConfig>> {
    const dirs = await this.resolveDirs(customConfigsDir, customSkillsDir)
    if (!fs.existsSync(dirs.configsDir)) {
      this.logger?.warn?.(`[AgentLoader] Configs directory does not exist: ${dirs.configsDir}`)
      return {}
    }

    const entries = fs.readdirSync(dirs.configsDir)
    const mdFiles = entries.filter((f) => f.endsWith('.md'))
    const results = await Promise.all(
      mdFiles.map(async (f) => {
        const id = f.replace(/\.md$/, '')
        return [id, await this.loadAgentPrompt(id, dirs.configsDir, dirs.skillsDir)] as const
      })
    )

    return Object.fromEntries(results)
  }

  invalidateCache(agentId?: string): void {
    if (!agentId) {
      this.cache.clear()
      return
    }

    for (const key of this.cache.keys()) {
      if (key.endsWith(`::${agentId}`)) {
        this.cache.delete(key)
      }
    }
  }
}

export const agentLoader = new AgentLoader()

export async function loadAgentPrompt(
  agentId: string,
  configsDir?: string,
  skillsDir?: string
): Promise<AgentPromptConfig> {
  return agentLoader.loadAgentPrompt(agentId, configsDir, skillsDir)
}

export async function loadAllAgentPrompts(
  configsDir?: string,
  skillsDir?: string
): Promise<Record<string, AgentPromptConfig>> {
  return agentLoader.loadAllAgentPrompts(configsDir, skillsDir)
}

export function invalidateAgentCache(agentId?: string): void {
  agentLoader.invalidateCache(agentId)
}
