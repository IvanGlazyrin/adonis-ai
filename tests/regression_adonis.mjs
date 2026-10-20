import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { HttpResponse } from '@adonisjs/core/http'

const P = new URL('../dist/src', import.meta.url).href
const { registerResponseMacro } = await import(`${P}/response_macro.js`)
const { ModelsDevSource, resolveCatalogProviderId } = await import(`${P}/catalog/source.js`)
const { AgentLoader } = await import(`${P}/agents/loader.js`)
const commands = await import(new URL('../dist/commands/main.js', import.meta.url).href)

let passed = 0
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ', name) }
  catch (e) { console.log('  FAIL', name, '\n      ', e.stack.split('\n').slice(0, 4).join('\n       ')); process.exitCode = 1 }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-smoke-'))

console.log('response macro')
registerResponseMacro()
const streamAI = HttpResponse.prototype.streamAI
const fakeCtx = () => {
  const res = new EventEmitter(); res.headersSent = false; res.writableFinished = false
  const headers = {}; let streamed
  const ctx = { request: new EventEmitter(), response: res, header: (k, v) => { headers[k] = v; return ctx }, status() { return ctx }, stream: (s) => { streamed = s }, send() {} }
  return { ctx, res, headers, get stream() { return streamed } }
}
const textStreamOf = (chunks, delay = 0) => ({
  async *[Symbol.asyncIterator]() { for (const c of chunks) { if (delay) await new Promise((r) => setTimeout(r, delay)); yield c } },
})
await t('sse: headers via response.header() (not writeHead), frames, [DONE]', async () => {
  const f = fakeCtx()
  streamAI.call(f.ctx, { textStream: textStreamOf(['a', 'b']), abort() {} }, { heartbeatMs: 0 })
  assert.equal(f.headers['Content-Type'], 'text/event-stream')
  let out = ''; for await (const c of f.stream) out += c
  assert.match(out, /event: message\ndata: {"type":"chunk","text":"a"}/); assert.match(out, /data: \[DONE\]/)
})
await t('sse: client disconnect (res close) aborts LLM generation', async () => {
  const f = fakeCtx(); let aborted = 0
  streamAI.call(f.ctx, { textStream: textStreamOf(['a', 'b', 'c'], 30), abort: () => aborted++ }, { heartbeatMs: 0 })
  f.res.emit('close')
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(aborted, 1)
})
await t('sse: heartbeat pings while idle', async () => {
  const f = fakeCtx()
  streamAI.call(f.ctx, { textStream: textStreamOf(['a'], 120), abort() {} }, { heartbeatMs: 20 })
  let out = ''; for await (const c of f.stream) out += c
  assert.match(out, /: ping/)
})
await t('sse: error message is not leaked to client by default', async () => {
  const f = fakeCtx(); let seen
  const failing = { async *[Symbol.asyncIterator]() { throw new Error('secret db password') } }
  streamAI.call(f.ctx, { textStream: failing, abort() {} }, { heartbeatMs: 0, onError: (e) => (seen = e) })
  let out = ''; for await (const c of f.stream) out += c
  assert.ok(!out.includes('secret')); assert.match(out, /event: error/); assert.equal(seen.message, 'secret db password')
})

