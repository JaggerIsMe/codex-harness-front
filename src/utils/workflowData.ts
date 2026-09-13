import type { WorkflowNode, WorkflowOutputSchema, JsonType } from '@/types/orchestration'
import { validWorkspaceName } from '@/utils/workspaceFileActions'

export const jsonTypes: JsonType[] = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]
export const hasWorkflowData = (n: WorkflowNode) =>
  Boolean(n.inputs?.length || n.inputFiles?.length || n.outputFiles?.length || n.outputSchema)
export function schemaError(schema: unknown): string {
  if (schema == null) return ''
  let count = 0
  const object = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
  function check(s: unknown, depth = 0): void {
    if (!object(s) || depth > 8 || ++count > 128)
      throw new Error('Schema 需为对象，最多 8 层、128 项')
    const keys = [
      'type',
      'description',
      'properties',
      'required',
      'additionalProperties',
      'items',
      'enum',
    ]
    for (const key of Object.keys(s))
      if (!keys.includes(key)) throw new Error(`不支持 Schema 关键字 ${key}`)
    if (!jsonTypes.includes(s.type as JsonType)) throw new Error('请选择单一输出类型')
    if (
      s.description !== undefined &&
      (typeof s.description !== 'string' || s.description.length > 1000)
    )
      throw new Error('字段说明无效')
    if (s.properties !== undefined) {
      if (s.type !== 'object' || !object(s.properties)) throw new Error('properties 只用于对象')
      for (const [name, child] of Object.entries(s.properties)) {
        if (!name || name.length > 100) throw new Error('字段名无效')
        check(child, depth + 1)
      }
    }
    if (
      s.required !== undefined &&
      (s.type !== 'object' ||
        !Array.isArray(s.required) ||
        new Set(s.required).size !== s.required.length ||
        s.required.some(
          (k) => typeof k !== 'string' || !object(s.properties) || !Object.hasOwn(s.properties, k),
        ))
    )
      throw new Error('必填字段未定义或重复')
    if (
      s.additionalProperties !== undefined &&
      (s.type !== 'object' || typeof s.additionalProperties !== 'boolean')
    )
      throw new Error('additionalProperties 仅支持布尔值')
    if (s.type === 'array' && !s.items) throw new Error('数组需配置 items')
    if (s.items !== undefined) {
      if (s.type !== 'array') throw new Error('items 只用于数组')
      check(s.items, depth + 1)
    }
    if (
      s.enum !== undefined &&
      (!Array.isArray(s.enum) ||
        !s.enum.length ||
        s.enum.length > 100 ||
        s.enum.some((v) => typeof v === 'object' && v !== null))
    )
      throw new Error('enum 需包含 1–100 个标量')
  }
  try {
    if (JSON.stringify(schema).length > 16000) throw new Error('输出 Schema 超过 16000 字符')
    check(schema)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : 'Schema 无效'
  }
}
export const validReferencePath = (path?: string | null) =>
  Boolean(path && path.length <= 2048 && path.split('/').every(validWorkspaceName))
export function validateNodeData(node: WorkflowNode, upstream: WorkflowNode[]): string[] {
  const errors: string[] = []
  if (node.kind !== 'EXPERT') return hasWorkflowData(node) ? ['只有 Expert 节点可配置输入输出'] : []
  const schemaIssue = schemaError(node.outputSchema)
  if (schemaIssue) errors.push(schemaIssue)
  const namePattern = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/
  const sources = new Map(upstream.map((n) => [n.id, n]))
  for (const [kind, files] of [
    ['input', node.inputFiles ?? []],
    ['output', node.outputFiles ?? []],
  ] as const) {
    if (files.length > 20) errors.push('输入、输出文件各最多 20 个')
    const names = new Set<string>()
    for (const file of files) {
      if (!namePattern.test(file.name) || names.has(file.name)) errors.push('文件别名无效或重复')
      names.add(file.name)
      if (file.sourceNodeId) {
        if (
          kind !== 'input' ||
          file.path ||
          !sources.get(file.sourceNodeId)?.outputFiles?.some((f) => f.name === file.sourceFile)
        )
          errors.push('文件来源必须是必经上游已声明的输出文件')
      } else if (file.sourceFile || !validReferencePath(file.path))
        errors.push('文件需使用可见的工作区相对路径')
    }
  }
  const names = new Set<string>()
  if ((node.inputs?.length ?? 0) > 40) errors.push('输入字段最多 40 个')
  for (const input of node.inputs ?? []) {
    if (!namePattern.test(input.name) || names.has(input.name)) errors.push('输入字段名无效或重复')
    names.add(input.name)
    if (
      ['RESULT_TEXT', 'RESULT_JSON'].includes(input.source) &&
      !sources.has(input.sourceNodeId ?? '')
    )
      errors.push('输入来源必须是每条路径都经过的上游 Expert')
    if (
      input.source === 'RESULT_JSON' &&
      (input.pointer == null ||
        input.pointer.length > 500 ||
        (input.pointer !== '' && !input.pointer.startsWith('/')) ||
        /~(?![01])/.test(input.pointer))
    )
      errors.push('输入 JSON Pointer 无效')
    if (input.source === 'CONSTANT' && (input.value == null || input.value.length > 12000))
      errors.push('固定输入最多 12000 字符')
    if (input.source === 'FILE' && !node.inputFiles?.some((f) => f.name === input.fileName))
      errors.push('输入引用的文件别名不存在')
    if (!['GOAL', 'CONSTANT', 'RESULT_TEXT', 'RESULT_JSON', 'FILE'].includes(input.source))
      errors.push('输入来源不受支持')
  }
  for (const match of node.objective.matchAll(
    /\{\{(input|file|outputFile):([a-zA-Z][a-zA-Z0-9_]{0,63})}}/g,
  )) {
    const exists =
      match[1] === 'input'
        ? names.has(match[2]!)
        : (match[1] === 'file' ? node.inputFiles : node.outputFiles)?.some(
            (f) => f.name === match[2],
          )
    if (!exists) errors.push(`职责引用了未配置的 ${match[1]}：${match[2]}`)
  }
  if (node.objective.includes('{{outputSchema}}') && !node.outputSchema)
    errors.push('职责引用了未配置的输出 Schema')
  return [...new Set(errors)]
}
export const defaultOutputSchema = (): WorkflowOutputSchema => ({
  type: 'object',
  properties: { approved: { type: 'boolean' }, summary: { type: 'string' } },
  required: ['approved', 'summary'],
  additionalProperties: false,
})
