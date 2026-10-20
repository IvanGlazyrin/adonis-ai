import type { StreamAIOptions, StreamTextResult } from './types.js';
/**
 * Registers the response.streamAI macro on the AdonisJS HttpResponse class.
 * Streams LLM output to React/Inertia clients via Server-Sent Events, the AI SDK UI message
 * stream (`useChat`), or raw text.
 *
 * Headers are set through `response.header()` so CORS/cookie headers set by middleware survive,
 * the body goes through `response.stream()`, and a client disconnect aborts the LLM call.
 */
export declare function registerResponseMacro(): void;
declare module '@adonisjs/core/http' {
    interface HttpResponse {
        streamAI(streamResult: StreamTextResult, options?: StreamAIOptions): void;
    }
}
//# sourceMappingURL=response_macro.d.ts.map