import type { AcpAgentRuntimeConfig } from '../acp/types.js'

export interface ResolvedModel {
  providerID: string
  modelID: string
  apiUrl?: string
  npm?: string
  apiKey?: string
  headers?: Record<string, string>
  /**
   * Identity of the credential this model was resolved with, e.g. `key:42`.
   * Used to key circuit breakers per credential; never forwarded to the AI SDK.
   */
  credentialKey?: string
  acpAgentId?: string
  acpConfig?: AcpAgentRuntimeConfig
}
