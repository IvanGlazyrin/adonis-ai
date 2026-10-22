import type { LanguageModel } from 'ai'
import { AiException } from '../errors.js'

export type ProviderFactory = (settings: {
  name: string
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: typeof fetch
}) => { languageModel(modelId: string): LanguageModel }

/** npm package (or alias) → name of its provider-factory export. */
export const BUILTIN_PROVIDER_EXPORTS: Readonly<Record<string, string>> = {
  '@ai-sdk/amazon-bedrock': 'createAmazonBedrock',
  '@ai-sdk/anthropic': 'createAnthropic',
  '@ai-sdk/azure': 'createAzure',
  '@ai-sdk/google': 'createGoogleGenerativeAI',
  '@ai-sdk/google-vertex': 'createVertex',
  '@ai-sdk/google-vertex/anthropic': 'createVertexAnthropic',
  '@ai-sdk/openai': 'createOpenAI',
  '@ai-sdk/openai-compatible': 'createOpenAICompatible',
  '@openrouter/ai-sdk-provider': 'createOpenRouter',
  '@ai-sdk/xai': 'createXai',
  '@ai-sdk/mistral': 'createMistral',
  '@ai-sdk/groq': 'createGroq',
  '@ai-sdk/deepinfra': 'createDeepInfra',
  '@ai-sdk/cerebras': 'createCerebras',
  '@ai-sdk/cohere': 'createCohere',
  '@ai-sdk/gateway': 'createGateway',
  '@ai-sdk/togetherai': 'createTogetherAI',
  '@ai-sdk/perplexity': 'createPerplexity',
  '@ai-sdk/vercel': 'createVercel',
  '@gitlab/gitlab-ai-provider': 'createGitLab',
  'qwencode': 'createOpenAICompatible',
}

/** Aliases that are not importable names: alias → real npm package. */
const ALIAS_TO_PACKAGE: Readonly<Record<string, string>> = {
  qwencode: '@ai-sdk/openai-compatible',
}

export class ProviderFactoryRegistry {
  readonly #factories = new Map<string, ProviderFactory>()

  register(npm: string, factory: ProviderFactory): this {
    this.#factories.set(npm, factory)
    return this
  }

  has(npm: string): boolean {
    return this.#factories.has(npm)
  }

  async get(npm: string): Promise<ProviderFactory> {
    const registered = this.#factories.get(npm)
    if (registered) return registered

    const exportName = BUILTIN_PROVIDER_EXPORTS[npm]
    if (!exportName) {
      throw new AiException(
        `Provider package "${npm}" is not a built-in provider. Install it and register a factory for "${npm}" with ProviderFactoryRegistry.register().`,
        'E_AI_MISSING_DEPENDENCY'
      )
    }

    const specifier = ALIAS_TO_PACKAGE[npm] ?? npm
    let mod: Record<string, unknown>
    try {
      mod = (await import(specifier)) as Record<string, unknown>
    } catch (error) {
      throw new AiException(
        `Provider package "${specifier}" is required but could not be loaded. Install it (npm install ${specifier}).`,
        'E_AI_MISSING_DEPENDENCY',
        error
      )
    }

    const factory = mod[exportName]
    if (typeof factory !== 'function') {
      throw new AiException(
        `Provider package "${specifier}" does not export "${exportName}". Check the installed version or register a factory with register().`,
        'E_AI_MISSING_DEPENDENCY'
      )
    }
    return factory as ProviderFactory
  }
}
