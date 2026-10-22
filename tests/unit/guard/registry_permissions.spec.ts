import { test } from '@japa/runner'
import { ToolRegistry } from '../../../src/guard/index.js'

const make = () =>
  new ToolRegistry({ defaultPermission: 'deny' })
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
  assert.deepEqual(
    Object.keys(r.getToolsForAgent('x', { permissions: { a: 'deny', b: 'allow' } })),
    ['b']
  )
})
