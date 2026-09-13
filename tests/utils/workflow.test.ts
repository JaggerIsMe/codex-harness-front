import { expect, it } from 'vitest'
import { reactive } from 'vue'
import type { Workflow, WorkflowNode } from '@/types/orchestration'
import {
  connect,
  disconnect,
  createWorkflow,
  withStartNode,
  removeNode,
  upstreamExperts,
  validateWorkflow,
} from '@/utils/workflow'
const expert = (id: string, next: string | null = null): WorkflowNode => ({
  id,
  kind: 'EXPERT',
  name: id,
  expertId: 8,
  objective: '自定义职责',
  next,
  condition: null,
  x: 0,
  y: 0,
})
const graph = (): Workflow => ({
  schemaVersion: 2,
  startNodeId: 'a',
  nodes: [
    expert('a', 'b'),
    {
      id: 'b',
      kind: 'BRANCH',
      name: '判断',
      expertId: null,
      objective: '',
      next: null,
      x: 0,
      y: 0,
      condition: {
        sourceNodeId: 'a',
        operator: 'EQUALS',
        pointer: '',
        value: 'yes',
        whenTrue: 'yes',
        whenFalse: 'no',
      },
    },
    expert('yes', 'end'),
    expert('no', 'end'),
    expert('end'),
  ],
})
it('creates exactly one persistent start and rejects missing outgoing and incoming routes', () => {
  const initial = createWorkflow()
  expect(initial.nodes).toHaveLength(1)
  expect(initial.nodes[0]?.kind).toBe('START')
  expect(removeNode(initial, initial.startNodeId)).toBe(initial)
  expect(withStartNode(initial)).toBe(initial)
  expect(validateWorkflow(initial).join()).toContain('请连接开始节点')
  const connected = connect(
    { ...initial, nodes: [...initial.nodes, expert('a')] },
    initial.startNodeId,
    'next',
    'a',
  )
  expect(validateWorkflow(connected)).toEqual([])
  expect(() => connect(connected, 'a', 'next', initial.startNodeId)).toThrow('开始节点不能有入线')
  expect(
    validateWorkflow(disconnect(connected, initial.startNodeId, 'next', 'a')).join(),
  ).toContain('请连接开始节点')
  expect(removeNode(connected, 'a').nodes[0]?.next).toBeNull()
  expect(validateWorkflow({ ...connected, startNodeId: 'a' }).join()).toContain('唯一的开始节点')
  expect(
    validateWorkflow({
      ...connected,
      nodes: [...connected.nodes, { ...initial.nodes[0]!, id: 'second' }],
    }).join(),
  ).toContain('唯一的开始节点')
})
it('adds an entry to old graphs without changing result references or step positions', () => {
  const original = graph()
  original.nodes[4]!.objective = '{{result:a}}'
  const upgraded = withStartNode(original)
  expect(original.schemaVersion).toBe(2)
  expect(original.nodes).toHaveLength(5)
  expect(upgraded.nodes.slice(0, 5).map((node) => node.id)).toEqual(
    original.nodes.map((node) => node.id),
  )
  expect(upgraded.nodes[5]?.next).toBe('a')
  expect(upgraded.nodes[4]?.objective).toBe('{{result:a}}')
  expect(validateWorkflow(upgraded)).toEqual([])
  expect(upstreamExperts(upgraded, 'end').map((node) => node.id)).toEqual(['a'])
})
it('connects reactive canvas data without mutating the old snapshot', () => {
  const original = reactive({
    schemaVersion: 2 as const,
    startNodeId: 'a',
    nodes: [expert('a'), expert('z')],
  })
  const updated = connect(original, 'a', 'next', 'z')
  expect(original.nodes[0]!.next).toBeNull()
  expect(updated.nodes[0]!.next).toBe('z')
  expect(validateWorkflow(updated)).toEqual([])
})
it('rejects cycles before updating the canvas', () => {
  expect(() => connect(graph(), 'end', 'next', 'a')).toThrow('循环')
})
it('reconverging node can only reference common upstream experts', () => {
  const g = graph()
  expect(upstreamExperts(g, 'end').map((n) => n.id)).toEqual(['a'])
  g.nodes[4]!.objective = '{{result:yes}}'
  expect(validateWorkflow(g).join()).toContain('每条路径')
  g.nodes[4]!.objective = '{{result:a}}'
  expect(validateWorkflow(g)).toEqual([])
})
it('removing a node clears its connections and exposes incomplete branches', () => {
  const result = removeNode(graph(), 'yes')
  expect(result.nodes[1]!.condition!.whenTrue).toBeNull()
  expect(validateWorkflow(result).join()).toContain('满足与不满足')
})
it('reports missing required inputs and invalid JSON scalar conditions', () => {
  const g = graph()
  g.nodes[0]!.expertId = null
  g.nodes[1]!.condition!.operator = 'JSON_EQUALS'
  g.nodes[1]!.condition!.value = '{}'
  expect(validateWorkflow(g).join()).toContain('Expert')
  expect(validateWorkflow(g).join()).toContain('JSON')
})
it('does not loop while inspecting a cyclic local draft', () => {
  const g = graph()
  g.nodes[4]!.next = 'a'
  expect(upstreamExperts(g, 'end')).toEqual([])
  expect(validateWorkflow(g).join()).toContain('循环')
})
