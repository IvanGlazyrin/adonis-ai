# adonis-ai-kit: доводка до самостоятельной библиотеки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать adonis-ai-kit переносимой библиотекой, фасад которой годится для приложений с динамическими ключами, и перевести на неё оставшийся общий LLM-слой optimus-grid, не сломав приложение ни на одном шаге.

**Architecture:** Три вехи. M1 (1.3.0): исправления и точки расширения в существующих модулях, приложение убирает обходные пути. M2 (1.4.0): новый модуль `adonis-ai-kit/models` (резолвер → фабрика моделей → цепочка с fallback), на нём же `AiManager`; приложение заменяет свои реализации реэкспортами. M3 (2.0.0): удаление deprecated. Каждую версию сначала проверяют в ветке приложения на tarball, потом публикуют.

**Tech Stack:** TypeScript (NodeNext, ES2022), AI SDK `ai@^7`, zod, AdonisJS 7, Japa 5 + `@poppinss/ts-exec`.

**Spec:** `docs/superpowers/specs/2026-10-22-library-hardening-design.md` (решения D1–D11).

## Global Constraints

- Пакет: `engines.node >=22.0.0`; `ai ^7.0.0`; `zod ^3.25.76 || ^4.1.8`. Приложение: Node >=24.
- В 1.x — никаких удалений и переименований экспортов: только добавления и `@deprecated`.
- В `src/` нет терминов домена (trading, symbol, bybit, order) и импорта `@adonisjs/core`, кроме уже существующего динамического `import('@adonisjs/core/services/app')` в `agents/loader.ts`.
- Проверка пакета после каждой задачи: `npm run typecheck && npm test && npm run test:regression` — всё зелёное.
- Проверка приложения после каждой его задачи (каталог `C:\projects\optimus-grid`): `npm run typecheck` → exit 0 и `node ace test unit` → 0 failed. Базовая линия на 2026-10-22: 1168 passed. Тест можно удалить, только если он перенесён в пакет или проверял удалённый код. Список удалённых тестов указывается в сообщении коммита.
- Работа в приложении идёт в ветке (`feat/adonis-ai-kit-1.3`, затем `feat/adonis-ai-kit-1.4`). Пакет-кандидат ставится командой `npm install --no-save ../adonis-ai/adonis-ai-kit-<ver>.tgz`. В коммитах ветки `package.json` не меняется до задачи публикации. Ветку не мержат, пока опубликованная версия не закреплена.
- Пути импорта в приложении (`#services/llm/*`, `app/agents/configs/*`) сохраняются: реализация удаляется, файл становится реэкспортом.
- Публикация — это push тега `v*` (запускает `.github/workflows/release.yml`). Её делают **только после явного подтверждения пользователя**.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **ACP-агенты после миграции молча получают отказ.** Сейчас `@mcpc-tech/acp-ai-provider` без обработчика сам выбирает первый вариант, то есть разрешает. `AcpDriver` по умолчанию `ask`, а UI для подтверждения нет. Ожидание: поведение приложения не меняется. Тест — в задаче 18 (фабрика приложения передаёт `permissionPolicy: 'allow'`).
2. **Ошибка, где статус спрятан в `cause` или `lastError`** (AI SDK `RetryError` при `maxRetries > 0`). Ожидание: 429 внутри `RetryError` → fallback. Тест — в задаче 3.
3. **Два одновременных запроса к модели в half-open.** Ожидание: проходит один пробный запрос, второй идёт на следующую модель. Тест — в задаче 14.
4. **Отмена вызывающим посреди цепочки.** Ожидание: нет fallback, breaker не засчитывает. Тест — в задаче 14.
5. **Строгая установка (pnpm), пакет провайдера не установлен.** Ожидание: понятная ошибка `E_AI_MISSING_DEPENDENCY` с именем npm-пакета, а не `ERR_MODULE_NOT_FOUND`. Тест — в задаче 12.

---

## M0. Инфраструктура пакета

### Task 1: Тесты на Japa поверх TS-исходников, dist вне git, CI

**Files:**
- Create: `bin/test.ts`, `tsconfig.test.json`, `tests/unit/smoke.spec.ts`
- Modify: `package.json` (scripts, devDependencies), `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md` (название `adonis-ai` → `adonis-ai-kit` в заголовке, таблице и схеме), `tests/regression.mjs:6` (комментарий «after building all three packages» → «Run after `npm run build`»)
- Delete from git: `dist/` (`git rm -r --cached dist`)

**Interfaces:**
- Produces: `npm test` запускает `tests/unit/**/*.spec.ts`; `npm run typecheck` проверяет и исходники, и тесты. Все последующие задачи кладут тесты в `tests/unit/<module>/*.spec.ts` и импортируют из `../../src/...js`.

- [ ] **Step 1:** devDependencies: `@japa/runner ^5.3.0`, `@japa/assert ^4.2.0`, `@poppinss/ts-exec ^1.4.4` (те же версии, что в optimus-grid). Scripts: `"test": "node --import=@poppinss/ts-exec bin/test.ts"`, `"typecheck": "tsc --noEmit -p tsconfig.test.json"`.
- [ ] **Step 2:** `bin/test.ts`: `processCLIArgs(process.argv.splice(2))`, `configure({ files: ['tests/unit/**/*.spec.ts'], plugins: [assert()] })`, `run()`. `tsconfig.test.json`: `extends ./tsconfig.json`, `noEmit: true`, `include` = исходные каталоги + `tests/**/*.ts` + `bin/**/*.ts`.
- [ ] **Step 3:** Smoke-тест:

```ts
import { test } from '@japa/runner'
import { CircuitBreaker } from '../../src/circuit_breaker.js'

test('ts sources run under japa', ({ assert }) => {
  assert.equal(new CircuitBreaker().getState('k'), 'closed')
})
```

- [ ] **Step 4:** Run: `npm test` → `1 passed`; `npm run typecheck` → exit 0.
- [ ] **Step 5:** `.gitignore` += `dist/`; `git rm -r --cached dist`. В CI и release перед тестами: `npm run typecheck` и `npm test` (release: перед `npm publish`, после `npm run build`).
- [ ] **Step 6:** Run: `npm run build && npm run test:regression` → 47 + 12 passed; `git status` не показывает `dist/`.
- [ ] **Step 7:** Commit: `chore(test): add japa test harness, stop tracking dist`.

