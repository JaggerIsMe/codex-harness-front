<template>
  <Teleport to="body" :disabled="!fullscreen">
    <FocusScope
      as-child
      :trapped="fullscreen"
      :loop="fullscreen"
      @mount-auto-focus.prevent
      @unmount-auto-focus.prevent
    >
      <section
        class="workflow-workspace"
        :class="{ 'workflow-workspace--fullscreen': fullscreen }"
        aria-label="工作流编辑区"
        @keydown.esc="exitFullscreen"
      >
        <div class="workflow-workspace__toolbar">
          <fieldset :disabled="disabled" class="flex min-w-0 flex-wrap items-center gap-2">
            <slot name="actions" :fullscreen="fullscreen" />
          </fieldset>
          <AppButton
            data-fullscreen-toggle
            :icon="fullscreen ? Minimize2 : Maximize2"
            :title="fullscreen ? '退出全屏（Esc）' : '全屏编辑画布'"
            @click="toggleFullscreen"
          >
            {{ fullscreen ? '退出全屏' : '全屏编辑' }}
          </AppButton>
        </div>
        <div v-if="fullscreen" class="workflow-workspace__status" aria-live="polite">
          <slot name="status" />
        </div>
        <fieldset :disabled="disabled" class="workflow-workspace__canvas">
          <WorkflowCanvas
            :model-value="modelValue"
            :selected-id="selectedId"
            :readonly="disabled"
            @update:model-value="emit('update:modelValue', $event)"
            @select="emit('select', $event)"
          >
            <template v-if="$slots.inspector" #inspector><slot name="inspector" /></template>
          </WorkflowCanvas>
        </fieldset>
      </section>
    </FocusScope>
  </Teleport>
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useScrollLock } from '@vueuse/core'
import { FocusScope } from 'reka-ui'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import type { Workflow } from '@/types/orchestration'
import AppButton from '@/components/common/AppButton.vue'
import WorkflowCanvas from '@/components/orchestration/WorkflowCanvas.vue'
import '@/assets/styles/workflow.workspace.scss'

defineProps<{ modelValue: Workflow; selectedId: string; disabled: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: Workflow]
  select: [id: string]
  'fullscreen-change': [value: boolean]
}>()
const fullscreen = ref(false)
const scrollLocked = useScrollLock(document.body)
watch(fullscreen, (value) => emit('fullscreen-change', value))

async function toggleFullscreen(event: MouseEvent) {
  const trigger = event.currentTarget as HTMLElement
  fullscreen.value = !fullscreen.value
  scrollLocked.value = fullscreen.value
  await nextTick()
  trigger.focus({ preventScroll: true })
}
async function exitFullscreen(event: KeyboardEvent) {
  // Canvas gestures and nested dialogs consume Escape before the workspace does.
  if (event.defaultPrevented || !fullscreen.value) return
  event.preventDefault()
  const trigger = (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(
    '[data-fullscreen-toggle]',
  )
  fullscreen.value = false
  scrollLocked.value = false
  await nextTick()
  trigger?.focus({ preventScroll: true })
}
</script>
