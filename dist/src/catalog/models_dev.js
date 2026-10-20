import { modelsDevSource } from './source.js';
/**
 * Loads the models.dev catalog using in-memory and disk cache.
 */
export async function loadModelsDev(options) {
    return modelsDevSource.load(options);
}
/**
 * Refreshes the models.dev catalog from remote source or validates local cache.
 */
export async function refreshModelsDev(options) {
    return modelsDevSource.refresh(options);
}
/**
 * Resets in-memory cached catalog.
 */
export function resetModelsDevCache() {
    modelsDevSource.resetCache();
}
/**
 * Looks up a model by provider ID and model ID.
 */
export async function findModel(providerId, modelId) {
    return modelsDevSource.getModel(providerId, modelId);
}
/**
 * Lists all providers in the catalog.
 */
export async function listProviders() {
    return modelsDevSource.listProviders();
}
/**
 * Lists models, optionally filtered by provider.
 */
export async function listModels(providerId) {
    return modelsDevSource.listModels(providerId);
}
//# sourceMappingURL=models_dev.js.map