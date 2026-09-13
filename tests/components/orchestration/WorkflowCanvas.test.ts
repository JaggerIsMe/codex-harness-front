import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import WorkflowCanvas from '@/components/orchestration/WorkflowCanvas.vue'
import type { Workflow } from '@/types/orchestration'
import { withStartNode } from '@/utils/workflow'

const graph = (): Workflow => ({
  schemaVersion: 2,
  startNodeId: 'a',
  nodes: [
    {
      id: 'a',
      kind: 'EXPERT',
      name: '任务 A',
      expertId: 8,
      objective: '用户任务',
      next: null,
      condition: null,
      x: 40,
      y: 40,
    },
    {
      id: 'b',
      kind: 'END',
      name: '结束 B',
      expertId: null,
      objective: '',
      next: null,
      condition: null,
      x: 400,
      y: 40,
    },
  ],
})
let wrapper: VueWrapper
let frames: FrameRequestCallback[]
it('renders the default entry with one output and no input port', async () => {
  await wrapper.setProps({ modelValue: withStartNode(graph()) })
  expect(wrapper.findAll('.workflow-canvas__node--start')).toHaveLength(1)
  expect(wrapper.find('[aria-label="开始 下一步出口"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="开始 入口"]').exists()).toBe(false)
  expect(wrapper.find('[aria-label="选择连线 开始 下一步 到 任务 A"]').exists()).toBe(true)
})
function point(element: Element, type: string, x: number, y: number, button = 0) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
    buttons: type === 'pointerup' ? 0 : 1,
  })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  element.dispatchEvent(event)
}
async function frame() {
  const pending = frames.splice(0)
  pending.forEach((cb) => cb(16))
  await nextTick()
}
beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  wrapper = mount(WorkflowCanvas, { props: { modelValue: graph() }, attachTo: document.body })
  for (const element of wrapper.findAll('button, .workflow-canvas__viewport')) {
    Object.defineProperty(element.element, 'setPointerCapture', {
      value: vi.fn(),
      configurable: true,
    })
    Object.defineProperty(element.element, 'releasePointerCapture', {
      value: vi.fn(),
      configurable: true,
    })
    Object.defineProperty(element.element, 'hasPointerCapture', {
      value: () => true,
      configurable: true,
    })
  }
  vi.spyOn(
    wrapper.get('.workflow-canvas__viewport').element,
    'getBoundingClientRect',
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 500,
    width: 800,
    height: 500,
    toJSON: () => ({}),
  })
})
afterEach(() => {
  wrapper.unmount()
  Reflect.deleteProperty(document, 'elementFromPoint')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('connects by dragging from an output to a target input without a click sequence', async () => {
  const output = wrapper.get('[aria-label="任务 A 下一步出口"]').element
  const input = wrapper.get('[aria-label="结束 B 入口"]').element
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => input })
  point(output, 'pointerdown', 264, 190)
  point(output, 'pointermove', 400, 70)
  await frame()
  point(output, 'pointerup', 400, 70)
  await nextTick()
  const updates = wrapper.emitted('update:modelValue') ?? []
  expect(updates).toHaveLength(1)
  expect((updates[0]![0] as Workflow).nodes[0]!.next).toBe('b')
})
it('pans the scene by dragging blank canvas without changing workflow data', async () => {
  const surface = wrapper.get('.workflow-canvas__surface').element
  point(surface, 'pointerdown', 500, 350)
  point(surface, 'pointermove', 560, 390)
  await frame()
  point(surface, 'pointerup', 560, 390)
  await nextTick()
  expect((surface as HTMLElement).style.transform).toContain('translate(60px, 40px)')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
it('keeps pointer-move previews local and commits a node position only once on release', async () => {
  const heading = wrapper.get('[aria-label="选择节点 任务 A"]').element
  point(heading, 'pointerdown', 80, 60)
  for (let i = 1; i <= 30; i++) point(heading, 'pointermove', 80 + i * 2, 60 + i)
  await frame()
  expect(wrapper.emitted('update:modelValue') ?? []).toHaveLength(0)
  point(heading, 'pointerup', 140, 90)
  await nextTick()
  const updates = wrapper.emitted('update:modelValue') ?? []
  expect(updates).toHaveLength(1)
  expect((updates[0]![0] as Workflow).nodes[0]).toMatchObject({ x: 100, y: 70 })
})

it('rejects self-links and restores an existing edge when its endpoint is dropped on empty space', async () => {
  const original = graph()
  original.nodes[0]!.next = 'b'
  await wrapper.setProps({ modelValue: original })
  const output = wrapper.get('[aria-label="任务 A 下一步出口"]').element
  const self = wrapper.get('[data-node-id="a"]').element
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => self })
  point(output, 'pointerdown', 264, 190)
  point(output, 'pointermove', 60, 60)
  await frame()
  point(output, 'pointerup', 60, 60)
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('[role="alert"]').text()).toContain('自身')
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
  const endpoint = wrapper.get('[aria-label="重新连接 任务 A 下一步"]').element
  point(endpoint, 'pointerdown', 382, 70)
  point(endpoint, 'pointermove', 600, 400)
  await frame()
  point(endpoint, 'pointerup', 600, 400)
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(original.nodes[0]!.next).toBe('b')
  expect(wrapper.find('.workflow-canvas__connection-preview').exists()).toBe(false)
})

