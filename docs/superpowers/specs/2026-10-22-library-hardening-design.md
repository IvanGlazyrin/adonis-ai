# adonis-ai-kit: доводка до самостоятельной библиотеки — дизайн

Дата: 2026-10-22. Основание: аудит adonis-ai-kit 1.2.0 против optimus-grid (`f7191309`).

## Цель

1. adonis-ai-kit — переносимая и развиваемая библиотека: в ней нет следов конкретного деплоя,
   её фасад (`AiManager`) годится для приложений с динамическими (из БД, на пользователя) ключами,
   а тесты пишутся на TypeScript-исходниках.
2. optimus-grid после каждого шага собирается и проходит тесты, используя пакет из npm.

## Исходное состояние (зафиксировано 2026-10-22)

- Пакет: `npm run build` ок, `npm run test:regression` — 47 + 12 passed.
- optimus-grid: `npm run typecheck` exit 0, `node ace test unit` — 1168 passed.
- optimus-grid использует из пакета только модули (классификатор, breaker, budget, guard, catalog, ACP).
  `AiManager`, `AgentRunner`, `AgentLoader`, `ai_provider` не используются.

## Решения

### D1. Инфраструктура пакета
- Тесты на TS через Japa (`@japa/runner`, `@japa/assert`) и `@poppinss/ts-exec` — как в экосистеме AdonisJS
  и в самом optimus-grid. `tests/regression*.mjs` остаются до полного переноса (M3).
- `dist/` удаляется из git, собирается в CI и при публикации.

### D2. Один тип логгера
`src/logger.ts` экспортирует `Logger`; `guard/types`, `budget/types` реэкспортируют его, `LoggerContract`
становится `@deprecated`-алиасом. Логгер AdonisJS присваивается этому типу напрямую (проверено tsc),
поэтому адаптеры `{ info: m => logger.info(m) }` в приложении удаляются.

### D3. Один источник истины для ошибок
`classifyError()` строится поверх `classifyErrorClass()` и возвращает ещё `errorClass` и `countsAsFailure`.
- «Делать ли fallback» = `isRetryableError(errorClass)` (плюс abort → fatal, open breaker/конфиг → skip,
  ошибки валидации AI SDK → fatal).
- «Засчитывать ли breaker'у» = `countsAsFailure`: только `rate_limit | overloaded | timeout | server_error | network_error`.
  `prompt_too_long` и `no_output_generated` переходят на другую модель, но breaker не открывают.
- Статус ищется в `statusCode | status | response.status` по цепочке `cause` и `lastError` (AI SDK `RetryError`),
  глубина до 5. 409 и 425 → `overloaded`. Сетевые `code` → `network_error`, `TimeoutError` → `timeout`.

### D4. Breaker с разрешениями
`CircuitBreaker.acquire(key): BreakerPermit | null` — захватывающая проверка для ручного режима;
`execute()` реализуется через неё. Плюс `resetAll()`.

### D5. ToolRegistry: права на вызов
`ToolAccessOptions.permissions` — права только для этого вызова, без изменения общего состояния реестра.

### D6. ACP без хаков
- `AcpAgentConfig.credentialEnv` описывает, какие переменные окружения агенту нужны; цепочка `if (agentId === ...)`
  уходит в данные агентов по умолчанию.
- `buildAcpRuntimeConfig(agentId, options)` с `projectMcpPath` (позиционная форма сохраняется).
- `sourcecraft` и `freebuff` в агентах по умолчанию помечаются `@deprecated`, удаляются в 2.0.

### D7. Каталог: раздельная инъекция
`ModelsDevSource({ systemProviders: { fallback, acp } })`; `injectSystemProviders` — `@deprecated` алиас.

### D8. Модуль `adonis-ai-kit/models` (главное)
Переносится из optimus-grid общий слой «ссылка на модель → LanguageModel → цепочка с fallback»:
- `ResolvedModel`, `parseModelRef`, `modelKeyFor`, `breakerKeyFor` (credential важнее provider/model);
- `PROTOCOL_TO_NPM`, `resolveProviderNpm`, `ProviderFactoryRegistry` (ленивый `import()` известных
  пакетов + `register()` для всего остального и для pnpm);
- `LanguageModelFactory` (таймаут fetch 180 с, маскирование заголовков в логах, ACP через `AcpDriver`
  с кэшем и `shutdown()`);
- `CatalogModelResolver` (models.dev → `ResolvedModel` с ключом и ACP-конфигом);
- `buildChainCandidates` + `runModelChain` (цепочка авторитетна, дедуп по записи, breaker по credential,
  `onFallback`, не повторять после запуска инструментов).
`ModelsDevSource.resolveModel` остаётся: он ищет запись каталога, а `CatalogModelResolver` готовит модель к вызову.

### D9. AiManager на тех же примитивах
`generateText/streamText/generateObject` принимают `models` (цепочку `ResolvedModel | string`), `onFallback`,
`schema` (для text/stream), `stopWhen`, `onStepFinish`, `maxRetries`. Конфиг: `resolver`, `languageModels`.

### D10. Как мигрирует optimus-grid
- Пакет выпускается только после того, как ветка приложения прошла typecheck и unit-тесты на tarball кандидата
  (`npm install --no-save <tgz>`). Ветка приложения мержится только после закрепления опубликованной версии.
- Пути импорта внутри приложения остаются: удалённые реализации заменяются реэкспортами (как в волнах 1–4).
- `LlmService`/`LlmServiceImpl` остаются в приложении — это его шов для ~20 мест вызова.
- Для ACP приложение явно задаёт `permissionPolicy: 'allow'`: именно так сейчас ведёт себя
  `@mcpc-tech/acp-ai-provider` без обработчика (выбирает первый вариант).

### D11. Версии
1.3.0 — D1–D7 (добавления и исправления). 1.4.0 — D8–D9. 2.0.0 — удаление deprecated (M3, решение отдельно).
