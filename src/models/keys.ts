import type { ResolvedModel } from './types.js'

export function modelKeyFor(m: Pick<ResolvedModel, 'providerID' | 'modelID'>): string {
  return `${m.providerID}/${m.modelID}`
}

/**
 * Identity used for circuit-breaker lookups. Two credentials of the same
 * provider/model are different failure domains, so a non-empty credential key
 * wins; otherwise the plain `provider/model` key is used.
 */
export function breakerKeyFor(
  m: Pick<ResolvedModel, 'providerID' | 'modelID' | 'credentialKey'>
): string {
  return m.credentialKey ? m.credentialKey : modelKeyFor(m)
}
