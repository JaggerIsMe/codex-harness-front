<template>
  <nav
    v-if="entries.length"
    ref="outline"
    class="conversation-outline"
    aria-label="会话消息导航"
    @mouseleave="handleMouseLeave"
    @pointermove="handlePointerMove"
    @pointerleave="resetProximity"
    @pointerdown="keyboardPreview = false"
    @focusout="handleFocusOut"
    @keydown.esc.stop="closePreview"
  >
    <button
      v-if="hasMore"
      type="button"
      class="conversation-outline__more"
      aria-label="在导航中加载更早消息"
      title="加载更早消息"
      :disabled="loadingOlder"
      @click="emit('loadOlder')"
    >
      <span aria-hidden="true">{{ loadingOlder ? '·' : '···' }}</span>
    </button>
    <div ref="track" class="conversation-outline__track" @scroll.passive="handleTrackScroll">
      <button
        v-for="(entry, index) in entries"
        :key="entry.id"
        type="button"
        class="conversation-outline__item"
        :class="{
          'conversation-outline__item--active': activeEntryId === entry.id,
          'conversation-outline__item--streaming': entry.streaming,
        }"
        :data-outline-id="entry.id"
        :aria-label="`跳转到第 ${index + 1} 轮：${(entry.prompt || entry.reply).slice(0, 60)}`"
        :aria-current="activeEntryId === entry.id ? 'location' : undefined"
        :aria-describedby="previewId === entry.id ? tooltipId : undefined"
        :tabindex="entry.id === tabStopId ? 0 : -1"
        @mouseenter="showPreview(entry.id, $event)"
        @focus="showPreview(entry.id, $event)"
        @keydown="handleKeydown($event, index)"
        @click="emit('navigate', entry.anchorId)"
      >
        <span class="conversation-outline__line" aria-hidden="true"></span>
      </button>
    </div>
    <span v-if="previewEntry" class="conversation-outline__bridge" aria-hidden="true"></span>
    <div
      v-if="previewEntry"
      :id="tooltipId"
      ref="preview"
      role="tooltip"
      class="conversation-outline__preview"
      :style="{ top: `${previewTop}px` }"
    >
      <div class="conversation-outline__heading">
        <span>第 {{ previewIndex + 1 }} 轮</span>
        <span>{{ previewIndex + 1 }} / {{ entries.length }}</span>
      </div>
      <div v-if="previewEntry.prompt" class="conversation-outline__excerpt">
        <span>用户</span>
        <p>{{ previewEntry.prompt }}</p>
      </div>
      <div v-if="previewEntry.reply" class="conversation-outline__excerpt">
        <span>助手</span>
        <p>{{ previewEntry.reply }}</p>
      </div>
      <span v-if="previewEntry.streaming" class="conversation-outline__state">正在回复…</span>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useResizeObserver } from '@vueuse/core'
import type { DisplayMessage } from '@/types/domain'
import { buildConversationOutline } from '@/utils/conversationOutline'
import { useOutlineProximity } from '@/composables/useOutlineProximity'

const props = defineProps<{
  messages: DisplayMessage[]
  activeId: string | null
  hasMore?: boolean
  loadingOlder?: boolean
}>()
const emit = defineEmits<{ navigate: [id: string]; loadOlder: [] }>()
const outline = ref<HTMLElement | null>(null)
const track = ref<HTMLElement | null>(null)
const preview = ref<HTMLElement | null>(null)
const previewId = ref<string | null>(null)
const keyboardPreview = ref(false)
const previewTop = ref(0)
const tooltipId = `conversation-outline-${useId()}`

const entries = computed(() => buildConversationOutline(props.messages))
const activeEntryId = computed(
  () =>
    entries.value.find((entry) => props.activeId && entry.messageIds.includes(props.activeId))
      ?.id ?? null,
)
const markerIds = computed<string[]>((previous) => {
  const ids = entries.value.map((entry) => entry.id)
  return previous?.length === ids.length && ids.every((id, index) => id === previous[index])
    ? previous
    : ids
})
const {
  handlePointerMove: scaleNearPointer,
  reset: resetProximity,
  refresh: refreshProximity,
} = useOutlineProximity(track, markerIds)
const tabStopId = computed(() => activeEntryId.value || entries.value[0]?.id)
const previewIndex = computed(() =>
  entries.value.findIndex((entry) => entry.id === previewId.value),
)
const previewEntry = computed(() => entries.value[previewIndex.value])

