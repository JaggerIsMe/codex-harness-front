export interface PolicyBlockDetails {
  approvalType: string
  message: string
  guidance: string
  operation: Record<string, unknown>
}

export function parsePolicyBlock(content: string): PolicyBlockDetails | null {
  try {
    const value: unknown = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const data = value as Record<string, unknown>
    if (data.type !== 'approvalBlocked' || typeof data.message !== 'string') return null
    return {
      approvalType: typeof data.approvalType === 'string' ? data.approvalType : '',
      message: data.message,
      guidance: typeof data.guidance === 'string' ? data.guidance : '',
      operation:
        data.operation && typeof data.operation === 'object' && !Array.isArray(data.operation)
          ? (data.operation as Record<string, unknown>)
          : {},
    }
  } catch {
    return null
  }
}
