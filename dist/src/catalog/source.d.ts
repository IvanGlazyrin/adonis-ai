import type { ModelPricing } from '../budget/types.js';
import type { LoggerContract } from '../ai_manager.js';
import type { ModelCatalogEntry, ModelsDevCatalog, ModelsDevProvider } from './models_dev.js';
export interface ModelsDevLoadOptions {
    preferCache?: boolean;
    cachePath?: string;
    overridePath?: string;
}
export interface ModelsDevRefreshOptions {
    forceRemote?: boolean;
    cachePath?: string;
    overridePath?: string;
}
/**
 * Resolves a provider/driver name (e.g. config driver `gemini`) to the models.dev provider id
 * (`google`). Unknown names are returned unchanged.
 */
export declare function resolveCatalogProviderId(providerId: string): string;
export declare class ModelsDevSource {
    #private;
    constructor(options?: {
        logger?: LoggerContract;
        cachePath?: string;
        overridePath?: string;
        ttlMs?: number;
        /**
         * Inject the built-in system providers (openai / anthropic / google) and the
         * ACP agents into the catalog when they are missing.
         *
         * Default: `true`. Set it to `false` when the catalog must stay exactly as
         * models.dev (or as the override file) returned it — for example when the
         * application injects its own system providers.
         */
        injectSystemProviders?: boolean;
    });
    setLogger(logger: LoggerContract): void;
    load(options?: ModelsDevLoadOptions): Promise<ModelsDevCatalog>;
    refresh(options?: ModelsDevRefreshOptions): Promise<ModelsDevCatalog>;
    resetCache(): void;
    getProvider(providerId: string): Promise<ModelsDevProvider | undefined>;
    getModel(providerId: string, modelId: string): Promise<ModelCatalogEntry | undefined>;
    getContextLimit(providerId: string, modelId: string): Promise<number | undefined>;
    supportsToolCall(providerId: string, modelId: string): Promise<boolean>;
    getModelPricing(providerId: string, modelId: string): Promise<ModelPricing | undefined>;
    listProviders(): Promise<ModelsDevProvider[]>;
    listModels(providerId?: string): Promise<ModelCatalogEntry[]>;
    /**
     * Dynamically resolves a model reference string (e.g. 'openai/gpt-4o', 'claude-3-5-sonnet', 'gpt-4o')
     * into a matched provider ID, model ID, and catalog entry.
     *
     * Besides exact ids, an undated alias resolves to the newest dated model that extends it
     * (`claude-3-5-sonnet` -> `claude-3-5-sonnet-20241022`).
     */
    resolveModel(modelRef: string, defaultProvider?: string): Promise<{
        providerId: string;
        modelId: string;
        entry?: ModelCatalogEntry;
    }>;
}
export declare const modelsDevSource: ModelsDevSource;
//# sourceMappingURL=source.d.ts.map