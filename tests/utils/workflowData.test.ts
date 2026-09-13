import { expect, it } from 'vitest'
import {
  schemaError,
  validateNodeData,
  validReferencePath,
  defaultOutputSchema,
} from '@/utils/workflowData'
import type { WorkflowNode } from '@/types/orchestration'
const node = (): WorkflowNode => ({
  id: 'b',
  kind: 'EXPERT',
  name: 'b',
  expertId: 8,
  objective: '{{inputs}}',
  next: null,
  condition: null,
  x: 0,
  y: 0,
})
it('rejects invalid and unsupported schema constraints before saving', () => {
  expect(schemaError(defaultOutputSchema())).toBe('')
  expect(
    schemaError({
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string' } } },
      required: ['list'],
    }),
  ).toBe('')
  expect(schemaError({ type: 'object', required: ['absent'] })).toContain('必填')
  expect(schemaError({ type: 'string', pattern: 'x' })).toContain('不支持')
  expect(schemaError({ type: 'object', additionalProperties: { type: 'string' } })).toContain(
    '布尔',
  )
  expect(schemaError({ type: 'array' })).toContain('items')
})
it('allows only project-relative visible file references', () => {
  expect(validReferencePath('docs/检查报告.md')).toBe(true)
  for (const path of [
    '../x',
    '/root/x',
    'C:/x',
    'a\\b',
    '.git/config',
    'docs/.agents/x',
    'x/CON.txt',
    'x//y',
    '',
  ])
    expect(validReferencePath(path)).toBe(false)
})
it('checks binding aliases, dominating sources and declared upstream files', () => {
  const n = node(),
    source = { ...node(), id: 'a', outputFiles: [{ name: 'report', path: 'docs/report.md' }] }
  n.inputs = [
    {
      name: 'approved',
      source: 'RESULT_JSON',
      sourceNodeId: 'a',
      pointer: '/approved',
      required: true,
    },
  ]
  n.inputFiles = [{ name: 'report', sourceNodeId: 'a', sourceFile: 'report' }]
  n.objective = '{{input:approved}} {{file:report}}'
  expect(validateNodeData(n, [source])).toEqual([])
  expect(validateNodeData(n, []).join()).toContain('上游')
  n.inputFiles[0]!.sourceFile = 'absent'
  expect(validateNodeData(n, [source]).join()).toContain('文件来源')
  n.objective = '{{input:absent}} {{outputSchema}}'
  expect(validateNodeData(n, [source]).join()).toContain('未配置')
})
