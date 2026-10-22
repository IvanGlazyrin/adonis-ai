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
const noop = () => {}
const pino: PinoLike = { info: noop, warn: noop, error: noop, debug: noop }

test('one Logger type everywhere', ({ assert }) => {
  const a: Logger = pino
  const b: GuardLogger = a
  const c: BudgetLogger = b
  assert.exists(c)
})
