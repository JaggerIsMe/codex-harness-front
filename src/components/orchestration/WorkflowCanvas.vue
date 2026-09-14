<template>
  <div
    class="workflow-canvas"
    :class="{
      'workflow-canvas--panning': gestureKind === 'pan',
      'workflow-canvas--dragging': gestureKind === 'node',
      'workflow-canvas--connecting': connecting,
      'workflow-canvas--space': spaceHeld,
    }"
  >
    <div class="workflow-canvas__toolbar">
      <span class="text-sm">{{
        connecting
          ? '拖到目标入口，或点击目标节点 · Esc 取消'
          : readonly
            ? '执行流程'
            : '点击连线可断开 · 拖动终点改接 · 空白拖动平移 · Ctrl/⌘ + 滚轮缩放'
      }}</span>
      <div class="flex gap-2">
        <AppButton size="small" aria-label="适应画布" @click="fit">适应</AppButton>
        <AppButton size="small" aria-label="缩小画布" @click="zoomAt(zoom - 0.1)">−</AppButton>
        <AppButton size="small" aria-label="重置缩放" @click="zoomAt(1)"
          >{{ Math.round(zoom * 100) }}%</AppButton
        >
        <AppButton size="small" aria-label="放大画布" @click="zoomAt(zoom + 0.1)">+</AppButton>
        <AppButton v-if="connecting" size="small" @click="cancel">取消连线</AppButton>
      </div>
    </div>
    <p v-if="error" role="alert" class="px-3 text-sm text-destructive">{{ error }}</p>
    <div class="workflow-canvas__stage">
      <div
        ref="viewport"
        class="workflow-canvas__viewport"
        tabindex="0"
        aria-label="工作流画布"
        :style="{
          backgroundPosition: `${view.x}px ${view.y}px`,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        }"
        @pointerdown="beginPan"
        @pointerdown.capture="clearEdgeSelection"
        @pointermove="move"
        @pointerup="finish"
        @pointercancel="cancel"
        @lostpointercapture="lostCapture"
        @keydown="canvasKeydown"
        @focusin="reveal"
        @wheel="wheel"
      >
        <div :style="{ width: `${width * zoom}px`, height: `${height * zoom}px` }">
          <div
            class="workflow-canvas__surface"
            :style="{ width: `${width}px`, height: `${height}px`, transform }"
          >
            <svg
              class="workflow-canvas__edges"
              :width="width"
              :height="height"
              aria-label="工作流连线"
            >
              <defs>
                <marker
                  :id="markerId"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                </marker>
              </defs>
              <g
                v-for="edge in edges"
                :key="edge.key"
                class="workflow-canvas__edge"
                :class="{ 'workflow-canvas__edge--selected': activeEdge?.key === edge.key }"
              >
                <path
                  class="workflow-canvas__edge-line"
                  :d="edge.path"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  :marker-end="`url(#${markerId})`"
                />
                <path
                  v-if="!readonly"
                  class="workflow-canvas__edge-hit"
                  :d="edge.path"
                  tabindex="0"
                  role="button"
                  :aria-label="`选择连线 ${edge.name} ${edge.label || '下一步'} 到 ${edge.targetName}`"
                  :aria-pressed="activeEdge?.key === edge.key"
                  @pointerdown.stop="edgePointerdown($event)"
                  @click.stop="chooseEdge(edge, $event)"
                  @keydown.enter.prevent.stop="chooseEdge(edge)"
                  @keydown.space.prevent.stop="chooseEdge(edge)"
                />
                <text :x="edge.labelX" :y="edge.labelY" class="workflow-canvas__edge-label">
                  {{ edge.label }}
                </text>
                <circle
                  v-if="!readonly"
                  class="workflow-canvas__reconnect"
                  :cx="edge.handleX"
                  :cy="edge.handleY"
                  r="7"
                  tabindex="0"
                  role="button"
                  :aria-label="`重新连接 ${edge.name} ${edge.label || '下一步'}`"
                  @pointerdown.stop="beginLink($event, edge.from, edge.port)"
                  @keydown.enter.prevent="arm(edge.from, edge.port)"
                  @keydown.space.prevent="arm(edge.from, edge.port)"
                />
              </g>
              <path
                v-if="previewPath"
                class="workflow-canvas__connection-preview"
                :d="previewPath"
                fill="none"
                :marker-end="`url(#${markerId})`"
              />
            </svg>
            <p v-if="!modelValue.nodes.length" class="workflow-canvas__empty">
              从“添加 Expert 节点”开始构建你的工作流
            </p>
            <article
              v-for="(node, index) in visualNodes"
              :key="node.id"
              v-memo="[
                node,
                selectedId === node.id,
                modelValue.startNodeId === node.id,
                statuses[index],
                readonly,
                connecting?.hoverId === node.id,
                connecting?.valid,
              ]"
              class="workflow-canvas__node"
              :class="{
                'workflow-canvas__node--selected': selectedId === node.id,
                'workflow-canvas__node--branch': node.kind === 'BRANCH',
                'workflow-canvas__node--start': node.kind === 'START',
                'workflow-canvas__node--skipped': statuses[index] === 'SKIPPED',
                'workflow-canvas__node--target':
                  connecting?.hoverId === node.id && connecting.valid,
                'workflow-canvas__node--invalid':
                  connecting?.hoverId === node.id && !connecting.valid,
              }"
              :style="{ transform: `translate(${node.x}px, ${node.y}px)` }"
              :data-node-id="node.id"
              @pointerdown.stop="beginNode($event, node)"
            >
              <button
                class="workflow-canvas__heading"
                :aria-label="`选择节点 ${node.name}`"
                @click="selectNode(node.id, $event)"
                @keydown.left.prevent="nudge(node, -10, 0)"
                @keydown.right.prevent="nudge(node, 10, 0)"
                @keydown.up.prevent="nudge(node, 0, -10)"
                @keydown.down.prevent="nudge(node, 0, 10)"
              >
                <span class="text-xs text-muted-foreground"
                  >{{
                    node.kind === 'START'
                      ? '流程入口'
                      : node.kind === 'EXPERT'
                        ? 'Expert'
                        : node.kind === 'END'
                          ? '结束'
                          : '条件分支'
                  }}{{
                    modelValue.startNodeId === node.id && node.kind !== 'START' ? ' · 开始' : ''
                  }}</span
                >
                <strong class="block truncate">{{ node.name }}</strong>
              </button>
              <p class="workflow-canvas__description">
                {{
                  node.kind === 'START'
                    ? '从此处进入工作流，连接下一步'
                    : node.kind === 'EXPERT'
                      ? node.objective || '点击节点配置专家及职责'
                      : node.kind === 'END'
                        ? '到达此节点后结束流程'
                        : node.condition?.sourceNodeId
                          ? '根据上游结果选择路径'
                          : '点击配置判断条件'
                }}
              </p>
              <span v-if="statuses[index]" class="px-3 text-xs text-primary">{{
                statusLabels[statuses[index]!]
              }}</span>
              <button
                v-if="!readonly && node.kind !== 'START'"
                class="workflow-canvas__input"
                :aria-label="`${node.name} 入口`"
                @pointerdown.stop
                @click="selectNode(node.id, $event)"
              >
                ●
              </button>
              <template v-if="!readonly">
                <button
                  v-if="node.kind === 'EXPERT' || node.kind === 'START'"
                  class="workflow-canvas__port workflow-canvas__port--next"
                  :aria-label="`${node.name} 下一步出口`"
                  @pointerdown.stop="beginLink($event, node.id, 'next')"
                  @click="activatePort($event, node.id, 'next')"
                >
                  下一步 ●
                </button>
                <template v-else-if="node.kind === 'BRANCH'">
                  <button
                    class="workflow-canvas__port workflow-canvas__port--true"
                    :aria-label="`${node.name} 满足出口`"
                    @pointerdown.stop="beginLink($event, node.id, 'whenTrue')"
                    @click="activatePort($event, node.id, 'whenTrue')"
                  >
                    满足 ●
                  </button>
                  <button
                    class="workflow-canvas__port workflow-canvas__port--false"
                    :aria-label="`${node.name} 不满足出口`"
                    @pointerdown.stop="beginLink($event, node.id, 'whenFalse')"
                    @click="activatePort($event, node.id, 'whenFalse')"
                  >
                    不满足 ●
                  </button>
                </template>
              </template>
            </article>
            <button
              v-if="activeEdge && selectedEdge"
              type="button"
              class="workflow-canvas__disconnect"
              :style="{ left: `${selectedEdge.x}px`, top: `${selectedEdge.y}px` }"
              :aria-label="`断开连线 ${activeEdge.name} ${activeEdge.label || '下一步'} 到 ${activeEdge.targetName}`"
              title="断开连线（Delete / Backspace）"
              @pointerdown.stop
              @click.stop="disconnectEdge"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      </div>
      <div v-if="$slots.inspector" ref="inspector" class="workflow-canvas__inspector">
        <slot name="inspector" />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import AppButton from '@/components/common/AppButton.vue'
