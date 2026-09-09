import { onScopeDispose, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'

const RADIUS = 90
const MAX_SCALE = 2.6

export function useOutlineProximity(
  track: Ref<HTMLElement | null>,
  markerIds: MaybeRefOrGetter<string[]>,
) {
  let buttons: HTMLElement[] = []
  let centers: number[] = []
  let centersDirty = true
  let pointerY: number | null = null
  let frame: number | null = null
  let observer: ResizeObserver | undefined
  let disposed = false

  function setScale(button: HTMLElement, scale: number) {
    const value = String(Number(scale.toFixed(4)))
    if (button.style.getPropertyValue('--outline-scale') !== value)
      button.style.setProperty('--outline-scale', value)
  }

  function update() {
    if (disposed || pointerY === null) return
    if (centersDirty) {
      // Measure fixed button boxes before writing transforms to their inner lines.
      centers = buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        return rect.top + rect.height / 2
      })
      centersDirty = false
    }
    const scales = centers.map((center) => {
      const distance = Math.abs(center - pointerY!)
      const weight = distance < RADIUS ? (1 + Math.cos((Math.PI * distance) / RADIUS)) / 2 : 0
      return 1 + (MAX_SCALE - 1) * weight
    })
    buttons.forEach((button, index) => setScale(button, scales[index]!))
  }

  function scheduleUpdate() {
    if (disposed || pointerY === null || frame !== null) return
    frame = window.requestAnimationFrame(() => {
      frame = null
      update()
    })
  }

  function cancelUpdate() {
    if (frame !== null) window.cancelAnimationFrame(frame)
    frame = null
  }

  function refresh() {
    centersDirty = true
    scheduleUpdate()
  }

  function handlePointerMove(event: PointerEvent) {
    if (disposed || !track.value || event.pointerType === 'touch') return
    pointerY = event.clientY
    scheduleUpdate()
  }

  function reset() {
    pointerY = null
    cancelUpdate()
    buttons.forEach((button) => setScale(button, 1))
  }

  function refreshButtons() {
    const elements = new Map(
      Array.from(track.value?.querySelectorAll<HTMLElement>('[data-outline-id]') || []).map(
        (button) => [button.dataset.outlineId!, button] as const,
      ),
    )
    const next = toValue(markerIds).flatMap((id) => {
      const button = elements.get(id)
      return button ? [button] : []
    })
    const previous = new Set(buttons)
    const current = new Set(next)
    for (const button of previous) {
      if (!current.has(button)) {
        observer?.unobserve(button)
        button.style.removeProperty('--outline-scale')
      }
    }
    for (const button of current) {
      if (!previous.has(button)) {
        observer?.observe(button, { box: 'border-box' })
        setScale(button, 1)
      }
    }
    buttons = next
    refresh()
  }

  watch(
    track,
    (element, _previous, cleanup) => {
      if (!element) return
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(refresh)
        observer.observe(element, { box: 'border-box' })
      }
      element.addEventListener('scroll', refresh, { passive: true })
      refreshButtons()
      cleanup(() => {
        reset()
        element.removeEventListener('scroll', refresh)
        observer?.disconnect()
        observer = undefined
        buttons.forEach((button) => button.style.removeProperty('--outline-scale'))
        buttons = []
        centers = []
      })
    },
    { immediate: true, flush: 'post' },
  )
  watch(() => JSON.stringify(toValue(markerIds)), refreshButtons, { flush: 'post' })

  onScopeDispose(() => {
    disposed = true
    cancelUpdate()
  })

  return { handlePointerMove, reset, refresh }
}
