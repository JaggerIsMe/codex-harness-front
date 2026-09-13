import type { Workflow, WorkflowNode } from '@/types/orchestration'
import { validateNodeData, hasWorkflowData } from '@/utils/workflowData'

export type WorkflowPort = 'next' | 'whenTrue' | 'whenFalse'
/** Append the entry so legacy step positions and result references remain unchanged. */
export function withStartNode(graph: Workflow): Workflow {
  if (graph.nodes.some((node) => node.kind === 'START')) return graph
  let id = 'workflow_start'
  while (graph.nodes.some((node) => node.id === id)) id += '_'
  const start: WorkflowNode = {
    id,
    kind: 'START',
    name: '开始',
    expertId: null,
    objective: '',
    condition: null,
    next: graph.startNodeId || null,
    x: 40,
    y: 40,
  }
  return {
    ...graph,
    schemaVersion: 4,
    startNodeId: id,
    nodes: [...graph.nodes.map((node) => ({ ...node, x: Math.min(10000, node.x + 310) })), start],
  }
}
export function createWorkflow(): Workflow {
  return withStartNode({ schemaVersion: 4, startNodeId: '', nodes: [] })
}
export function targets(node: WorkflowNode): string[] {
  return (
    node.kind === 'BRANCH' ? [node.condition?.whenTrue, node.condition?.whenFalse] : [node.next]
  ).filter((id): id is string => Boolean(id))
}
export function connect(graph: Workflow, from: string, port: WorkflowPort, to: string): Workflow {
  if (from === to) throw new Error('节点不能连接自身')
  const copy = JSON.parse(JSON.stringify(graph)) as Workflow
  const node = copy.nodes.find((n) => n.id === from)
  if (!node || !copy.nodes.some((n) => n.id === to)) throw new Error('节点不存在')
  if (copy.nodes.find((n) => n.id === to)?.kind === 'START') throw new Error('开始节点不能有入线')
  if (
    node.condition &&
    port !== 'next' &&
    node.condition[port === 'whenTrue' ? 'whenFalse' : 'whenTrue'] === to
  )
    throw new Error('满足与不满足出口需要连接不同的节点')
  const queue = [to],
    seen = new Set<string>()
  while (queue.length) {
    const id = queue.pop()!
    if (id === from) throw new Error('连线会形成循环，请使用向前的串行路径')
    if (seen.has(id)) continue
    seen.add(id)
    queue.push(...targets(copy.nodes.find((n) => n.id === id)!))
  }
  if (port === 'next' && (node.kind === 'EXPERT' || node.kind === 'START')) node.next = to
  else if (port !== 'next' && node.condition) node.condition[port] = to
  else throw new Error('出口不属于此节点')
  return copy
}
/** Only disconnect the selected route if its destination still matches. */
export function disconnect(
  graph: Workflow,
  from: string,
  port: WorkflowPort,
  target: string,
): Workflow {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (node.id !== from) return node
      if (
        port === 'next' &&
        (node.kind === 'EXPERT' || node.kind === 'START') &&
        node.next === target
      )
        return { ...node, next: null }
      if (port !== 'next' && node.kind === 'BRANCH' && node.condition?.[port] === target)
        return { ...node, condition: { ...node.condition, [port]: null } }
      return node
    }),
  }
}
export function removeNode(graph: Workflow, id: string): Workflow {
  if (graph.nodes.some((node) => node.id === id && node.kind === 'START')) return graph
  const copy = JSON.parse(JSON.stringify(graph)) as Workflow
  copy.nodes = copy.nodes.filter((n) => n.id !== id)
  if (copy.startNodeId === id) copy.startNodeId = copy.nodes[0]?.id ?? ''
  for (const node of copy.nodes) {
    if (node.next === id) node.next = null
    if (node.condition) {
      if (node.condition.whenTrue === id) node.condition.whenTrue = null
      if (node.condition.whenFalse === id) node.condition.whenFalse = null
      if (node.condition.sourceNodeId === id) node.condition.sourceNodeId = ''
    }
  }
  return copy
}
/** Nodes guaranteed to execute before the selected node on every possible route. */
export function upstreamExperts(graph: Workflow, id: string): WorkflowNode[] {
  const parents = new Map(graph.nodes.map((n) => [n.id, [] as string[]]))
  for (const node of graph.nodes)
    for (const target of targets(node)) parents.get(target)?.push(node.id)
  const degree = new Map([...parents].map(([key, values]) => [key, values.length]))
  const common = new Map<string, Set<string>>()
  const queue =
    graph.nodes.some((n) => n.id === graph.startNodeId) && !degree.get(graph.startNodeId)
      ? [graph.startNodeId]
      : []
  while (queue.length) {
    const current = queue.shift()!,
      incoming = parents.get(current)!
    const prior = new Set(incoming.length ? common.get(incoming[0]!) : [])
    for (const parent of incoming)
      for (const candidate of prior)
        if (!common.get(parent)?.has(candidate)) prior.delete(candidate)
    if (current === id) return graph.nodes.filter((n) => n.kind === 'EXPERT' && prior.has(n.id))
    prior.add(current)
    common.set(current, prior)
    for (const target of targets(graph.nodes.find((n) => n.id === current)!)) {
      const remaining = (degree.get(target) ?? 0) - 1
      degree.set(target, remaining)
      if (remaining === 0) queue.push(target)
    }
  }
  return []
}
export function validateWorkflow(graph: Workflow): string[] {
  const errors: string[] = []
  const limit = graph.schemaVersion === 4 ? 41 : 40
  if (!graph.nodes.length || graph.nodes.length > limit)
    errors.push('最多添加 40 个流程节点（不含开始节点）')
  const starts = graph.nodes.filter((node) => node.kind === 'START')
  if (graph.schemaVersion === 4 && (starts.length !== 1 || starts[0]?.id !== graph.startNodeId))
    errors.push('工作流必须包含唯一的开始节点，并从该节点进入')
  if (graph.schemaVersion !== 4 && starts.length) errors.push('开始节点需要工作流版本 4')
  if (!graph.nodes.some((n) => n.kind === 'EXPERT')) errors.push('至少添加一个 Expert 节点')
  if (!graph.nodes.some((n) => n.id === graph.startNodeId)) errors.push('请选择开始节点')
  const visited = new Set<string>(),
    visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id)) {
      errors.push('流程不能有循环')
      return
    }
    if (visited.has(id)) return
    const n = graph.nodes.find((n) => n.id === id)
    if (!n) {
      errors.push('连线目标不存在')
      return
    }
    visiting.add(id)
    targets(n).forEach(visit)
    visiting.delete(id)
    visited.add(id)
  }
  if (graph.startNodeId) visit(graph.startNodeId)
  if (visited.size !== graph.nodes.length) errors.push('请将所有节点连接到开始节点的路径上')
  for (const n of graph.nodes) {
    if (graph.schemaVersion >= 3)
      errors.push(
        ...validateNodeData(n, upstreamExperts(graph, n.id)).map((e) => `${n.name}：${e}`),
      )
    else if (hasWorkflowData(n)) errors.push('输入输出配置需要工作流版本 3')
    if (!n.name.trim()) errors.push('请填写节点名称')
    if (n.kind === 'START') {
      if (!n.next) errors.push('请连接开始节点的下一步出口')
      if (n.expertId || n.objective || n.condition)
        errors.push('开始节点不能配置 Expert、职责或条件')
      if (graph.nodes.some((source) => targets(source).includes(n.id)))
        errors.push('开始节点不能有入线')
    }
    if (n.kind === 'EXPERT' && (!n.expertId || !n.objective.trim()))
      errors.push(`${n.name}：请选择 Expert 并填写职责与目标`)
    const upstream = upstreamExperts(graph, n.id).map((x) => x.id)
    if (n.kind === 'EXPERT') {
      for (const match of n.objective.matchAll(/\{\{result:([a-zA-Z0-9_-]+)}}/g)) {
        if (!upstream.includes(match[1]!))
          errors.push(`${n.name}：结果变量必须引用每条路径都经过的上游 Expert`)
      }
    } else if (n.kind === 'BRANCH') {
      const c = n.condition
      if (!c?.whenTrue || !c.whenFalse || c.whenTrue === c.whenFalse)
        errors.push(`${n.name}：请连接不同的满足与不满足出口`)
      if (!c || !upstream.includes(c.sourceNodeId))
        errors.push(`${n.name}：请选择每条路径都经过的上游结果`)
      if (c?.operator === 'JSON_EQUALS') {
        try {
          const value: unknown = JSON.parse(c.value)
          if (value !== null && typeof value === 'object') throw new Error()
          if (c.pointer && !c.pointer.startsWith('/')) throw new Error()
        } catch {
          errors.push(`${n.name}：请填写有效的 JSON Pointer 和 JSON 标量条件值`)
        }
      }
    }
  }
  return [...new Set(errors)]
}