import type { Workflow, StepStatus } from '@/types/orchestration'
import { statusLabels } from '@/types/orchestration'
import { disconnect, type WorkflowPort } from '@/utils/workflow'
import { useWorkflowCanvas } from '@/composables/useWorkflowCanvas'
import '@/assets/styles/workflow.canvas.scss'
const props = withDefaults(
  defineProps<{
    modelValue: Workflow
    selectedId?: string
    readonly?: boolean
    statuses?: Record<number, StepStatus>
  }>(),
  { statuses: () => ({}) },
)
const emit = defineEmits<{ 'update:modelValue': [value: Workflow]; select: [id: string] }>()
const viewport = ref<HTMLElement | null>(null)
const inspector = ref<HTMLElement | null>(null)
const coveredArea = ref({ right: 0, bottom: 0 })
useResizeObserver([viewport, inspector], () => {
  const canvasRect = viewport.value?.getBoundingClientRect()
  const panelRect = inspector.value?.getBoundingClientRect()
  coveredArea.value =
    canvasRect && panelRect
      ? canvasRect.width >= 768
        ? { right: panelRect.width + 24, bottom: 0 }
        : { right: 0, bottom: panelRect.height + 24 }
      : { right: 0, bottom: 0 }
})
const {
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
} = useWorkflowCanvas(
  () => props.modelValue,
  () => props.readonly,
  viewport,
  (value) => emit('update:modelValue', value),
  (id) => emit('select', id),
  () => coveredArea.value,
)
const zoom = computed(() => view.value.zoom)
const markerId = `workflow-arrow-${useId()}`
const width = computed(() => Math.max(1100, ...visualNodes.value.map((n) => n.x + 350)))
const height = computed(() => Math.max(550, ...visualNodes.value.map((n) => n.y + 280)))
const nodeMap = computed(() => new Map(visualNodes.value.map((n) => [n.id, n])))
function curve(x: number, y: number, tx: number, ty: number) {
  const bend = Math.max(50, Math.abs(tx - x) / 2)
  return `M ${x} ${y} C ${x + bend} ${y}, ${tx - bend} ${ty}, ${tx} ${ty}`
}
function portY(port: WorkflowPort) {
  return port === 'next' ? 150 : port === 'whenTrue' ? 125 : 165
}
const edges = computed(() => {
  const slots = new Map<string, number>()
  return visualNodes.value.flatMap((n) => {
    const ports: { key: WorkflowPort; target?: string | null; label: string }[] =
      n.kind === 'EXPERT' || n.kind === 'START'
        ? [{ key: 'next', target: n.next, label: '' }]
        : n.kind === 'BRANCH'
          ? [
              { key: 'whenTrue', target: n.condition?.whenTrue, label: '满足' },
              { key: 'whenFalse', target: n.condition?.whenFalse, label: '不满足' },
            ]
          : []
    return ports.flatMap((port) => {
      const target = port.target ? nodeMap.value.get(port.target) : undefined
      if (!target) return []
      const x = n.x + 224,
        y = n.y + portY(port.key),
        tx = target.x,
        ty = target.y + 30
      const slot = slots.get(target.id) ?? 0
      slots.set(target.id, slot + 1)
      const handleX = tx - 22 - Math.floor(slot / 7) * 22,
        handleY = ty + (slot % 7) * 22
      return [
        {
          key: `${n.id}-${port.key}`,
          from: n.id,
          target: target.id,
          targetName: target.name,
          name: n.name,
          port: port.key,
          label: port.label,
          labelX: x + 12,
          labelY: y - 8,
          handleX,
          handleY,
          midpointX: (x + handleX) / 2,
          midpointY: (y + handleY) / 2,
          path: curve(x, y, handleX, handleY) + ` L ${tx} ${ty}`,
        },
      ]
    })
  })
})
type CanvasEdge = (typeof edges.value)[number]
const selectedEdge = ref<{ key: string; target: string; x: number; y: number } | null>(null)
const activeEdge = computed(() =>
  props.readonly
    ? undefined
    : edges.value.find(
        (edge) => edge.key === selectedEdge.value?.key && edge.target === selectedEdge.value.target,
      ),
)
function chooseEdge(edge: CanvasEdge, event?: MouseEvent) {
  if (props.readonly || gestureKind.value || spaceHeld.value) return
  cancel()
  const rect = viewport.value?.getBoundingClientRect()
  selectedEdge.value = {
    key: edge.key,
    target: edge.target,
    x:
      event?.detail && rect
        ? (event.clientX - rect.left - view.value.x) / zoom.value
        : edge.midpointX,
    y:
      event?.detail && rect
        ? (event.clientY - rect.top - view.value.y) / zoom.value
        : edge.midpointY,
  }
}
function edgePointerdown(event: PointerEvent) {
  if (event.button === 1 || spaceHeld.value) {
    selectedEdge.value = null
    beginPan(event)
  }
}
function clearEdgeSelection(event: PointerEvent) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('.workflow-canvas__edge-hit, .workflow-canvas__disconnect')
  )
    selectedEdge.value = null
}
function disconnectEdge() {
  const edge = activeEdge.value
  if (!edge || gestureKind.value || connecting.value) return
  emit('update:modelValue', disconnect(props.modelValue, edge.from, edge.port, edge.target))
  selectedEdge.value = null
  viewport.value?.focus({ preventScroll: true })
}
function canvasKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (selectedEdge.value || connecting.value || gestureKind.value || spaceHeld.value) {
      event.preventDefault()
      selectedEdge.value = null
      cancel()
    }
    return
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    activeEdge.value &&
    event.target instanceof Element &&
    !event.target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    event.preventDefault()
    event.stopPropagation()
    disconnectEdge()
    return
  }
  keydown(event)
}
watch([activeEdge, connecting, gestureKind], () => {
  if (!activeEdge.value || connecting.value || gestureKind.value) selectedEdge.value = null
})
const previewPath = computed(() => {
  const link = connecting.value
  if (!link) return ''
  const source = nodeMap.value.get(link.from)
  if (!source) return ''
  const target = link.valid && link.hoverId ? nodeMap.value.get(link.hoverId) : undefined
  return curve(
    source.x + 224,
    source.y + portY(link.port),
    target?.x ?? link.point.x,
    target ? target.y + 30 : link.point.y,
  )
})
</script>
