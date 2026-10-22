# Changelog

All notable changes to `adonis-ai-kit` are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.4.0] - 2026-10-22

### Added

- `adonis-ai-kit/models` subpath export:
  - Types and helpers: `ResolvedModel`, `parseModelRef`, `modelKeyFor`, `breakerKeyFor`, `PROTOCOL_TO_NPM`, `resolveProviderNpm`.
  - `ProviderFactory`, `BUILTIN_PROVIDER_EXPORTS` and `ProviderFactoryRegistry` (lazy import of known AI SDK provider packages, plus `register()` for custom ones).
  - `LanguageModelFactory`: 180 s fetch timeout, secret-header redaction in logs, ACP models through `AcpDriver`, and `shutdown()`.
  - `ModelResolver` and `CatalogModelResolver`.
  - `buildChainCandidates`, `runModelChain` and `FallbackEvent` for running a call over an ordered model chain with per-credential circuit breakers.
- `AcpDriverDeps.runtime`: a prebuilt runtime config for the ACP driver.
- `AiManager` call options:
  - `schema` (structured `output` on `generateText` and `streamText`), `stopWhen`, `maxRetries`, `onStepFinish`.
  - `models` and `onFallback` to run a call over a dynamic model chain.
- `AiConfig.resolver` and `AiConfig.languageModels`.
- Optional `peerDependencies` for the AI SDK provider packages.

### Notes

- An exhausted `models` chain rethrows the last error (or `ProviderUnavailableError` if no candidate could be attempted), unlike the provider cascade, which throws `CascadingFallbackError`.

## [1.3.0] - 2026-10-22

### Added

- Single `Logger` type shared by all modules (`LoggerContract` stays as a deprecated alias).
- `ErrorClassification.errorClass` and `ErrorClassification.countsAsFailure`, plus the `countsAsBreakerFailure()` helper.
- `CircuitBreaker.acquire()` returning a `BreakerPermit`, and `CircuitBreaker.resetAll()`.
- `ToolAccessOptions.permissions` for per-call tool permissions.
- ACP: `AcpAgentConfig.credentialEnv` and `buildAcpRuntimeConfig(agentId, options)` with `projectMcpPath` (the positional form keeps working).
- Catalog: `systemProviders: { fallback, acp }` option (also available as `CatalogConfig.systemProviders`) to inject fallback and ACP providers independently.

### Fixed

- One error taxonomy now drives both fallback and circuit-breaker decisions.
- HTTP status codes are found in `status`, `response.status`, nested `cause` and `lastError` (AI SDK `RetryError`).
- HTTP 409 and 425 are classified as `overloaded`.
- ACP agents registered with `setAcpAgents()`/`registerAcpAgent()` without `credentialEnv` inherit the built-in agent's credentials for the same id (keeps 1.2 behavior); `credentialEnv: []` opts out.

### Changed

Behavior changes to be aware of:

- `prompt_too_long` and `no_output_generated` errors now fall back to the next provider but never open the circuit breaker.
- Errors recognised only through `isRetryable === true` fall back, but no longer count against the circuit breaker.
- `ErrorClassification` gained two required fields (`errorClass`, `countsAsFailure`). This only affects code that constructs the interface itself.
- `dist/` is no longer tracked in git (it is still built and shipped in the npm package).

### Development

- Japa test harness.

### Deprecated

- `injectSystemProviders` — use `systemProviders`.
- The `sourcecraft` and `freebuff` default ACP agents — they will be removed from the defaults in 2.0; register them with `registerAcpAgent()`.
- `LoggerContract` — use `Logger`.

## [1.2.0]

Baseline for this changelog. See the git history for earlier changes.
