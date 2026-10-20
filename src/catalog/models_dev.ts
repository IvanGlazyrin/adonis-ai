import type { ModelPricing } from '../budget/types.js'
import { modelsDevSource, type ModelsDevLoadOptions, type ModelsDevRefreshOptions } from './source.js'

export interface ModelsDevModelLimit {
  context?: number
  output?: number
}

export interface ModelsDevModelCost {
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
  reasoning?: number
}

export interface ModelsDevModelModalities {
  input?: string[]
  output?: string[]
}

export interface ModelsDevModel {
  id: string
  name: string
  description?: string
  family?: string
  tool_call?: boolean
  structured_output?: boolean
  attachment?: boolean
  reasoning?: boolean
  temperature?: boolean
  knowledge?: string
  release_date?: string
  last_updated?: string
  modalities?: ModelsDevModelModalities
  open_weights?: boolean
  limit?: ModelsDevModelLimit
  cost?: ModelsDevModelCost
  headers?: Record<string, string>
  [key: string]: unknown
}

export interface ModelsDevProvider {
  id: string
  name: string
  env: string[]
  api?: string
  npm?: string
  protocol?: string
  models: Record<string, ModelsDevModel>
  [key: string]: unknown
}

export type ModelsDevCatalog = Record<string, ModelsDevProvider>

export interface ModelCatalogEntry {
  id: string
  name: string
  providerId: string
  providerName: string
  contextLimit: number
  outputLimit: number
  toolCall: boolean
  structuredOutput: boolean
  pricing?: ModelPricing
  description?: string
  headers?: Record<string, string>
  rawModel?: ModelsDevModel
}

/**
 * Loads the models.dev catalog using in-memory and disk cache.
 */
export async function loadModelsDev(options?: ModelsDevLoadOptions): Promise<ModelsDevCatalog> {
  return modelsDevSource.load(options)
}

/**
 * Refreshes the models.dev catalog from remote source or validates local cache.
 */
export async function refreshModelsDev(options?: ModelsDevRefreshOptions): Promise<ModelsDevCatalog> {
  return modelsDevSource.refresh(options)
}

/**
 * Resets in-memory cached catalog.
 */
export function resetModelsDevCache(): void {
  modelsDevSource.resetCache()
}

/**
 * Looks up a model by provider ID and model ID.
 */
export async function findModel(
  providerId: string,
  modelId: string
): Promise<ModelCatalogEntry | undefined> {
  return modelsDevSource.getModel(providerId, modelId)
}

/**
 * Lists all providers in the catalog.
 */
export async function listProviders(): Promise<ModelsDevProvider[]> {
  return modelsDevSource.listProviders()
}

/**
 * Lists models, optionally filtered by provider.
 */
export async function listModels(providerId?: string): Promise<ModelCatalogEntry[]> {
  return modelsDevSource.listModels(providerId)
}
