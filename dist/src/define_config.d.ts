import type { AiConfig } from './types.js';
/**
 * Type-safe configuration helper for Adonis AI, following the AdonisJS 7 defineConfig pattern.
 * Returns a new object; the input is not mutated.
 *
 * When `fallbackCascade` is omitted, every other HTTP-API provider becomes a fallback. ACP agents
 * (local CLIs with shell/file access) and `custom` drivers are never added automatically: list
 * them in `fallbackCascade` explicitly if you really want them as fallbacks.
 */
export declare function defineConfig(config: AiConfig): AiConfig;
//# sourceMappingURL=define_config.d.ts.map