# Changelog

All notable changes to `adonis-ai-kit` are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.3.0] - 2026-10-22

### Added

- Single `Logger` type shared by all modules (`LoggerContract` stays as a deprecated alias).
- `ErrorClassification.errorClass` and `ErrorClassification.countsAsFailure`, plus the `countsAsBreakerFailure()` helper.
- `CircuitBreaker.acquire()` returning a `BreakerPermit`, and `CircuitBreaker.resetAll()`.
- `ToolAccessOptions.permissions` for per-call tool permissions.
- ACP: `AcpAgentConfig.credentialEnv` and `buildAcpRuntimeConfig(agentId, options)` with `projectMcpPath` (the positional form keeps working).
- Catalog: `systemProviders: { fallback, acp }` option (also available as `CatalogConfig.systemProviders`) to inject fallback and ACP providers independently.
- Japa test harness.

### Fixed

- One error taxonomy now drives both fallback and circuit-breaker decisions.
- HTTP status codes are found in `status`, `response.status`, nested `cause` and `lastError` (AI SDK `RetryError`).
- HTTP 409 and 425 are classified as `overloaded`.

### Changed

Behavior changes to be aware of:

- `prompt_too_long` and `no_output_generated` errors now fall back to the next provider but never open the circuit breaker.
- Errors recognised only through `isRetryable === true` fall back, but no longer count against the circuit breaker.
- `ErrorClassification` gained two required fields (`errorClass`, `countsAsFailure`). This only affects code that constructs the interface itself.
- `dist/` is no longer tracked in git (it is still built and shipped in the npm package).

### Deprecated

- `injectSystemProviders` — use `systemProviders`.
- The `sourcecraft` and `freebuff` default ACP agents — they will be removed from the defaults in 2.0; register them with `registerAcpAgent()`.
- `LoggerContract` — use `Logger`.

## [1.2.0]

Baseline for this changelog. See the git history for earlier changes.
