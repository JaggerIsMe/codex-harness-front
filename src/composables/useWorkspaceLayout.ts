import { computed, onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  clamp,
  layoutMode,
  layoutWidths,
  readLayoutPreference,
  type WorkspaceLayoutMode,
} from '@/utils/workspaceLayout'

export function useWorkspaceLayout(
  container: Ref<HTMLElement | null>,
  preview: Ref<boolean>,
  files: Ref<boolean>,
) {
  const auth = useAuthStore()
  const width = ref(0)
  const mode = ref<WorkspaceLayoutMode>('chat')
  const preference = ref(readLayoutPreference(null))
  const maximized = ref(false)
  const active = ref<'chat' | 'preview' | 'files'>('chat')
  const key = computed(() => `harness:workspace-layout:v1:${auth.user?.id || 'anonymous'}`)
  watch(
    key,
    () => {
      try {
        preference.value = readLayoutPreference(localStorage.getItem(key.value))
      } catch {
        preference.value = readLayoutPreference(null)
      }
    },
    { immediate: true },
  )
  watch(
    [width, preview, files],
    ([w, p, f], previous) => {
      const resizing = previous && p === previous[1] && f === previous[2]
      mode.value = layoutMode(w, p, f, resizing ? mode.value : undefined)
      if (!preview.value) maximized.value = false
      if (
        (active.value === 'preview' && !preview.value) ||
        (active.value === 'files' && !files.value)
      )
        active.value = preview.value ? 'preview' : 'chat'
    },
    { immediate: true },
  )
  watch(preview, (value) => {
    if (value) active.value = 'preview'
  })
  watch(files, (value) => {
    if (value) active.value = 'files'
  })
  const sizes = computed(() => layoutWidths(width.value, mode.value, preference.value))
  const visible = computed(() => {
    if (maximized.value) return ['preview']
    if (mode.value === 'single') return [active.value]
    if (mode.value === 'dual')
      return ['chat', active.value === 'files' && files.value ? 'files' : 'preview']
    if (mode.value === 'three') return ['chat', 'preview', 'files']
    return mode.value === 'chat-files' ? ['chat', 'files'] : ['chat']
  })
  function persist() {
    try {
      localStorage.setItem(key.value, JSON.stringify(preference.value))
    } catch {
      /* Optional preference storage. */
    }
  }
  function adjust(index: number, delta: number, original = sizes.value) {
    const p = preference.value
    if (mode.value === 'three' && index === 1) {
      const tree = clamp(original[2]! - delta, 220, original[1]! + original[2]! - 400)
      p.tree = tree
      p.three = original[0]! / (width.value - tree - 12)
    } else if (mode.value === 'chat-files')
      p.tree = clamp(original[1]! - delta, 220, width.value - 426)
    else {
      const sum = original[0]! + original[1]!
      const ratio = clamp(original[0]! + delta, 420, sum - 400) / sum
      if (mode.value === 'three') p.three = ratio
      else p.two = ratio
    }
  }
  let releaseDrag: (() => void) | undefined
  function drag(event: PointerEvent, index: number) {
    if (event.button !== 0) return
    releaseDrag?.()
    const handle = event.currentTarget as HTMLElement
    const start = event.clientX
    const original = [...sizes.value]
    handle.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      if (e.pointerId === event.pointerId) adjust(index, e.clientX - start, original)
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      handle.removeEventListener('lostpointercapture', end)
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
      releaseDrag = undefined
      persist()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
    handle.addEventListener('lostpointercapture', end)
    releaseDrag = end
    event.preventDefault()
  }
  function resizeKey(event: KeyboardEvent, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    adjust(
      index,
      event.key === 'Home'
        ? -100000
        : event.key === 'End'
          ? 100000
          : (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 50 : 10),
    )
    persist()
  }
  function reset() {
    if (mode.value === 'three') {
      preference.value.three = 0.52
      preference.value.tree = 0
    } else if (mode.value === 'dual') preference.value.two = 0.52
    else if (mode.value === 'chat-files') preference.value.tree = 0
    persist()
  }
  let observer: ResizeObserver | undefined
  onMounted(() => {
    if (!container.value) return
    width.value = container.value.clientWidth
    mode.value = layoutMode(width.value, preview.value, files.value)
    observer = new ResizeObserver((entries) => {
      releaseDrag?.()
      width.value = entries[0]?.contentRect.width || 0
    })
    observer.observe(container.value)
  })
  onScopeDispose(() => {
    observer?.disconnect()
    releaseDrag?.()
  })
  return { mode, sizes, visible, maximized, active, drag, resizeKey, reset }
}
