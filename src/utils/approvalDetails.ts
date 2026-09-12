import type { Approval } from '@/types/domain'

export interface ApprovalField {
  label: string
  value: string
  code: boolean
}
export interface ApprovalQuestion {
  id: string
  isOther: boolean
  isSecret: boolean
  title: string
  text: string
  options: { label: string; description: string }[]
}
export interface ApprovalDetails {
  summary: string
  fields: ApprovalField[]
  questions: ApprovalQuestion[]
  raw: string
}

const labels: Record<string, string> = {
  command: '执行命令',
  cwd: '工作目录',
  reason: '申请原因',
  justification: '申请原因',
  tool: '调用工具',
  toolName: '调用工具',
  server: 'MCP 服务',
  serverName: 'MCP 服务',
  scope: '影响范围',
  grantRoot: '授权目录',
  path: '文件路径',
  filePath: '文件路径',
  changes: '文件变更',
  diff: '变更对比',
  patch: '变更补丁',
  arguments: '调用参数',
  args: '调用参数',
  commandActions: '命令操作',
  networkApprovalContext: '网络访问',
  host: '目标主机',
  port: '端口',
  protocol: '协议',
  url: '目标地址',
  type: '类型',
  kind: '操作类型',
  description: '说明',
  message: '说明',
}
const metadata = new Set([
  'threadId',
  'turnId',
  'itemId',
  'requestId',
  'isBlocking',
  'availableDecisions',
])
const codeFields = new Set(['command', 'cwd', 'path', 'filePath', 'grantRoot', 'diff', 'patch'])

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Decode the external payload once; retain the complete request for inspection. */
export function describeApproval(details: Approval['details']): ApprovalDetails {
  let value: unknown = details
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      /* Plain text is also valid. */
    }
  }
  const raw = typeof details === 'string' ? details : JSON.stringify(details, null, 2)
  const source = record(value)
  const fields: ApprovalField[] = []
  const questions: ApprovalQuestion[] = []
  const summaryKey =
    source &&
    ['question', 'reason', 'justification', 'message', 'description'].find((key) =>
      text(source[key]).trim(),
    )
  const summary = source ? (summaryKey ? text(source[summaryKey]) : '') : text(value)

  function append(label: string, entry: unknown, code = false): void {
    if (Array.isArray(entry) && entry.length) {
      entry.forEach((child, index) => append(`${label} · ${index + 1}`, child, code))
    } else {
      const object = record(entry)
      if (object && Object.keys(object).length) {
        Object.entries(object).forEach(([key, child]) =>
          append(`${label} / ${labels[key] || key}`, child, code || codeFields.has(key)),
        )
      } else {
        fields.push({
          label,
          code,
          value:
            entry == null
              ? '未提供'
              : typeof entry === 'boolean'
                ? entry
                  ? '是'
                  : '否'
                : typeof entry === 'object'
                  ? '空'
                  : String(entry),
        })
      }
    }
  }

  if (source) {
    for (const [key, entry] of Object.entries(source)) {
      if (key === summaryKey || metadata.has(key)) continue
      if (key === 'questions' && Array.isArray(entry)) {
        for (const item of entry) {
          const question = record(item)
          if (!question || !text(question.question)) {
            append('问题', item)
            continue
          }
          questions.push({
            id: text(question.id),
            isOther: question.isOther === true,
            isSecret: question.isSecret === true,
            title: text(question.header) || '审批说明',
            text: text(question.question),
            options: Array.isArray(question.options)
              ? question.options.flatMap((option) => {
                  const data = record(option)
                  return data && text(data.label)
                    ? [{ label: text(data.label), description: text(data.description) }]
                    : []
                })
              : [],
          })
        }
      } else append(labels[key] || key, entry, codeFields.has(key))
    }
  } else if (!summary && value != null) append('审批内容', value)
  return { summary, fields, questions, raw }
}
