export type WorkspaceLayoutMode = 'chat' | 'chat-files' | 'three' | 'dual' | 'single'
export interface WorkspaceLayoutPreference {
  tree: number
  two: number
  three: number
}
export const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), Math.max(min, max))
export function layoutMode(
  width: number,
  preview: boolean,
  files: boolean,
  previous?: WorkspaceLayoutMode,
): WorkspaceLayoutMode {
  if (!preview && !files) return 'chat'
  if (!preview) return width >= 700 + (previous === 'single' ? 24 : 0) ? 'chat-files' : 'single'
  if (files && width >= 1200 + (previous && previous !== 'three' ? 24 : 0)) return 'three'
  return width >= 860 + (previous === 'single' ? 24 : 0) ? 'dual' : 'single'
}
export function layoutWidths(
  width: number,
  mode: WorkspaceLayoutMode,
  preference: WorkspaceLayoutPreference,
) {
  if (mode === 'chat' || mode === 'single') return [Math.max(0, width)]
  if (mode === 'chat-files') {
    const tree = clamp(preference.tree || clamp(width * 0.18, 220, 300), 220, width - 426)
    return [width - tree - 6, tree]
  }
  if (mode === 'dual') {
    const chat = clamp((width - 6) * preference.two, 420, width - 406)
    return [chat, width - chat - 6]
  }
  const tree = clamp(preference.tree || clamp(width * 0.18, 220, 300), 220, width - 832)
  const rest = width - tree - 12
  const chat = clamp(rest * preference.three, 420, rest - 400)
  return [chat, rest - chat, tree]
}
export function readLayoutPreference(value: string | null): WorkspaceLayoutPreference {
  const defaults = { tree: 0, two: 0.52, three: 0.52 }
  try {
    const p: unknown = JSON.parse(value || 'null')
    if (!p || typeof p !== 'object') return defaults
    for (const key of ['tree', 'two', 'three'] as const) {
      if (key in p) {
        const n = p[key as keyof typeof p]
        if (typeof n === 'number' && Number.isFinite(n))
          defaults[key] = key === 'tree' ? clamp(n, 0, 1200) : clamp(n, 0.1, 0.9)
      }
    }
  } catch {
    /* Invalid browser preferences use defaults. */
  }
  return defaults
}