it('Escape and pointer cancellation discard uncommitted node movement', async () => {
  const heading = wrapper.get('[aria-label="选择节点 任务 A"]').element
  point(heading, 'pointerdown', 80, 60)
  point(heading, 'pointermove', 180, 160)
  await frame()
  await wrapper.get('.workflow-canvas__viewport').trigger('keydown', { key: 'Escape' })
  point(heading, 'pointerup', 180, 160)
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect((wrapper.get('[data-node-id="a"]').element as HTMLElement).style.transform).toBe(
    'translate(40px, 40px)',
  )
  point(heading, 'pointerdown', 80, 60)
  point(heading, 'pointermove', 180, 160)
  await frame()
  point(heading, 'pointercancel', 180, 160)
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

it('zooms around the cursor and keeps normal wheel movement as view-only panning', async () => {
  const viewport = wrapper.get('.workflow-canvas__viewport')
  viewport.element.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -20,
      clientX: 100,
      clientY: 120,
    }),
  )
  await nextTick()
  const style = (wrapper.get('.workflow-canvas__surface').element as HTMLElement).style.transform
  const values = style.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!
  const x = Number(values[1]),
    y = Number(values[2]),
    zoom = Number(values[3])
  expect(zoom).toBeGreaterThan(1)
  expect((100 - x) / zoom).toBeCloseTo(100)
  expect((120 - y) / zoom).toBeCloseTo(120)
  viewport.element.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40, deltaX: 20 }),
  )
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(
    (wrapper.get('.workflow-canvas__surface').element as HTMLElement).style.transform,
  ).not.toBe(style)
})

it('read-only execution canvases allow panning but never move nodes or expose connection handles', async () => {
  await wrapper.setProps({ readonly: true })
  const heading = wrapper.get('[aria-label="选择节点 任务 A"]').element
  point(heading, 'pointerdown', 80, 60)
  point(heading, 'pointermove', 180, 160)
  await frame()
  point(heading, 'pointerup', 180, 160)
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.find('.workflow-canvas__port').exists()).toBe(false)
  const surface = wrapper.get('.workflow-canvas__surface').element
  point(surface, 'pointerdown', 500, 350)
  point(surface, 'pointermove', 530, 360)
  await frame()
  point(surface, 'pointerup', 530, 360)
  await nextTick()
  expect((surface as HTMLElement).style.transform).toContain('translate(30px, 10px)')
})

