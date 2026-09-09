import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { useOutlineProximity } from '@/composables/useOutlineProximity'

const observers: MockResizeObserver[] = []
const frames = new Map<number, FrameRequestCallback>()
let frameId = 0

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(private callback: ResizeObserverCallback) {
    observers.push(this)
  }

  resize() {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}

const wrappers: ReturnType<typeof mount>[] = []

async function create() {
  const track = ref<HTMLElement | null>(null)
  const markerIds = ref(['a', 'b', 'c', 'd', 'e'])
  const positions = new Map([
    ['a', 60],
    ['b', 105],
    ['c', 150],
    ['d', 195],
    ['e', 240],
  ])
  const phases: string[] = []
  const buttons = new Map<string, HTMLButtonElement>()
  let state!: ReturnType<typeof useOutlineProximity>
  const wrapper = mount(
    defineComponent({
      setup() {
        state = useOutlineProximity(track, markerIds)
        return () => h('div')
      },
    }),
  )
  wrappers.push(wrapper)
  const element = document.createElement('div')
  const renderMarkers = (ids: string[]) => {
    markerIds.value = ids
    const next = ids.map((id) => {
      const existing = buttons.get(id)
      if (existing) return existing
      const button = document.createElement('button')
      button.dataset.outlineId = id
      vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => {
        phases.push(`read:${id}`)
        return new DOMRect(0, (positions.get(id) || 0) - 9, 32, 18)
      })
      const setProperty = button.style.setProperty.bind(button.style)
      vi.spyOn(button.style, 'setProperty').mockImplementation((name, value, priority) => {
        phases.push(`write:${id}`)
        setProperty(name, value, priority)
      })
      buttons.set(id, button)
      return button
    })
    element.replaceChildren(...next)
  }
  renderMarkers(markerIds.value)
  track.value = element
  await nextTick()
  phases.length = 0
  const move = (clientY: number, pointerType = 'mouse') =>
    state.handlePointerMove({ clientY, pointerType } as PointerEvent)
  const scale = (id: string) => Number(buttons.get(id)!.style.getPropertyValue('--outline-scale'))
  return {
    state,
    track,
    markerIds,
    buttons,
    positions,
    phases,
    wrapper,
    observer: observers.at(-1)!,
    renderMarkers,
    move,
    scale,
  }
}

beforeEach(() => {
  observers.length = 0
  frames.clear()
  frameId = 0
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('scales adjacent markers monotonically and symmetrically by their fixed center distance', async () => {
  const { move, scale } = await create()
  move(150)
  flushFrame()
  expect(scale('c')).toBe(2.6)
  expect(scale('b')).toBeCloseTo(1.8)
  expect(scale('d')).toBe(scale('b'))
  expect(scale('a')).toBe(1)
  expect(scale('e')).toBe(1)
  expect(scale('c')).toBeGreaterThan(scale('b'))
  expect(scale('b')).toBeGreaterThan(scale('a'))
})

it('smoothly approaches the default scale at the radius boundary', async () => {
  const { move, scale } = await create()
  move(61)
  flushFrame()
  expect(scale('c')).toBeGreaterThan(1)
  expect(scale('c') - 1).toBeLessThan(0.001)
  move(60)
  flushFrame()
  expect(scale('c')).toBe(1)
  move(59)
  flushFrame()
  expect(scale('c')).toBe(1)
})

it('coalesces pointer movement and batches geometry reads before any style writes', async () => {
  const { move, scale, phases, markerIds, observer, buttons } = await create()
  for (let index = 0; index < 100; index++) move(index + 51)
  expect(frames.size).toBe(1)
  flushFrame()
  expect(scale('c')).toBe(2.6)
  expect(phases.slice(0, 5)).toEqual(['read:a', 'read:b', 'read:c', 'read:d', 'read:e'])
  expect(phases.slice(5).every((phase) => phase.startsWith('write:'))).toBe(true)

  const targets = observer.observe.mock.calls.length
  markerIds.value = [...markerIds.value]
  await nextTick()
  move(160)
  flushFrame()
  expect(observers).toHaveLength(1)
  expect(observer.observe).toHaveBeenCalledTimes(targets)
  expect(buttons.get('c')!.getBoundingClientRect).toHaveBeenCalledTimes(1)
})

it('resets on leave, cancels pending movement and ignores touch input', async () => {
  const { state, move, scale } = await create()
  move(150)
  flushFrame()
  expect(scale('c')).toBe(2.6)
  move(160)
  state.reset()
  expect(frames.size).toBe(0)
  expect(scale('c')).toBe(1)
  move(150, 'touch')
  expect(frames.size).toBe(0)
  expect(scale('c')).toBe(1)
})

it('refreshes geometry after scrolling, resizing and marker insertion without replacing listeners', async () => {
  const { move, scale, track, positions, observer, renderMarkers } = await create()
  move(150)
  flushFrame()
  positions.set('c', 240)
  track.value!.dispatchEvent(new Event('scroll'))
  flushFrame()
  expect(scale('c')).toBe(1)
  positions.set('c', 150)
  observer.resize()
  flushFrame()
  expect(scale('c')).toBe(2.6)

  positions.set('new', 150)
  renderMarkers(['new', 'a', 'b', 'd', 'e'])
  await nextTick()
  flushFrame()
  expect(scale('new')).toBe(2.6)
  expect(observer.unobserve).toHaveBeenCalled()
  expect(observers).toHaveLength(1)
})

it('releases animation frames, listeners, observers and owned styles on disposal', async () => {
  const { wrapper, state, move, track, buttons, observer } = await create()
  const removeListener = vi.spyOn(track.value!, 'removeEventListener')
  move(150)
  flushFrame()
  move(160)
  wrapper.unmount()
  expect(frames.size).toBe(0)
  expect(observer.disconnect).toHaveBeenCalledOnce()
  expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function))
  expect(buttons.get('c')!.style.getPropertyValue('--outline-scale')).toBe('')
  move(150)
  observer.resize()
  state.refresh()
  expect(frames.size).toBe(0)
})
