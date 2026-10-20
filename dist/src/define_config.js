import { ProviderConfigError } from './errors.js';
/**
 * Type-safe configuration helper for Adonis AI, following the AdonisJS 7 defineConfig pattern.
 * Returns a new object; the input is not mutated.
 *
 * When `fallbackCascade` is omitted, every other HTTP-API provider becomes a fallback. ACP agents
 * (local CLIs with shell/file access) and `custom` drivers are never added automatically: list
 * them in `fallbackCascade` explicitly if you really want them as fallbacks.
 */
export function defineConfig(config) {
    if (!config.providers || Object.keys(config.providers).length === 0) {
        throw new ProviderConfigError('global', 'At least one AI provider must be registered in "providers".');
    }
    let defaultProvider = config.default;
    if (!defaultProvider) {
        defaultProvider = Object.keys(config.providers)[0];
    }
    else if (!config.providers[defaultProvider]) {
        throw new ProviderConfigError(defaultProvider, `Default provider "${defaultProvider}" is not registered in "providers" map.`);
    }
    const fallbackCascade = config.fallbackCascade ??
        Object.entries(config.providers)
            .filter(([name, provider]) => name !== defaultProvider && provider.driver !== 'acp' && provider.driver !== 'custom')
            .map(([name]) => name);
    for (const name of fallbackCascade) {
        if (!config.providers[name]) {
            throw new ProviderConfigError(name, `Fallback provider "${name}" is not registered in "providers" map.`);
        }
    }
    return {
        ...config,
        default: defaultProvider,
        fallbackCascade,
        circuitBreaker: {
            failureThreshold: 5,
            recoveryTimeoutMs: 30_000,
            halfOpenMaxAttempts: 2,
            halfOpenMaxConcurrent: 1,
            ...config.circuitBreaker,
        },
        catalog: {
            preferCache: true,
            autoPricing: true,
            ...config.catalog,
        },
    };
}
//# sourceMappingURL=define_config.js.map