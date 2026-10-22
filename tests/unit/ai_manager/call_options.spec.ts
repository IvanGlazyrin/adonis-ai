import { test } from '@japa/runner'
import { APICallError, stepCountIs, tool } from 'ai'
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test'
import { z } from 'zod'
import { AiManager } from '../../../src/ai_manager.js'
import { defineConfig } from '../../../src/define_config.js'

const usage = (inp: number, out: number) => ({
  inputTokens: { total: inp, noCache: inp, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: out, text: out, reasoning: 0 },
})
const finish = (unified: 'stop' | 'tool-calls' = 'stop') => ({ unified, raw: unified })

const textModel = (text: string) =>
  new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'm',
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: finish(),
      usage: usage(10, 5),
      warnings: [],
    }),
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: text },
        { type: 'text-end', id: '1' },
        { type: 'finish', finishReason: finish(), usage: usage(10, 5) },
      ]),
    }),
  })

/** First call requests a tool, later calls answer with `finalText`. */
const toolLoopModel = (finalText: string) => {
  let calls = 0
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId: 'm',
    doGenerate: async () => {
      calls++
      if (calls === 1) {
        return {
          content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ping', input: '{}' }],
          finishReason: finish('tool-calls'),
          usage: usage(10, 5),
          warnings: [],
        }
      }
      return {
        content: [{ type: 'text', text: finalText }],
        finishReason: finish(),
        usage: usage(10, 5),
        warnings: [],
      }
    },
  })
}

const manager = (model: MockLanguageModelV4) =>
  new AiManager(
    defineConfig({
      default: 'main',
      providers: { main: { driver: 'custom', factory: () => model, defaultModel: 'm' } },
      catalog: { autoPricing: false },
    }),
    { info() {}, warn() {}, error() {}, debug() {} }
  )

const ping = tool({ description: 'ping', inputSchema: z.object({}), execute: async () => 'pong' })

test.group('AiManager call options', () => {
  test('schema yields parsed output from generateText', async ({ assert }) => {
    const m = manager(textModel('{"n":7}'))
    const result = await m.generateText({ prompt: 'x', schema: z.object({ n: z.number() }) })
    assert.deepEqual(result.output, { n: 7 })
  })

  test('schema yields parsed output from streamText', async ({ assert }) => {
    const m = manager(textModel('{"n":7}'))
    const stream = await m.streamText({ prompt: 'x', schema: z.object({ n: z.number() }) })
    await stream.consume()
    assert.deepEqual(await stream.output, { n: 7 })
  })

  test('maxRetries: 0 reaches the SDK (single attempt on 429)', async ({ assert }) => {
    let calls = 0
    const model = new MockLanguageModelV4({
      provider: 'mock',
      modelId: 'm',
      doGenerate: async () => {
        calls++
        throw new APICallError({
          message: 'rate limited',
          url: 'http://x',
          requestBodyValues: {},
          statusCode: 429,
          isRetryable: true,
        })
      },
    })
    await manager(model)
      .generateText({ prompt: 'x', maxRetries: 0 })
      .catch(() => {})
    assert.equal(calls, 1)
  })

  test('onStepFinish fires for every step', async ({ assert }) => {
    const steps: unknown[] = []
    const m = manager(toolLoopModel('done'))
    const result = await m.generateText({
      prompt: 'x',
      tools: { ping },
      maxSteps: 5,
      onStepFinish: (step) => {
        steps.push(step)
      },
    })
    assert.equal(result.text, 'done')
    assert.lengthOf(steps, 2)
  })

  test('onStepFinish errors do not break streamText', async ({ assert }) => {
    const m = manager(textModel('hello'))
    const stream = await m.streamText({
      prompt: 'x',
      onStepFinish: () => {
        throw new Error('boom')
      },
    })
    const result = await stream.consume()
    assert.equal(result.text, 'hello')
  })

  test('onStepFinish fires in streamText', async ({ assert }) => {
    let count = 0
    const m = manager(textModel('hello'))
    const stream = await m.streamText({
      prompt: 'x',
      onStepFinish: () => {
        count++
      },
    })
    await stream.consume()
    assert.equal(count, 1)
  })

  test('stopWhen takes precedence over maxSteps', async ({ assert }) => {
    const m = manager(toolLoopModel('done'))
    const result = await m.generateText({
      prompt: 'x',
      tools: { ping },
      maxSteps: 5,
      stopWhen: stepCountIs(1),
    })
    assert.lengthOf(result.steps ?? [], 1)
    assert.equal(result.text, '')
  })
})