---

## M1. Версия 1.3.0 — исправления и точки расширения

### Task 2: Один тип `Logger`

**Files:**
- Create: `src/logger.ts`, `tests/unit/logger.spec.ts`
- Modify: `src/guard/types.ts:1-6`, `src/budget/types.ts:1-6`, `src/ai_manager.ts:373-378`, `src/index.ts` (убрать ручное разрешение неоднозначности `Logger`, если tsc больше не требует), `src/catalog/source.ts`, `src/agents/loader.ts`, `src/acp/*.ts` (импорт `LoggerContract` → `Logger`)

**Interfaces:**
- Produces: `export interface Logger { debug?(message: string, ...args: unknown[]): void; info(message: string, ...args: unknown[]): void; warn(...): void; error(...): void }` из `src/logger.ts`, реэкспорт из корня; `/** @deprecated Use Logger */ export type LoggerContract = Logger` в `ai_manager.ts`; `guard/types` и `budget/types` делают `export type { Logger } from '../logger.js'`.

- [ ] **Step 1:** Тест проверяет типы при `npm run typecheck`. Объект с перегрузками в стиле pino должен присваиваться `Logger`:

```ts
import { test } from '@japa/runner'
import type { Logger } from '../../src/index.js'
import type { Logger as GuardLogger } from '../../src/guard/index.js'
import type { Logger as BudgetLogger } from '../../src/budget/index.js'

interface PinoLike {
  info(obj: unknown, msg?: string, ...a: unknown[]): void
  info(msg: string, ...a: unknown[]): void
  warn(msg: string, ...a: unknown[]): void
  error(msg: string, ...a: unknown[]): void
  debug(msg: string, ...a: unknown[]): void
}
declare const pino: PinoLike

test('one Logger type everywhere', ({ assert }) => {
  const a: Logger = pino
  const b: GuardLogger = a
  const c: BudgetLogger = b
  assert.exists(c)
})
```

- [ ] **Step 2:** Run: `npm run typecheck` → проходит уже сейчас (типы структурно совпадают). Тест фиксирует контракт и не даёт ему разойтись. Затем выполнить Step 3.
- [ ] **Step 3:** Ввести `src/logger.ts` и заменить три объявления реэкспортами.
- [ ] **Step 4:** Run: пакетная проверка из Global Constraints → зелёная.
- [ ] **Step 5:** Commit: `refactor(logger): single Logger type across modules`.

### Task 3: Классификатор ошибок — один источник истины