function closePreview() {
  previewId.value = null
}

function keepPreviewInView() {
  const host = outline.value
  const card = preview.value
  const button = Array.from(track.value?.children || []).find(
    (element) => (element as HTMLElement).dataset.outlineId === previewId.value,
  )
  if (!host || !card || !button) return
  const offset = button.getBoundingClientRect().top - host.getBoundingClientRect().top - 12
  previewTop.value = Math.max(0, Math.min(offset, host.clientHeight - card.offsetHeight))
}

async function showPreview(id: string, event: Event) {
  if (!(event.currentTarget instanceof HTMLElement)) return
  // Scrolling the rail beneath a stationary pointer also fires mouseenter.
  if (event.type === 'mouseenter' && keyboardPreview.value) return
  if (event.type === 'focus')
    keyboardPreview.value ||= event.currentTarget.matches(':focus-visible')
  previewId.value = id
  await nextTick()
  keepPreviewInView()
}

function handleMouseLeave() {
  resetProximity()
  if (!keyboardPreview.value || !outline.value?.contains(document.activeElement)) closePreview()
}

function handlePointerMove(event: PointerEvent) {
  if (
    event.target instanceof Element &&
    event.target.closest('.conversation-outline__preview, .conversation-outline__bridge')
  )
    resetProximity()
  else scaleNearPointer(event)
  if (!keyboardPreview.value) return
  keyboardPreview.value = false
  const button =
    event.target instanceof Element ? event.target.closest<HTMLElement>('[data-outline-id]') : null
  if (button?.dataset.outlineId) void showPreview(button.dataset.outlineId, event)
}

function handleFocusOut(event: FocusEvent) {
  if (!(event.relatedTarget instanceof Node) || !outline.value?.contains(event.relatedTarget))
    closePreview()
}

function handleTrackScroll() {
  const focused = document.activeElement
  const container = track.value
  if (
    container &&
    focused instanceof HTMLElement &&
    focused.dataset.outlineId === previewId.value
  ) {
    const buttonBounds = focused.getBoundingClientRect()
    const trackBounds = container.getBoundingClientRect()
    // Scroll offsets are rounded even when the available track height is fractional.
    if (buttonBounds.top >= trackBounds.top - 1 && buttonBounds.bottom <= trackBounds.bottom + 1) {
      keepPreviewInView()
      return
    }
  }
  closePreview()
}

function revealButton(button: HTMLElement) {
  const container = track.value
  if (!container) return
  const top = button.offsetTop - container.offsetTop
  if (top < container.scrollTop) container.scrollTop = top
  else if (top + button.offsetHeight > container.scrollTop + container.clientHeight)
    container.scrollTop = top + button.offsetHeight - container.clientHeight
}

function handleKeydown(event: KeyboardEvent, index: number) {
  const last = entries.value.length - 1
  const destinations: Record<string, number> = {
    ArrowUp: Math.max(0, index - 1),
    ArrowDown: Math.min(last, index + 1),
    Home: 0,
    End: last,
  }
  const next = destinations[event.key]
  if (next === undefined) return
  event.preventDefault()
  resetProximity()
  keyboardPreview.value = true
  const button = track.value?.children[next]
  if (button instanceof HTMLElement) {
    revealButton(button)
    button.focus({ preventScroll: true })
  }
}

watch(
  activeEntryId,
  async (id) => {
    await nextTick()
    // Browsing the rail must not be interrupted by a live reply or scroll updates.
    if (outline.value?.matches(':hover') || outline.value?.contains(document.activeElement)) return
    const button = Array.from(track.value?.children || []).find(
      (element) => (element as HTMLElement).dataset.outlineId === id,
    )
    if (button instanceof HTMLElement) revealButton(button)
  },
  { immediate: true, flush: 'post' },
)
useResizeObserver([outline, preview], () => {
  keepPreviewInView()
  refreshProximity()
})
</script>

<style src="../../assets/styles/conversation.outline.scss"></style>