it('disposes a queued animation and window listeners when leaving the canvas', async () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const heading = wrapper.get('[aria-label="选择节点 任务 A"]').element
  point(heading, 'pointerdown', 80, 60)
  point(heading, 'pointermove', 180, 160)
  wrapper.unmount()
  await frame()
  expect(cancelAnimationFrame).toHaveBeenCalled()
  expect(remove).toHaveBeenCalledWith('blur', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('keyup', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

it('gives converging edges separate draggable endpoints', async () => {
  const model = graph()
  model.nodes[0]!.next = 'b'
  model.nodes.push({ ...model.nodes[0]!, id: 'c', name: '任务 C', y: 300 })
  await wrapper.setProps({ modelValue: model })
  const handles = wrapper.findAll('.workflow-canvas__reconnect')
  expect(handles).toHaveLength(2)
  expect([handles[0]!.attributes('cx'), handles[0]!.attributes('cy')]).not.toEqual([
    handles[1]!.attributes('cx'),
    handles[1]!.attributes('cy'),
  ])
})

it('retains keyboard port activation for connecting without dragging', async () => {
  wrapper
    .get('[aria-label="任务 A 下一步出口"]')
    .element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
  await nextTick()
  wrapper
    .get('[aria-label="结束 B 入口"]')
    .element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
  await nextTick()
  const updates = wrapper.emitted('update:modelValue') ?? []
  expect(updates).toHaveLength(1)
  expect((updates[0]![0] as Workflow).nodes[0]!.next).toBe('b')
})

it('disconnects directly on an edge without moving the canvas or removing nodes', async () => {
  const original = graph()
  original.nodes[0]!.next = 'b'
  await wrapper.setProps({ modelValue: original })
  const edge = wrapper.get('.workflow-canvas__edge-hit')
  point(edge.element, 'pointerdown', 320, 130)
  point(edge.element, 'pointerup', 320, 130)
  edge.element.dispatchEvent(
    new MouseEvent('click', { bubbles: true, detail: 1, clientX: 320, clientY: 130 }),
  )
  await nextTick()
  const action = wrapper.get('[aria-label="断开连线 任务 A 下一步 到 结束 B"]')
  expect(action.attributes('style')).toContain('left: 320px')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.get('.workflow-canvas__surface').attributes('style')).toContain(
    'translate(0px, 0px)',
  )
  await action.trigger('click')
  const updated = wrapper.emitted('update:modelValue')![0]![0] as Workflow
  expect(updated.nodes).toHaveLength(2)
  expect(updated.nodes[0]!.next).toBeNull()
  expect(original.nodes[0]!.next).toBe('b')
  expect(wrapper.find('.workflow-canvas__disconnect').exists()).toBe(false)
})

it('keyboard deletion of a branch edge preserves its condition and other exit', async () => {
  const model = graph()
  model.nodes.push({ ...model.nodes[1]!, id: 'c', name: '结束 C', y: 300 })
  model.nodes[0] = {
    ...model.nodes[0]!,
    kind: 'BRANCH',
    condition: {
      sourceNodeId: 'upstream',
      operator: 'EQUALS',
      value: 'yes',
      pointer: '',
      whenTrue: 'b',
      whenFalse: 'c',
    },
  }
  await wrapper.setProps({ modelValue: model })
  const edge = wrapper.get('[aria-label="选择连线 任务 A 不满足 到 结束 C"]')
  await edge.trigger('keydown', { key: 'Enter' })
  await edge.trigger('keydown', { key: 'Delete' })
  const updated = wrapper.emitted('update:modelValue')![0]![0] as Workflow
  expect(updated.nodes[0]!.condition).toEqual({ ...model.nodes[0]!.condition, whenFalse: null })
  expect(updated.nodes.slice(1)).toEqual(model.nodes.slice(1))
})

it('clears edge selection on Escape, blank gestures, replacement and read-only mode', async () => {
  const model = graph()
  model.nodes[0]!.next = 'b'
  await wrapper.setProps({ modelValue: model })
  const selectEdge = async () =>
    wrapper.get('.workflow-canvas__edge-hit').trigger('keydown', { key: 'Enter' })
  await selectEdge()
  await wrapper.get('.workflow-canvas__viewport').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('.workflow-canvas__disconnect').exists()).toBe(false)
  await selectEdge()
  const surface = wrapper.get('.workflow-canvas__surface').element
  point(surface, 'pointerdown', 700, 400)
  point(surface, 'pointerup', 700, 400)
  await nextTick()
  expect(wrapper.find('.workflow-canvas__disconnect').exists()).toBe(false)
  await selectEdge()
  const replacement = graph()
  replacement.nodes.push({ ...replacement.nodes[1]!, id: 'c' })
  replacement.nodes[0]!.next = 'c'
  await wrapper.setProps({ modelValue: replacement })
  expect(wrapper.find('.workflow-canvas__disconnect').exists()).toBe(false)
  await selectEdge()
  await wrapper.setProps({ readonly: true })
  expect(wrapper.find('.workflow-canvas__edge-hit').exists()).toBe(false)
  expect(wrapper.find('.workflow-canvas__disconnect').exists()).toBe(false)
  await wrapper.get('.workflow-canvas__viewport').trigger('keydown', { key: 'Backspace' })
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