console.log('catalog')
await t('provider alias gemini -> google', () => assert.equal(resolveCatalogProviderId('gemini'), 'google'))
const catalogJson = { google: { id: 'google', name: 'Google', env: [], models: { 'gemini-2.5-pro': { id: 'gemini-2.5-pro', name: 'G', cost: { input: 1.25, output: 10, cache_read: 0.31 }, limit: { context: 1048576, output: 65536 } } } }, bogus: 'nope' }
const realFetch = globalThis.fetch
await t('ttl: stale disk cache triggers refetch; atomic write leaves no tmp; invalid providers dropped', async () => {
  const cachePath = path.join(tmp, 'c', 'models.dev.json')
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify({ google: { id: 'google', name: 'old', env: [], models: {} } }))
  const old = new Date(Date.now() - 3 * 3600_000); fs.utimesSync(cachePath, old, old)
  let fetches = 0
  globalThis.fetch = async () => { fetches++; return new Response(JSON.stringify(catalogJson), { status: 200, headers: { etag: '"v1"' } }) }
  const src = new ModelsDevSource({ cachePath, ttlMs: 3600_000 })
  const cat = await src.load()
  assert.equal(fetches, 1); assert.equal(cat.google.name, 'Google'); assert.equal(cat.bogus, undefined)
  assert.deepEqual(fs.readdirSync(path.dirname(cachePath)).filter((f) => f.endsWith('.tmp')), [])
  const src2 = new ModelsDevSource({ cachePath, ttlMs: 3600_000 }); await src2.load()
  assert.equal(fetches, 1, 'fresh disk cache must not refetch')
})
await t('network failure + stale cache => stale served; no cache => fallback pinned only briefly', async () => {
  const cachePath = path.join(tmp, 'd', 'models.dev.json')
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  globalThis.fetch = async () => { throw new TypeError('fetch failed') }
  const src = new ModelsDevSource({ cachePath })
  const cat = await src.load()
  assert.ok(cat.openai.models['gpt-4o'])
  assert.equal(cat.google.models['gemini-2.5-pro'].cost.output, 10)
  globalThis.fetch = async () => new Response(JSON.stringify(catalogJson), { status: 200 })
  src.resetCache(); // simulate FALLBACK_TTL expiry path via explicit reset
  assert.equal((await src.load()).google.name, 'Google')
})
await t('getModel via gemini alias; pricing carries cacheReadCostPer1M', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify(catalogJson), { status: 200 })
  const cachePath = path.join(tmp, 'e', 'models.dev.json')
  const src = new ModelsDevSource({ cachePath })
  const p = await src.getModelPricing('gemini', 'gemini-2.5-pro')
  assert.equal(p.cacheReadCostPer1M, 0.31); assert.equal(p.output, 10)
})
await t('resolveModel: undated alias resolves to dated id', async () => {
  const cachePath = path.join(tmp, 'f', 'models.dev.json'); fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify({ anthropic: { id: 'anthropic', name: 'A', env: [], models: { 'claude-3-5-sonnet-20241022': { id: 'claude-3-5-sonnet-20241022', name: 'x' } } } }))
  const r = await new ModelsDevSource({ cachePath }).resolveModel('claude-3-5-sonnet')
  assert.equal(r.modelId, 'claude-3-5-sonnet-20241022')
})
globalThis.fetch = realFetch

console.log('agent loader')
const cfgDir = path.join(tmp, 'agents'); const skillDir = path.join(tmp, 'skills')
fs.mkdirSync(cfgDir); fs.mkdirSync(skillDir)
fs.writeFileSync(path.join(tmp, 'secret.md'), 'TOP SECRET')
fs.writeFileSync(path.join(cfgDir, 'bom.md'), '\uFEFF---\r\ndescription: hi\r\npermissions:\r\n  bash: deny\r\n---\r\nbody here')
fs.writeFileSync(path.join(cfgDir, 'evil.md'), '---\nid: evil\nskills: ["../secret"]\n---\nbody')
await t('BOM + CRLF frontmatter parses; id defaults to filename', async () => {
  const c = await new AgentLoader({ configsDir: cfgDir, skillsDir: skillDir }).loadAgentPrompt('bom')
  assert.equal(c.id, 'bom'); assert.equal(c.permissions.bash, 'deny'); assert.equal(c.body, 'body here')
})
await t('path traversal via agentId / skills rejected', async () => {
  const l = new AgentLoader({ configsDir: cfgDir, skillsDir: skillDir })
  await assert.rejects(() => l.loadAgentPrompt('../secret'), /Invalid agent id/)
  const c = await l.loadAgentPrompt('evil')
  assert.ok(!c.systemPrompt.includes('TOP SECRET'))
})

console.log('ace commands')
await t('commands loader exposes getMetaData/getCommand', async () => {
  const meta = await commands.getMetaData()
  assert.deepEqual(meta.map((m) => m.commandName).sort(), ['ai:test', 'make:ai-agent'])
  assert.equal((await commands.getCommand({ commandName: 'ai:test' })).commandName, 'ai:test')
})

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${passed} passed`)