**Files:**
- Modify: `src/error_classifier.ts`, `src/ai_manager.ts:677` (предикат breaker'а), `src/ai_manager.ts:929` (`onError` стрима)
- Test: `tests/unit/error_classifier.spec.ts` (также перенести общие случаи из `optimus-grid/tests/unit/error_classifier.spec.ts`)

**Interfaces:**
- Produces: `interface ErrorClassification { kind: ErrorKind; reason: string; errorClass: ErrorClass; countsAsFailure: boolean }`. Сигнатуры `classifyError(error, abortSignal?)`, `classifyErrorClass(error)`, `isRetryableError(errorClass)` не меняются. `export function countsAsBreakerFailure(errorClass: ErrorClass): boolean`.

- [ ] **Step 1:** Табличный тест:

```ts
const e = (props: Record<string, unknown>, msg = 'x') => Object.assign(new Error(msg), props)
const cases: Array<[string, unknown, ErrorKind, ErrorClass, boolean]> = [
  ['400 context length', e({ statusCode: 400 }, 'maximum context length is 8192'), 'retryable', 'prompt_too_long', false],
  ['no output', e({ name: 'AI_NoOutputGeneratedError' }), 'retryable', 'no_output_generated', false],
  ['429 in cause', e({ cause: { statusCode: 429 } }), 'retryable', 'rate_limit', true],
  ['RetryError lastError 503', e({ name: 'AI_RetryError', lastError: { statusCode: 503 } }), 'retryable', 'server_error', true],
  ['status field', e({ status: 502 }), 'retryable', 'server_error', true],
  ['409', e({ statusCode: 409 }), 'retryable', 'overloaded', true],
  ['ECONNRESET', e({ code: 'ECONNRESET' }), 'retryable', 'network_error', true],
  ['TimeoutError', e({ name: 'TimeoutError' }), 'retryable', 'timeout', true],
  ['401', e({ statusCode: 401 }), 'fatal', 'auth_error', false],
  ['validation', e({ name: 'AI_TypeValidationError' }), 'fatal', 'unknown', false],
]
for (const [name, err, kind, errorClass, counts] of cases) {
  test(name, ({ assert }) => {
    const c = classifyError(err)
    assert.deepInclude(c, { kind, errorClass, countsAsFailure: counts })
    assert.equal(classifyErrorClass(err), errorClass)
  })
}
test('caller abort wins over a retryable status', ({ assert }) => {
  const ac = new AbortController(); ac.abort()
  assert.include(classifyError(e({ statusCode: 503 }), ac.signal), { kind: 'fatal', countsAsFailure: false })
})
test('open breaker is skip', ({ assert }) => {
  assert.equal(classifyError(new ProviderUnavailableError('p')).kind, 'skip')
})
```

- [ ] **Step 2:** Run: `npm test -- --files tests/unit/error_classifier.spec.ts` → FAIL (нет `errorClass` и `countsAsFailure`; `cause`/`lastError`/`status`/409 не распознаются).
- [ ] **Step 3:** Реализовать по D3. Поиск статуса и кода — одна функция `findErrorField(error, pick, depth = 5)` с обходом `cause` и `lastError`. Порядок в `classifyError`: abort-сигнал → `ProviderUnavailableError`/конфиг → `AbortError` → `FATAL_NAMES` → `errorClass` → `kind = isRetryableError ? 'retryable' : 'fatal'`, при этом сохраняются текущие эвристики `err.isRetryable === true` и сетевые сообщения для `unknown`. В `AiManager` breaker засчитывает по `countsAsFailure`, fallback решается по `kind`.
- [ ] **Step 4:** Run: пакетная проверка → зелёная (регрессия `fatal: 400 bad request is not retried` должна остаться зелёной: 400 без признаков длины → `invalid_request`, fatal).
- [ ] **Step 5:** README, раздел про fallback: одна строка о том, что `prompt_too_long` переходит на другую модель, но не открывает breaker.
- [ ] **Step 6:** Commit: `fix(errors): derive fallback and breaker decisions from one taxonomy`.

### Task 4: `CircuitBreaker.acquire()` и `resetAll()`

**Files:**
- Modify: `src/circuit_breaker.ts`
- Test: `tests/unit/circuit_breaker.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface BreakerPermit {
  readonly key: string
  readonly isProbe: boolean
  success(): void            // = recordSuccess(key), освобождает слот пробы
  failure(error?: unknown): void // = recordFailure(key), освобождает слот
  release(): void            // освобождает слот без записи (ошибка не засчитывается)
}
acquire(key: string): BreakerPermit | null // null: open или слоты half-open заняты
resetAll(): void
```

Разрешение закрывается один раз, повторные вызовы ничего не делают. `execute()` переписывается через `acquire()`, тексты `ProviderUnavailableError` прежние.

- [ ] **Step 1:** Тесты (`recoveryTimeoutMs: 0`, чтобы open сразу переходил в half-open):

```ts
const cb = () => new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 0, halfOpenMaxAttempts: 2, halfOpenMaxConcurrent: 1 })
test('half-open lets exactly one probe through', ({ assert }) => {
  const b = cb(); b.recordFailure('k')
  const p1 = b.acquire('k'); assert.isTrue(p1!.isProbe)
  assert.isNull(b.acquire('k'))
  p1!.release(); assert.isNotNull(b.acquire('k'))
})
test('a permit settles once', ({ assert }) => {
  const b = cb(); b.recordFailure('k')
  const p = b.acquire('k')!; p.success(); p.success()
  assert.equal(b.getState('k'), 'half_open') // одна успешная проба из двух
})
test('closed permits are not probes and do not block', ({ assert }) => {
  const b = cb(); const p = b.acquire('k')!; assert.isFalse(p.isProbe); assert.isNotNull(b.acquire('k'))
})
test('resetAll closes every key', ({ assert }) => {
  const b = cb(); b.recordFailure('a'); b.recordFailure('b'); b.resetAll()
  assert.deepEqual([b.getState('a'), b.getState('b')], ['closed', 'closed'])
})
```

- [ ] **Step 2:** Run: файл → FAIL (`acquire is not a function`).
- [ ] **Step 3:** Реализовать. `isAvailable()` не меняется (не захватывает).
- [ ] **Step 4:** Run: пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(breaker): add acquiring permits for manual mode and resetAll`.

### Task 5: Права инструментов на один вызов

**Files:**
- Modify: `src/guard/registry.ts:10-17` (`ToolAccessOptions`), `resolveTool`
- Test: `tests/unit/guard/registry_permissions.spec.ts`

**Interfaces:**
- Produces: `ToolAccessOptions.permissions?: Record<string, ToolPermission>`. Если передано, это единственный источник прав для вызова: инструмента нет в карте → `defaultPermission` реестра; матрица агента не читается и не меняется.

- [ ] **Step 1:** Тесты:

```ts
const make = () => new ToolRegistry({ defaultPermission: 'deny' })
  .registerTool('a', { description: 'a', execute: async () => 1 })
  .registerTool('b', { description: 'b', execute: async () => 2 })
test('per-call permissions do not leak between calls', ({ assert }) => {
  const r = make()
  assert.deepEqual(Object.keys(r.getToolsByList(['a', 'b'], { permissions: { a: 'allow' } })), ['a'])
  assert.deepEqual(Object.keys(r.getToolsByList(['a', 'b'], { permissions: { b: 'allow' } })), ['b'])
  assert.equal(r.getAgentPermission('', 'a'), 'deny')
})
test('per-call permissions override the agent matrix', ({ assert }) => {
  const r = make().setAgentPermissions('x', { a: 'allow' })
  assert.deepEqual(Object.keys(r.getToolsForAgent('x', { permissions: { a: 'deny', b: 'allow' } })), ['b'])
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(guard): per-call tool permissions`.

### Task 6: ACP — `credentialEnv`, `projectMcpPath`, deprecated-агенты

**Files:**
- Modify: `src/acp/types.ts` (`AcpAgentConfig`), `src/acp/acp_agents.ts:20-95` (данные по умолчанию), `src/acp/acp_agents.ts:239-330` (`buildAcpRuntimeConfig`), `README.md` (раздел ACP)
- Test: `tests/unit/acp/runtime_config.spec.ts` (также перенести общие случаи из `optimus-grid/tests/unit/acp_agents.spec.ts`)

**Interfaces:**
- Produces:

```ts
interface AcpAgentConfig { /* как было */ credentialEnv?: Array<{ target: string; sources: string[] }> }
export interface AcpRuntimeOptions {
  getEnv?: (key: string) => string | undefined   // default: process.env
  envSource?: Record<string, string | undefined> // default: process.env
  logger?: Logger
  projectMcpPath?: string // используется, если ${prefix}_PROJECT_MCP_PATH не задан
}
export function buildAcpRuntimeConfig(agentId: string, options?: AcpRuntimeOptions): AcpAgentRuntimeConfig | null
// прежняя позиционная форма (agentId, getEnv, envSource, logger) сохраняется: второй аргумент-функция → старая форма
```

`credentialEnv` агентов по умолчанию воспроизводит нынешнюю цепочку `if`: gemini `GEMINI_API_KEY ← [GEMINI_API_KEY, GOOGLE_API_KEY]`; claude-code `ANTHROPIC_API_KEY ← [ANTHROPIC_API_KEY]`; codex `OPENAI_API_KEY ← [OPENAI_API_KEY]`; qwen-code `DASHSCOPE_API_KEY ← [DASHSCOPE_API_KEY, QWEN_API_KEY]`; opencode `OPENCODE_API_KEY ← [OPENCODE_API_KEY]`; freebuff `CODEBUFF_API_KEY` и `FREEBUFF_API_KEY` ← `[CODEBUFF_API_KEY, FREEBUFF_API_KEY]`. Записи `sourcecraft` и `freebuff` получают JSDoc `@deprecated Removed from defaults in 2.0; register it with registerAcpAgent()`.

- [ ] **Step 1:** Тесты (каждый в `teardown` вызывает `resetAcpAgents()`):

```ts
test('a registered agent maps its credentials from credentialEnv', ({ assert }) => {
  registerAcpAgent('x', { id: 'x', name: 'X', description: '', command: 'x-acp', args: [], envVarPrefix: 'ACP_X',
    supportsMcpServers: true, credentialEnv: [{ target: 'X_API_KEY', sources: ['X_KEY', 'X_API_KEY'] }] })
  const cfg = buildAcpRuntimeConfig('x', { getEnv: (k) => ({ X_KEY: 's' })[k], envSource: {} })
  assert.equal(cfg!.env.X_API_KEY, 's')
})
test('default agents keep their credential mapping', ({ assert }) => {
  const cfg = buildAcpRuntimeConfig('gemini', { getEnv: (k) => ({ GOOGLE_API_KEY: 'g' })[k], envSource: {} })
  assert.equal(cfg!.env.GEMINI_API_KEY, 'g')
})
test('projectMcpPath is used when the env path is absent', ({ assert }) => {
  // file: временный server.js; getEnv: { ACP_CLAUDE_CODE_ENABLE_PROJECT_MCP: 'true' }
  // expect: mcpServers содержит { name: 'project-tools', command: 'node', args: [path.resolve(file)] }
})
test('env path wins over projectMcpPath', ({ assert }) => { /* оба заданы, оба файла существуют → args[0] = env-путь */ })
test('positional signature still works', ({ assert }) => {
  assert.equal(buildAcpRuntimeConfig('codex', (k) => ({ OPENAI_API_KEY: 'o' })[k], {})!.env.OPENAI_API_KEY, 'o')
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать: цепочка `if (agentId === …)` заменяется циклом по `config.credentialEnv`. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(acp): declarative agent credentials and explicit project MCP path`.

### Task 7: Каталог — раздельная инъекция системных провайдеров

**Files:**
- Modify: `src/catalog/source.ts:114-135` (опции), `:583-615` (`#injectSystemProviders`), `src/types.ts` (`CatalogConfig.systemProviders`), `src/ai_manager.ts:445-452` (передать опцию)
- Test: `tests/unit/catalog/system_providers.spec.ts`

**Interfaces:**
- Produces: опция `systemProviders?: { fallback?: boolean; acp?: boolean }`, обе по умолчанию `true`. `injectSystemProviders: false` ≡ `{ fallback: false, acp: false }` (`@deprecated`). Явный `systemProviders` важнее.

- [ ] **Step 1:** Тесты: источник с `overridePath` → временный файл `{}` и `cachePath` во временном каталоге.

```ts
test('acp only', async ({ assert }) => {
  const cat = await source({ systemProviders: { fallback: false, acp: true } }).load()
  assert.notProperty(cat, 'openai'); assert.property(cat, 'acp-claude-code')
})
test('fallback only', async ({ assert }) => {
  const cat = await source({ systemProviders: { fallback: true, acp: false } }).load()
  assert.property(cat, 'openai'); assert.isFalse(Object.keys(cat).some((k) => k.startsWith('acp-')))
})
test('legacy flag disables both', async ({ assert }) => {
  assert.deepEqual(Object.keys(await source({ injectSystemProviders: false }).load()), [])
})
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(catalog): inject fallback and ACP providers independently`.

### Task 8: Кандидат 1.3.0

**Files:**
- Create: `CHANGELOG.md` (раздел `1.3.0`: Added / Fixed / Deprecated по задачам 2–7; заметка о смене поведения из задачи 3)
- Modify: `package.json` (`version: 1.3.0`)

- [ ] **Step 1:** Пакетная проверка → зелёная. `npm pack` → в корне появляется `adonis-ai-kit-1.3.0.tgz` (`*.tgz` уже в `.gitignore`).
- [ ] **Step 2:** Commit: `chore(release): 1.3.0 candidate`. Тег пока **не** ставить.

### Task 9: optimus-grid — logger, breaker, guard на 1.3.0

Каталог: `C:\projects\optimus-grid`, ветка `feat/adonis-ai-kit-1.3`.

**Files:**
- Modify: `app/agents/orchestration/cost_tracker.ts`, `confirmation.ts`, `app/agents/tools/registry.ts`, `app/services/llm/models_dev.ts` (передавать `logger` напрямую, без адаптеров); `app/services/llm/circuit_breaker.ts`; `app/agents/tools/registry.ts:150-163` (`getToolsByList`)
- Test: `tests/unit/circuit_breaker.spec.ts` (существующие тесты должны пройти без правок), `tests/unit/registry_by_list.spec.ts` (новый)

**Interfaces:**
- Consumes: `Logger` (задача 2), `CircuitBreaker.acquire/resetAll`, `BreakerPermit` (задача 4), `ToolAccessOptions.permissions` (задача 5).
- Produces: публичные контракты приложения не меняются: `CircuitBreakerContract` (`canExecute`/`recordSuccess`/`recordFailure`), `AgentToolRegistry.getToolsByList`.

- [ ] **Step 1:** `npm install --no-save ../adonis-ai/adonis-ai-kit-1.3.0.tgz`.
- [ ] **Step 2:** Тест: два вызова `getToolsByList` с разными списками → каждый получает только свои инструменты; в реестре нет агента `__by_list__`. Run → FAIL на последней проверке.
- [ ] **Step 3:** `getToolsByList` передаёт `permissions` из списка, без `setAgentPermissions('__by_list__')`. `CircuitBreaker` хранит `BreakerPermit | null`: `canExecute()` = `acquire()`, `recordSuccess/Failure` → `permit.success/failure` (без разрешения — прямой `recordSuccess/Failure`, как раньше); поле `probeInFlight` удалить; `isHalfOpenTrialInProgress()` = «держим разрешение-пробу». `CircuitBreakerManager.resetAll()` → `breaker.resetAll()`. Убрать адаптеры логгера.
- [ ] **Step 4:** Проверка приложения → зелёная.
- [ ] **Step 5:** Commit: `refactor(llm): use adonis-ai-kit 1.3 breaker permits, per-call tool permissions, logger`.

### Task 10: optimus-grid — ACP, каталог, загрузчик агентов на 1.3.0

**Files:**
- Modify: `app/services/llm/acp_agents.ts` (`buildAcpRuntimeConfig` → опции с `projectMcpPath`; убрать перехват `_PROJECT_MCP_PATH`), `app/services/llm/models_dev.ts` (`systemProviders: { fallback: false, acp: true }`, без `injectSystemProviders()`), `app/agents/configs/loader.ts` → реэкспорт поверх `AgentLoader` из пакета, `app/agents/configs/manifest.ts` → реэкспорт `agentManifestSchema`, `toolPermissionSchema`, `ToolPermission`, `AgentManifest` из `adonis-ai-kit/agents`
- Delete: `app/services/llm/catalog/system_providers.ts`
- Test: существующие `tests/unit/acp_agents.spec.ts`, `llm_registry.spec.ts`, `agent_prompt_loader.spec.ts`, `agent_frontmatter.spec.ts`, `llm/models_dev_source.spec.ts`

**Interfaces:**
- Consumes: `AcpRuntimeOptions` (задача 6), `systemProviders` (задача 7), `AgentLoader({ logger, schemaResolver })` (существует).
- Produces: `loader.ts` экспортирует прежние `loadAgentPrompt(agentId, configsDir?, skillsDir?)`, `loadAllAgentPrompts(configsDir?, skillsDir?)`, `invalidateAgentCache(agentId?)`, `type AgentPromptConfig` — поверх одного экземпляра `new AgentLoader({ logger, schemaResolver: getOutputSchema })`.

- [ ] **Step 1:** Run существующих тестов из списка → зелёные (базовая линия).
- [ ] **Step 2:** Внести изменения.
- [ ] **Step 3:** Проверка приложения → зелёная. Если тест проверял точный текст ошибки прежнего загрузчика (например, `Invalid agent config format`), обновить ожидание до текста пакета и упомянуть это в коммите.
- [ ] **Step 4:** Commit: `refactor(agents): use adonis-ai-kit agent loader, ACP options and catalog flags`.

### Task 11: Публикация 1.3.0 и закрепление

- [ ] **Step 1:** Спросить пользователя: «Публикуем 1.3.0?» Без явного «да» дальше не идти.
- [ ] **Step 2:** В adonis-ai: `git tag v1.3.0 && git push origin main v1.3.0`; дождаться зелёного workflow `Release` (`gh run watch`); `npm view adonis-ai-kit@1.3.0 version` → `1.3.0`.
- [ ] **Step 3:** В optimus-grid: `npm install adonis-ai-kit@^1.3.0` (меняет `package.json` и lock), проверка приложения → зелёная.
- [ ] **Step 4:** Commit: `chore(deps): require adonis-ai-kit ^1.3.0`. Ветку можно мержить.

---

## M2. Версия 1.4.0 — модуль `adonis-ai-kit/models`

### Task 12: Типы, ключи, разбор ссылки, протоколы и фабрики провайдеров

**Files:**
- Create: `src/models/types.ts`, `src/models/model_ref.ts`, `src/models/keys.ts`, `src/models/protocols.ts`, `src/models/provider_factories.ts`, `src/models/index.ts`
- Modify: `package.json` (`exports["./models"]`; optional `peerDependencies` + `peerDependenciesMeta` для каждого npm-пакета из `BUILTIN_PROVIDER_EXPORTS`, диапазоны — по major-версиям, установленным в optimus-grid), `src/index.ts`
- Test: `tests/unit/models/model_ref.spec.ts`, `keys.spec.ts`, `protocols.spec.ts`, `provider_factories.spec.ts` (перенести случаи из `optimus-grid/tests/unit/llm/model_ref.spec.ts`, `runtime_model_key.spec.ts`, `provider_driver_registry.spec.ts`)

**Interfaces:**
- Produces:

```ts
// types.ts
export interface ResolvedModel {
  providerID: string; modelID: string
  apiUrl?: string; npm?: string; apiKey?: string; headers?: Record<string, string>
  credentialKey?: string            // идентичность ключа, напр. 'key:42'; не уходит в AI SDK
  acpAgentId?: string; acpConfig?: AcpAgentRuntimeConfig
}
// model_ref.ts — поведение и тексты ошибок как в optimus-grid, кроме сообщения про пустую ссылку
export function parseModelRef(o: { modelRef?: string; explicitProvider?: string; knownProviderIds: string[] }):
  { providerId: string; modelId: string; wasProviderPrefixed: boolean }
//   пустая ссылка без провайдера → Error('A model reference or an explicit provider is required')
// keys.ts
export function modelKeyFor(m: Pick<ResolvedModel, 'providerID' | 'modelID'>): string   // 'provider/model'
export function breakerKeyFor(m: Pick<ResolvedModel, 'providerID' | 'modelID' | 'credentialKey'>): string // непустой credentialKey, иначе modelKeyFor
// protocols.ts — таблица из optimus-grid app/services/llm/protocols.ts без изменений (22 записи)
export const PROTOCOL_TO_NPM: Readonly<Record<string, string>>
export function resolveProviderNpm(c: { npmPackage?: string | null; protocol?: string | null }): string
//   нет ни того ни другого → Error('Unsupported provider protocol: <protocol|unknown>')
// provider_factories.ts
export type ProviderFactory = (settings: {
  name: string; apiKey?: string; baseURL?: string; headers?: Record<string, string>; fetch?: typeof fetch
}) => { languageModel(modelId: string): LanguageModel }
export const BUILTIN_PROVIDER_EXPORTS: Readonly<Record<string, string>> // npm → имя экспорта; все пакеты из ai_sdk_factories.ts optimus-grid, плюс 'qwencode' → '@ai-sdk/openai-compatible'
export class ProviderFactoryRegistry {
  register(npm: string, factory: ProviderFactory): this
  has(npm: string): boolean
  get(npm: string): Promise<ProviderFactory> // зарегистрированная или import(npm)[export]; иначе AiException 'E_AI_MISSING_DEPENDENCY' с именем пакета в тексте
}
```

- [ ] **Step 1:** Тесты: перенесённые случаи плюс

```ts
test('missing provider package gives a clear error', async ({ assert }) => {
  const r = new ProviderFactoryRegistry()
  await assert.rejects(() => r.get('@ai-sdk/definitely-not-installed'), /@ai-sdk\/definitely-not-installed/)
})
test('registered factory wins over import', async ({ assert }) => {
  const f: ProviderFactory = () => ({ languageModel: () => ({}) as any })
  assert.strictEqual(await new ProviderFactoryRegistry().register('@ai-sdk/openai', f).get('@ai-sdk/openai'), f)
})
test('builtin import resolves an installed package', async ({ assert }) => {
  assert.isFunction(await new ProviderFactoryRegistry().get('@ai-sdk/openai')) // devDependency
})
test('breaker key prefers a non-empty credential', ({ assert }) => {
  assert.equal(breakerKeyFor({ providerID: 'p', modelID: 'm', credentialKey: 'key:1' }), 'key:1')
  assert.equal(breakerKeyFor({ providerID: 'p', modelID: 'm', credentialKey: '' }), 'p/m')
})
```

  Для неизвестного пакета `get` проверяет `BUILTIN_PROVIDER_EXPORTS`; вне таблицы → та же ошибка с подсказкой про `register()`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(models): resolved model types, model refs, provider factories`.

### Task 13: `LanguageModelFactory` и `CatalogModelResolver`

**Files:**
- Create: `src/models/language_model_factory.ts`, `src/models/catalog_resolver.ts`
- Test: `tests/unit/models/language_model_factory.spec.ts`, `catalog_resolver.spec.ts` (перенести случаи из `optimus-grid/tests/unit/llm_registry.spec.ts`, кроме `sourcecraft`, и из `llm/llm_model_factory.spec.ts`; фикстура каталога — временный JSON через `overridePath`)

**Interfaces:**
- Consumes: всё из задачи 12; `AcpDriver` (`src/acp/provider.ts`); `ModelsDevSource`; `buildAcpRuntimeConfig(agentId, AcpRuntimeOptions)` (задача 6).
- Produces:

```ts
export interface LanguageModelFactoryOptions {
  factories?: ProviderFactoryRegistry
  timeoutMs?: number // default 180_000; fetch с AbortSignal.any([timeout, init.signal])
  logger?: Logger    // логирует создание модели; заголовки с authorization/api-key/x-api → '***'
  acp?: { permissionPolicy?: AcpPermissionPolicy; confirmation?: ConfirmationService } // default policy 'ask'
}
export class LanguageModelFactory {
  constructor(options?: LanguageModelFactoryOptions)
  create(model: ResolvedModel): Promise<LanguageModel>
  //   npm '@mcpc-tech/acp-ai-provider' → нужен model.acpConfig, иначе ProviderConfigError;
  //   один AcpDriver на command+cwd (кэш), driver.getModel(model.acpAgentId)
  //   иначе factory({ name: providerID, apiKey, baseURL: apiUrl, headers, fetch }).languageModel(modelID)
  shutdown(): Promise<void> // останавливает все AcpDriver
}
export interface ModelResolver { resolve(ref?: string): Promise<ResolvedModel> }
export interface CatalogModelResolverOptions {
  catalog: { load(): Promise<ModelsDevCatalog> }
  defaultModelRef?: () => string | undefined
  explicitProvider?: () => string | undefined
  getApiKey?: (envNames: string[]) => string | undefined // default: первое непустое process.env[name]
  acp?: AcpRuntimeOptions
}
export class CatalogModelResolver implements ModelResolver { constructor(o: CatalogModelResolverOptions) }
//   алгоритм — ProviderRegistry.resolveModel из optimus-grid; 'Unknown provider: <id>' без изменений
```

- [ ] **Step 1:** Тесты: перенесённые случаи плюс

```ts
test('ACP model without runtime config is a config error', async ({ assert }) => {
  await assert.rejects(() => new LanguageModelFactory().create({ providerID: 'acp-x', modelID: 'x', npm: '@mcpc-tech/acp-ai-provider' }), /runtime config/)
})
test('factory receives credentials and a timeout fetch', async ({ assert }) => {
  let seen: any
  const factories = new ProviderFactoryRegistry().register('mock', (s) => { seen = s; return { languageModel: () => ({}) as any } })
  await new LanguageModelFactory({ factories }).create({ providerID: 'p', modelID: 'm', npm: 'mock', apiKey: 'k', apiUrl: 'http://u' })
  assert.include(seen, { name: 'p', apiKey: 'k', baseURL: 'http://u' }); assert.isFunction(seen.fetch)
})
test('logs redact secret headers', async ({ assert }) => { /* logger-шпион; headers { Authorization: 's', 'X-Title': 't' } → в логах нет 's', есть 't' */ })
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(models): language model factory and catalog resolver`.

### Task 14: Цепочка моделей с fallback

**Files:**
- Create: `src/models/model_chain.ts`
- Test: `tests/unit/models/model_chain.spec.ts` (перенести все 15 случаев из `optimus-grid/tests/unit/llm/fallback_llm_service.spec.ts` на уровень функций)

**Interfaces:**
- Consumes: `CircuitBreaker.acquire` (задача 4), `classifyError` (задача 3), `breakerKeyFor`, `ModelResolver`.
- Produces:

```ts
export type ChainCandidate = { kind: 'resolved'; model: ResolvedModel; key: string } | { kind: 'ref'; ref: string; key: string }
export function buildChainCandidates(i: { chain?: ResolvedModel[]; primary?: ResolvedModel | string; defaults?: string[] }): ChainCandidate[]
//   непустой chain авторитетен: только он, дедуп по `${breakerKeyFor(m)}|${providerID}/${modelID}`;
//   иначе primary (+ defaults), дедуп по key; пустой chain = отсутствующий
export interface FallbackEvent { fromModel: string; toModel: string; error: unknown; errorClass: ErrorClass }
export interface ChainAttempt { model: ResolvedModel; key: string; isFallback: boolean; markToolsExecuted(): void }
export interface ModelChainOptions {
  breaker?: CircuitBreaker; resolver?: ModelResolver; abortSignal?: AbortSignal
  onFallback?: (e: FallbackEvent) => void   // исключения обработчика глотаются с warn
  logger?: Logger
}
export function runModelChain<T>(candidates: ChainCandidate[], attempt: (a: ChainAttempt) => Promise<T>, o?: ModelChainOptions):
  Promise<{ result: T; model: ResolvedModel; key: string }>
```

Правила: разрешение breaker'а берётся синхронно, до первого `await` попытки (иначе тест на half-open недетерминирован); кандидат без разрешения пропускается; успех → `permit.success()`; ошибка → `countsAsFailure ? permit.failure(e) : permit.release()`; `kind !== 'retryable'`, вызванный `markToolsExecuted()` или нет следующего кандидата с доступным breaker'ом → бросить эту ошибку; ни одной попытки → `ProviderUnavailableError('model-chain', 'no candidate model is available')`.

- [ ] **Step 1:** Тесты: перенесённые 15 плюс

```ts
test('concurrent calls get one half-open probe', async ({ assert }) => {
  const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeoutMs: 0, halfOpenMaxConcurrent: 1 })
  breaker.recordFailure('a/m')
  let release!: () => void; const gate = new Promise<void>((r) => (release = r))
  const used: string[] = []
  const run = () => runModelChain(buildChainCandidates({ chain: [A, B] }), async ({ key }) => { used.push(key); if (key === 'a/m') await gate; return key }, { breaker })
  const p1 = run(); const p2 = run(); release()
  assert.sameMembers((await Promise.all([p1, p2])).map((r) => r.key), ['a/m', 'b/m'])
})
test('caller abort stops the chain and does not count', async ({ assert }) => {
  const ac = new AbortController(); const breaker = new CircuitBreaker({ failureThreshold: 1 })
  await assert.rejects(() => runModelChain(buildChainCandidates({ chain: [A, B] }), async () => { ac.abort(); throw Object.assign(new Error('x'), { statusCode: 503 }) }, { breaker, abortSignal: ac.signal }))
  assert.equal(breaker.getState('a/m'), 'closed')
})
test('no fallback after tools ran', async ({ assert }) => { /* attempt вызывает markToolsExecuted() и бросает 503 → одна попытка, ошибка проброшена */ })
test('prompt_too_long falls back without opening the breaker', async ({ assert }) => { /* 400 'context length' на A → результат от B; breaker A closed */ })
```

  (`A = { providerID: 'a', modelID: 'm' }`, `B = { providerID: 'b', modelID: 'm' }`.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(models): model chain with per-credential breakers and safe fallback`.

### Task 15: AiManager — новые опции вызова

**Files:**
- Modify: `src/types.ts` (`GenerateTextOptions`, `GenerateTextResult`, `StreamTextResult`), `src/ai_manager.ts:749-774` (`buildTextParams`), `generateText`, `streamText`
- Test: `tests/unit/ai_manager/call_options.spec.ts` (`MockLanguageModelV4` из `ai/test`; провайдер `custom`)

**Interfaces:**
- Produces: `GenerateTextOptions` += `schema?: z.ZodType`, `stopWhen?: StopCondition<ToolSet> | StopCondition<ToolSet>[]` (важнее `maxSteps`), `maxRetries?: number`, `onStepFinish?: (step: StepResult<ToolSet>) => void | Promise<void>`. `GenerateTextResult.output?: unknown` (при `schema`); `StreamTextResult.output: Promise<unknown>`.

- [ ] **Step 1:** Тесты: `schema` даёт разобранный `output` в `generateText` и в `streamText().output`; `maxRetries: 0` доходит до AI SDK (у mock'а одна попытка на 429); `onStepFinish` вызывается на каждом шаге; `stopWhen` важнее `maxSteps`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать (`output: Output.object({ schema })`). **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** README: пример structured output с инструментами в стриме. Commit: `feat(manager): schema, stopWhen, maxRetries and onStepFinish call options`.

### Task 16: AiManager — цепочка моделей

**Files:**
- Modify: `src/types.ts` (`AiConfig.resolver?: ModelResolver`, `AiConfig.languageModels?: LanguageModelFactory`; опции вызова `models?: Array<ResolvedModel | string>`, `onFallback?: (e: FallbackEvent) => void`), `src/ai_manager.ts` (ветка `options.models` в `generateText`/`streamText`/`generateObject`; `shutdown()` вызывает `languageModels.shutdown()`), `README.md` (раздел «Динамические ключи и цепочки моделей»)
- Test: `tests/unit/ai_manager/model_chain.spec.ts`

**Interfaces:**
- Consumes: `buildChainCandidates`, `runModelChain`, `LanguageModelFactory`, `ModelResolver`.
- Produces: при непустом `models` каскад провайдеров не используется. Кандидаты = `buildChainCandidates({ chain: resolved, ... })`; строки — через `config.resolver` (нет резолвера → `ProviderConfigError`). Breaker — общий breaker менеджера, ключ `breakerKeyFor`. `result.provider = providerID`, `result.model = modelID`. Стоимость пишется так же, как в каскаде. `markToolsExecuted` — из обёртки инструментов (`AttemptState.toolsExecuted`).

- [ ] **Step 1:** Тесты: `ProviderFactoryRegistry` с `register('mock', …)`: модель `a` отвечает 429, `b` — текстом; `generateText({ prompt, models: [A, B], onFallback })` → `provider === 'b'`, `onFallback` вызван один раз с `errorClass: 'rate_limit'`; строка в `models` без `resolver` → `ProviderConfigError`; `streamText` со сбоем первой модели до первого чанка → стрим от `b`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Реализовать. **Step 4:** Пакетная проверка → зелёная.
- [ ] **Step 5:** Commit: `feat(manager): run calls over a dynamic model chain`.

### Task 17: Кандидат 1.4.0

- [ ] **Step 1:** `CHANGELOG.md` += `1.4.0`; `version: 1.4.0`; пакетная проверка → зелёная; `npm pack`.
- [ ] **Step 2:** Commit: `chore(release): 1.4.0 candidate`.

### Task 18: optimus-grid — LLM-слой на `adonis-ai-kit/models`

Ветка `feat/adonis-ai-kit-1.4` от `main` после задачи 11. `npm install --no-save ../adonis-ai/adonis-ai-kit-1.4.0.tgz`.

**Files:**
- Modify → реэкспорт: `app/services/llm/model_ref.ts`, `protocols.ts` (`PROTOCOL_TO_NPM`, `getNpmPackageForProtocol` = `PROTOCOL_TO_NPM[p]`), `providers/provider_driver_registry.ts`, `contracts.ts` (`ResolvedModel` = пакетный; `ResolvedLlmModel` и прочие типы приложения остаются), `runtime_model_key.ts` (обе функции делегируют `modelKeyFor`/`breakerKeyFor`, ветка `ResolvedLlmModel` остаётся в приложении)
- Modify: `app/services/llm/llm_model_factory.ts` (`llmModelFactory` = `new LanguageModelFactory({ logger, acp: { permissionPolicy: 'allow' } })` за прежним классом `LlmModelFactory` с методом `create`), `provider_registry.ts` (`ProviderRegistry` — тот же класс и DI-токен: `resolveModel` → `CatalogModelResolver({ catalog: { load: loadModelsDev }, defaultModelRef: () => runtimeConfig.getLlmModelChain()[0], explicitProvider: () => runtimeConfig.getLlmProvider(), getApiKey: (e) => runtimeConfig.getProviderApiKey(e), acp: { getEnv: (k) => runtimeConfig.getString(k) || undefined, projectMcpPath } })`), `fallback_llm_service.ts` (`buildChainCandidates` + `runModelChain` с общим kit-breaker'ом; `FallbackEvent` и `options.onFallback` — прежней формы), `circuit_breaker.ts` (экспортировать общий kit-экземпляр `llmCircuitBreaker`, им пользуется и менеджер), `start` или провайдер приложения (на shutdown вызывать `llmModelFactory.shutdown()`)
- Delete: `app/services/llm/providers/ai_sdk_factories.ts`, `providers/adapters/ai_sdk_adapter.ts`, `acp_adapter.ts`, `openai_compatible_adapter.ts`
- Test: все существующие `tests/unit/llm/*` и `tests/unit/orchestration/*`; новый `tests/unit/llm/acp_permission_parity.spec.ts`

**Interfaces:**
- Consumes: задачи 12–14.
- Produces: снаружи `app/services/llm/` сигнатуры не меняются: `LlmService`, `ProviderRegistry.resolveModel/getLanguageModel`, `FallbackLlmService`, `ResolvedModel`, `getRuntimeModelKey`, `getRuntimeBreakerKey`.

- [ ] **Step 1:** Тест паритета ACP: `llmModelFactory` создан с `acp.permissionPolicy === 'allow'` (проверка через опции, доступные тесту, или через шпион конструктора `LanguageModelFactory`). Run → FAIL.
- [ ] **Step 2:** Внести изменения.
- [ ] **Step 3:** Проверка приложения → зелёная. Ожидаемые правки тестов (перечислить в коммите): сообщение о пустой ссылке на модель (задача 12); тесты удалённых фабрик и адаптеров (`llm_model_factory.spec.ts`, если проверял внутренности) переписать на `LlmModelFactory.create` или удалить как перенесённые в пакет; кейс в `fallback_llm_service.spec.ts`, где 401 открывал breaker (теперь не открывает, D3).
- [ ] **Step 4:** Поиск: `grep -rn "@ai-sdk/" app --include=*.ts` → импортов провайдеров нет, кроме типов. Зависимости `@ai-sdk/*` в `package.json` приложения остаются: их загружает пакет.
- [ ] **Step 5:** Commit: `refactor(llm): use adonis-ai-kit models for resolution, factories and fallback (wave 6)`.

### Task 19: Публикация 1.4.0 и закрепление

Те же шаги, что в задаче 11, для `v1.4.0`: подтверждение пользователя → тег → зелёный `Release` → `npm install adonis-ai-kit@^1.4.0` в приложении → проверка приложения → коммит `chore(deps): require adonis-ai-kit ^1.4.0`.

---

## M3. Версия 2.0.0 — удаление deprecated (начинать отдельным решением пользователя)

### Task 20: Чистка API и перенос регрессии

**Files:**
- Modify: `src/acp/acp_agents.ts` (убрать `sourcecraft` и `freebuff` из умолчаний), `src/catalog/source.ts` (убрать `injectSystemProviders`), `src/ai_manager.ts` (убрать `LoggerContract`), `src/types.ts` (убрать `maxTokens`, `promptTokens`/`completionTokens`, `toDataStreamResponse`), `src/acp/acp_agents.ts` (позиционная форма `buildAcpRuntimeConfig`), `CHANGELOG.md` (раздел Breaking с инструкцией по миграции)
- Move: случаи `tests/regression*.mjs` → `tests/unit/**`; удалить `.mjs` и скрипт `test:regression` (из CI и release тоже)

- [ ] **Step 1:** Перенести регрессию. Run: `npm test` → не меньше 59 перенесённых случаев плюс тесты M1–M2, все зелёные.
- [ ] **Step 2:** Удалить deprecated. Run: пакетная проверка → зелёная.
- [ ] **Step 3:** optimus-grid на tarball 2.0.0: регистрирует `sourcecraft`/`freebuff` своей таблицей (уже так делает через `setAcpAgents`) → проверка приложения → зелёная. Затем публикация по схеме задачи 11.
- [ ] **Step 4:** Commit: `feat!: remove deprecated 1.x API`.
