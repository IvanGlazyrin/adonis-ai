import { buildAcpRuntimeConfig } from '../acp/acp_agents.js'
import type { AcpRuntimeOptions } from '../acp/types.js'
import type { ModelsDevCatalog } from '../catalog/models_dev.js'
import { parseModelRef } from './model_ref.js'
import { resolveProviderNpm } from './protocols.js'
import type { ResolvedModel } from './types.js'

export interface ModelResolver {
  resolve(ref?: string): Promise<ResolvedModel>
}

export interface CatalogModelResolverOptions {
  catalog: { load(): Promise<ModelsDevCatalog> }
  /** Model reference used when `resolve()` is called without one. */
  defaultModelRef?: () => string | undefined
  /** Provider to use for refs that are not provider-prefixed. */
  explicitProvider?: () => string | undefined
  /** Default: the first non-empty `process.env[name]`. */
  getApiKey?: (envNames: string[]) => string | undefined
  acp?: AcpRuntimeOptions
}

const ACP_NPM = '@mcpc-tech/acp-ai-provider'

function firstEnvValue(envNames: string[]): string | undefined {
  for (const name of envNames) {
    const value = process.env[name]
    if (value) return value
  }
  return undefined
}

export class CatalogModelResolver implements ModelResolver {
  constructor(private readonly options: CatalogModelResolverOptions) {}

  async resolve(ref?: string): Promise<ResolvedModel> {
    const { options } = this
    const catalog = await options.catalog.load()
    const resolved = ref || options.defaultModelRef?.()
    const explicitProvider = options.explicitProvider?.()

    let providerID: string
    let modelID: string

    if (resolved) {
      const parsed = parseModelRef({
        modelRef: resolved,
        explicitProvider,
        knownProviderIds: Object.keys(catalog),
      })
      providerID = parsed.providerId
      modelID = parsed.modelId
      if (!catalog[providerID]) throw new Error(`Unknown provider: ${providerID}`)
    } else {
      providerID = explicitProvider || ''
      if (!catalog[providerID]) throw new Error('A model or provider is required')
      modelID = Object.keys(catalog[providerID].models)[0]
    }

    const provider = catalog[providerID]
    if (!provider.models[modelID] && resolved && provider.models[resolved]) {
      modelID = resolved
    }

    const modelInfo = provider.models[modelID]
    const apiKey = (options.getApiKey ?? firstEnvValue)(provider.env ?? [])
    const npm = resolveProviderNpm({ npmPackage: provider.npm, protocol: provider.protocol })

    if (provider.protocol === 'acp') {
      const agentId = modelID || Object.keys(provider.models)[0]
      const acpConfig = buildAcpRuntimeConfig(agentId, options.acp)
      if (acpConfig) {
        return { providerID, modelID: agentId, npm: npm || ACP_NPM, acpAgentId: agentId, acpConfig }
      }
    }

    return {
      providerID,
      modelID,
      apiUrl: provider.api,
      npm,
      apiKey,
      headers: modelInfo?.headers,
    }
  }
}
