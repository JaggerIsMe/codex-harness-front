<template>
  <div ref="container" class="workspace-workbench" :data-mode="mode">
    <nav
      v-if="!maximized && (mode === 'single' || (mode === 'dual' && filesOpen))"
      class="workspace-tabs"
      :style="mode === 'dual' ? { paddingLeft: `${(sizes[0] || 0) + 14}px` } : undefined"
      aria-label="工作区视图"
    >
      <button
        v-if="mode === 'single'"
        type="button"
        :aria-pressed="visible.includes('chat')"
        @click="active = 'chat'"
      >
        会话
      </button>
      <button
        v-if="previewOpen"
        type="button"
        :aria-pressed="visible.includes('preview')"
        @click="active = 'preview'"
      >
        预览
      </button>
      <button
        v-if="filesOpen"
        type="button"
        :aria-pressed="visible.includes('files')"
        @click="active = 'files'"
      >
        文件
      </button>
    </nav>
    <div class="workspace-workbench__panes">
      <template v-for="(pane, index) in panes" :key="pane">
        <div
          v-show="visible.includes(pane)"
          class="workspace-workbench__pane"
          :data-pane="pane"
          :style="paneStyle(pane)"
        >
          <slot
            :name="pane"
            :active="visible.includes(pane)"
            :maximized="maximized"
            :maximize="toggleMaximized"
          />
        </div>
        <div
          v-if="separatorAfter(pane)"
          class="workspace-separator"
          title="拖动调整宽度，双击恢复默认；方向键微调"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          :aria-label="pane === 'chat' ? '调整会话宽度' : '调整预览与目录宽度'"
          :aria-valuenow="Math.round(sizes[index] || 0)"
          :aria-valuemin="pane === 'chat' ? 420 : 400"
          :aria-valuemax="
            Math.round(
              (sizes[index] || 0) +
                (sizes[index + 1] || 0) -
                (mode === 'chat-files' || pane === 'preview' ? 220 : 400),
            )
          "
          @pointerdown="drag($event, index)"
          @keydown="resizeKey($event, index)"
          @dblclick="reset"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useWorkspaceLayout } from '@/composables/useWorkspaceLayout'
const props = defineProps<{ previewOpen: boolean; filesOpen: boolean }>()
const container = ref<HTMLElement | null>(null)
const panes = ['chat', 'preview', 'files'] as const
const { mode, sizes, visible, maximized, active, drag, resizeKey, reset } = useWorkspaceLayout(
  container,
  toRef(props, 'previewOpen'),
  toRef(props, 'filesOpen'),
)
function paneStyle(pane: string) {
  return {
    width:
      visible.value.length === 1 ? '100%' : `${sizes.value[visible.value.indexOf(pane)] || 0}px`,
  }
}
function separatorAfter(pane: string) {
  return visible.value.includes(pane) && visible.value.at(-1) !== pane
}
function toggleMaximized() {
  maximized.value = !maximized.value
}
function revealPreview() {
  active.value = 'preview'
}
defineExpose({ revealPreview })
</script>

<style src="../../assets/styles/workspace.workbench.scss"></style>
