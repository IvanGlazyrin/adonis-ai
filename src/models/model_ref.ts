export interface ParseModelRefOptions {
  modelRef?: string
  explicitProvider?: string
  knownProviderIds: string[]
}

export interface ParsedModelRef {
  providerId: string
  modelId: string
  wasProviderPrefixed: boolean
}

export function parseModelRef({
  modelRef,
  explicitProvider,
  knownProviderIds,
}: ParseModelRefOptions): ParsedModelRef {
  const ref = modelRef?.trim()
  const provider = explicitProvider?.trim()

  if (provider) {
    if (!knownProviderIds.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    const providerPrefix = `${provider}/`
    if (ref?.startsWith(providerPrefix)) {
      return {
        providerId: provider,
        modelId: ref.slice(providerPrefix.length),
        wasProviderPrefixed: true,
      }
    }

    if (ref) {
      return { providerId: provider, modelId: ref, wasProviderPrefixed: false }
    }
  }

  if (!ref) {
    throw new Error('A model reference or an explicit provider is required')
  }

  const [candidateProvider, ...modelParts] = ref.split('/')
  if (!candidateProvider || !knownProviderIds.includes(candidateProvider)) {
    throw new Error(`Unknown provider: ${candidateProvider || ref}`)
  }

  const modelId = modelParts.join('/')
  if (!modelId) {
    throw new Error(`Model id is required for provider: ${candidateProvider}`)
  }

  return { providerId: candidateProvider, modelId, wasProviderPrefixed: true }
}
