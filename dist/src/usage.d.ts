import type { TokenUsage } from './types.js';
export declare const EMPTY_USAGE: Readonly<TokenUsage>;
/**
 * Normalizes AI SDK usage into `TokenUsage`.
 *
 * Reads the v7 shape (`inputTokens`, `outputTokens`, `inputTokenDetails.cacheReadTokens`,
 * `outputTokenDetails.reasoningTokens`) and falls back to the legacy v4 names
 * (`promptTokens`, `completionTokens`, `cachedInputTokens`, `reasoningTokens`).
 */
export declare function normalizeUsage(raw: unknown): TokenUsage;
/** Sums usage over several steps (used when a stream is aborted before the final total exists). */
export declare function sumUsage(items: unknown[]): TokenUsage;
//# sourceMappingURL=usage.d.ts.map