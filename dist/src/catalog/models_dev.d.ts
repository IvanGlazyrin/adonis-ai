import type { ModelPricing } from '../budget/types.js';
import { type ModelsDevLoadOptions, type ModelsDevRefreshOptions } from './source.js';
export interface ModelsDevModelLimit {
    context?: number;
    output?: number;
}
export interface ModelsDevModelCost {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
    reasoning?: number;
}
export interface ModelsDevModelModalities {
    input?: string[];
    output?: string[];
}
export interface ModelsDevModel {
    id: string;
    name: string;
    description?: string;
    family?: string;
    tool_call?: boolean;
    structured_output?: boolean;
    attachment?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
    knowledge?: string;
    release_date?: string;
    last_updated?: string;
    modalities?: ModelsDevModelModalities;
    open_weights?: boolean;
    limit?: ModelsDevModelLimit;
    cost?: ModelsDevModelCost;
    headers?: Record<string, string>;
    [key: string]: unknown;
}
export interface ModelsDevProvider {
    id: string;
    name: string;
    env: string[];
    api?: string;
    npm?: string;
    protocol?: string;
    models: Record<string, ModelsDevModel>;
    [key: string]: unknown;
}
export type ModelsDevCatalog = Record<string, ModelsDevProvider>;
export interface ModelCatalogEntry {
    id: string;
    name: string;
    providerId: string;
    providerName: string;
    contextLimit: number;
    outputLimit: number;
    toolCall: boolean;
    structuredOutput: boolean;
    pricing?: ModelPricing;
    description?: string;
    headers?: Record<string, string>;
    rawModel?: ModelsDevModel;
}
/**
 * Loads the models.dev catalog using in-memory and disk cache.
 */
export declare function loadModelsDev(options?: ModelsDevLoadOptions): Promise<ModelsDevCatalog>;
/**
 * Refreshes the models.dev catalog from remote source or validates local cache.
 */
export declare function refreshModelsDev(options?: ModelsDevRefreshOptions): Promise<ModelsDevCatalog>;
/**
 * Resets in-memory cached catalog.
 */
export declare function resetModelsDevCache(): void;
/**
 * Looks up a model by provider ID and model ID.
 */
export declare function findModel(providerId: string, modelId: string): Promise<ModelCatalogEntry | undefined>;
/**
 * Lists all providers in the catalog.
 */
export declare function listProviders(): Promise<ModelsDevProvider[]>;
/**
 * Lists models, optionally filtered by provider.
 */
export declare function listModels(providerId?: string): Promise<ModelCatalogEntry[]>;
//# sourceMappingURL=models_dev.d.ts.map