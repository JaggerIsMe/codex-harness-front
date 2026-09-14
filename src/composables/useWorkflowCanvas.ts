import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { Workflow, WorkflowNode } from '@/types/orchestration'
import { connect, type WorkflowPort } from '@/utils/workflow'

type Point = { x: number; y: number }
type Link = {
  from: string
  port: WorkflowPort
  point: Point
  hoverId: string | null
  valid: boolean
}
type Gesture = { pointerId: number; start: Point; moved: boolean } & (
  { kind: 'pan'; origin: Point } | { kind: 'node'; id: string; origin: Point } | { kind: 'link' }
)
export function useWorkflowCanvas(
  graph: () => Workflow,
  readonly: () => boolean,
  viewport: Ref<HTMLElement | null>,
  update: (graph: Workflow) => void,
  select: (id: string) => void,
  coveredArea: () => { right: number; bottom: number } = () => ({ right: 0, bottom: 0 }),
) {
  const view = shallowRef({ x: 0, y: 0, zoom: 1 })
  const preview = shallowRef<({ id: string } & Point) | null>(null)
  const connecting = shallowRef<Link | null>(null)
  const gestureKind = ref(''),
    spaceHeld = ref(false),
    error = ref('')
  let gesture: Gesture | null = null,
    animation = 0,
    pending: Point | null = null
  let suppressClick = false
  const visualNodes = computed(() =>
    preview.value
      ? graph().nodes.map((n) =>
          n.id === preview.value!.id ? { ...n, x: preview.value!.x, y: preview.value!.y } : n,
        )
      : graph().nodes,
  )
  const transform = computed(
    () => `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.zoom})`,
  )
  function world(point: Point): Point {
    const rect = viewport.value!.getBoundingClientRect()
    return {
      x: (point.x - rect.left - view.value.x) / view.value.zoom,
      y: (point.y - rect.top - view.value.y) / view.value.zoom,
    }
  }
  function client(event: PointerEvent): Point {
    return { x: event.clientX, y: event.clientY }
  }
  function capture(event: PointerEvent, value: Gesture) {
    gesture = value
    gestureKind.value = value.kind
    suppressClick = false
    viewport.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  function beginPan(event: PointerEvent) {
    if (gesture || (event.button !== 0 && event.button !== 1)) return
    if (
      event.button === 0 &&
      (event.target as Element).closest('.workflow-canvas__node, .workflow-canvas__reconnect')
    )
      return
    if (connecting.value) connecting.value = null
    capture(event, {
      kind: 'pan',
      pointerId: event.pointerId,
      start: client(event),
      origin: { x: view.value.x, y: view.value.y },
      moved: false,
    })
  }
  function beginNode(event: PointerEvent, node: WorkflowNode) {
    if (gesture) return
    if (event.button === 1 || (event.button === 0 && spaceHeld.value)) {
      capture(event, {
        kind: 'pan',
        pointerId: event.pointerId,
        start: client(event),
        origin: { x: view.value.x, y: view.value.y },
        moved: false,
      })
      return
    }
    if (readonly() || connecting.value || event.button !== 0) return
    select(node.id)
    capture(event, {
      kind: 'node',
      pointerId: event.pointerId,
      start: client(event),
      id: node.id,
      origin: { x: node.x, y: node.y },
      moved: false,
    })
  }
  function arm(from: string, port: WorkflowPort) {
    if (readonly()) return
    const node = graph().nodes.find((n) => n.id === from)
    if (!node) return
    error.value = ''
    connecting.value = {
      from,
      port,
      point: {
        x: node.x + 284,
        y: node.y + (port === 'next' ? 150 : port === 'whenTrue' ? 125 : 165),
      },
      hoverId: null,
      valid: false,
    }
  }
  function beginLink(event: PointerEvent, from: string, port: WorkflowPort) {
    if (readonly() || gesture || event.button !== 0) return
    arm(from, port)
    capture(event, { kind: 'link', pointerId: event.pointerId, start: client(event), moved: false })
  }
  function activatePort(event: MouseEvent, from: string, port: WorkflowPort) {
    // Pointer gestures already arm on pointerdown. detail=0 is keyboard activation.
    if (event.detail === 0) arm(from, port)
  }
  function hover(point: Point) {
    const link = connecting.value
    if (!link) return
    const hit = document.elementFromPoint(point.x, point.y)
    const nodeElement = hit?.closest<HTMLElement>('[data-node-id]')
    const id =
      nodeElement && viewport.value?.contains(nodeElement)
        ? (nodeElement.dataset.nodeId ?? null)
        : null
    let valid = link.valid
    if (id !== link.hoverId) {
      valid = false
      if (id) {
        try {
          connect(graph(), link.from, link.port, id)
          valid = true
        } catch {
          /* Invalid targets are highlighted, never applied. */
        }
      }
    }
    connecting.value = { ...link, point: world(point), hoverId: id, valid }
  }
  function applyPoint(point: Point) {
    if (!gesture) {
      if (connecting.value) hover(point)
      return
    }
    const dx = point.x - gesture.start.x,
      dy = point.y - gesture.start.y
    gesture.moved ||= Math.hypot(dx, dy) >= 4
    if (!gesture.moved) return
    if (gesture.kind === 'pan')
      view.value = { ...view.value, x: gesture.origin.x + dx, y: gesture.origin.y + dy }
    else if (gesture.kind === 'node')
      preview.value = {
        id: gesture.id,
        x: bounded(gesture.origin.x + dx / view.value.zoom),
        y: bounded(gesture.origin.y + dy / view.value.zoom),
      }
    else hover(point)
  }
  function move(event: PointerEvent) {
    if ((!gesture && !connecting.value) || (gesture && gesture.pointerId !== event.pointerId))
      return
    pending = client(event)
    if (!animation)
      animation = requestAnimationFrame(() => {
        animation = 0
        if (pending) applyPoint(pending)
        pending = null
      })
  }
  function clearFrame() {
    if (animation) cancelAnimationFrame(animation)
    animation = 0
    pending = null
  }
  function release(pointerId: number) {
    if (viewport.value?.hasPointerCapture(pointerId))
      viewport.value.releasePointerCapture(pointerId)
  }
  function finish(event: PointerEvent) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    clearFrame()
    applyPoint(client(event))
    const completed = gesture
    gesture = null
    gestureKind.value = ''
    suppressClick = completed.moved
    if (completed.kind === 'node') {
      const position = preview.value
      if (completed.moved && position) commitPosition(completed.id, position.x, position.y)
      preview.value = null
    } else if (completed.kind === 'link' && completed.moved) {
      const link = connecting.value
      if (link?.hoverId) linkTo(link.hoverId)
      connecting.value = null
    }
    release(event.pointerId)
  }
  function cancel() {
    clearFrame()
    const previous = gesture
    gesture = null
    gestureKind.value = ''
    preview.value = null
    connecting.value = null
    suppressClick = true
    spaceHeld.value = false
    if (previous) release(previous.pointerId)
  }
  function lostCapture(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) cancel()
  }
  function linkTo(id: string) {
    const link = connecting.value
    if (!link || readonly()) return
    try {
      update(connect(graph(), link.from, link.port, id))
      connecting.value = null
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '无法连接'
    }
  }
  function selectNode(id: string, event: MouseEvent) {
    if (suppressClick && event.detail !== 0) {
      suppressClick = false
      return
    }
    if (connecting.value) linkTo(id)
    select(id)
  }
  function bounded(value: number) {
    return Math.max(0, Math.min(10000, Math.round(value)))
  }
  function commitPosition(id: string, x: number, y: number) {
    update({
      ...graph(),
      nodes: graph().nodes.map((n) => (n.id === id ? { ...n, x: bounded(x), y: bounded(y) } : n)),
    })
  }
  function nudge(node: WorkflowNode, x: number, y: number) {
    if (!readonly() && !gesture) commitPosition(node.id, node.x + x, node.y + y)
  }
  function zoomAt(zoom: number, anchor?: Point) {
    if (gesture || !viewport.value) return
    const rect = viewport.value.getBoundingClientRect()
    const point = anchor ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const before = world(point),
      next = Math.max(0.2, Math.min(2, zoom))
    view.value = {
      zoom: next,
      x: point.x - rect.left - before.x * next,
      y: point.y - rect.top - before.y * next,
    }
  }
  function wheel(event: WheelEvent) {
    event.preventDefault()
    if (gesture) return
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (viewport.value?.clientHeight ?? 500) : 1
    const dx = event.deltaX * unit,
      dy = event.deltaY * unit
    if (event.ctrlKey || event.metaKey)
      zoomAt(view.value.zoom * Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.01), {
        x: event.clientX,
        y: event.clientY,
      })
    else
      view.value = {
        ...view.value,
        x: view.value.x - (event.shiftKey ? dy : dx),
        y: view.value.y - (event.shiftKey ? dx : dy),
      }
  }
  function fit() {
    if (gesture || !viewport.value) return
    const nodes = graph().nodes
    if (!nodes.length) {
      view.value = { x: 0, y: 0, zoom: 1 }
      return
    }
    const left = Math.min(...nodes.map((n) => n.x)) - 40,
      top = Math.min(...nodes.map((n) => n.y)) - 40
    const width = Math.max(...nodes.map((n) => n.x + 264)) - left,
      height = Math.max(...nodes.map((n) => n.y + 240)) - top
    const rect = viewport.value.getBoundingClientRect(),
      availableWidth = Math.max(1, rect.width - coveredArea().right),
      availableHeight = Math.max(1, rect.height - coveredArea().bottom),
      zoom = Math.max(0.2, Math.min(1, availableWidth / width, availableHeight / height))
    view.value = {
      zoom,
      x: (availableWidth - width * zoom) / 2 - left * zoom,
      y: (availableHeight - height * zoom) / 2 - top * zoom,
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    } else if (
      event.code === 'Space' &&
      !(event.target as Element).closest(
        'button, input, textarea, select, [contenteditable="true"]',
      )
    ) {
      event.preventDefault()
      spaceHeld.value = true
    }
  }
  function keyup(event: KeyboardEvent) {
    if (event.code === 'Space') spaceHeld.value = false
  }
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape' && (gesture || connecting.value)) {
      event.preventDefault()
      cancel()
    }
  }
  function reveal(event: FocusEvent) {
    if (gesture || !viewport.value) return
    const element = (event.target as Element).closest<HTMLElement>('[data-node-id]')
    const node = graph().nodes.find((n) => n.id === element?.dataset.nodeId)
    if (!node) return
    const rect = viewport.value.getBoundingClientRect(),
      availableWidth = rect.width - coveredArea().right,
      availableHeight = rect.height - coveredArea().bottom,
      zoom = view.value.zoom
    const left = node.x * zoom + view.value.x,
      top = node.y * zoom + view.value.y
    let dx = 0,
      dy = 0
    if (left < 20) dx = 20 - left
    else if (left + 244 * zoom > availableWidth) dx = availableWidth - left - 244 * zoom
    if (top < 20) dy = 20 - top
    else if (top + 220 * zoom > availableHeight) dy = availableHeight - top - 220 * zoom
    if (dx || dy) view.value = { ...view.value, x: view.value.x + dx, y: view.value.y + dy }
  }
  watch([graph, readonly], () => {
    const current = gesture
    if (
      (readonly() && (current?.kind === 'node' || current?.kind === 'link' || connecting.value)) ||
      (current?.kind === 'node' && !graph().nodes.some((n) => n.id === current.id)) ||
      (connecting.value && !graph().nodes.some((n) => n.id === connecting.value!.from))
    )
      cancel()
  })
  window.addEventListener('blur', cancel)
  window.addEventListener('keyup', keyup)
  window.addEventListener('keydown', escape)
  onScopeDispose(() => {
    cancel()
    window.removeEventListener('blur', cancel)
    window.removeEventListener('keyup', keyup)
    window.removeEventListener('keydown', escape)
  })
  return {
    view,
    visualNodes,
    transform,
    connecting,
    gestureKind,
    spaceHeld,
    error,
    beginPan,
    beginNode,
    beginLink,
    activatePort,
    arm,
    move,
    finish,
    cancel,
    lostCapture,
    selectNode,
    nudge,
    zoomAt,
    wheel,
    fit,
    keydown,
    reveal,
  }
}
