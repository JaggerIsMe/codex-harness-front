<template>
  <div ref="container" class="relative w-full" @focusin="rememberTextFocus">
    <Textarea v-if="type === 'textarea'" v-model="model" v-bind="$attrs" :aria-label="label" />
    <Input
      v-else
      v-model="model"
      v-bind="$attrs"
      :type="type"
      :aria-label="label"
      :class="clearable ? 'pr-9' : ''"
    />
    <button
      v-if="clearable && model"
      type="button"
      class="absolute right-3 top-2 text-muted-foreground"
      aria-label="清空输入"
      @click="clear"
    >
      ×
    </button>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref, useAttrs } from 'vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ type?: string; clearable?: boolean; label?: string }>(), {
  type: 'text',
})
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ clear: [] }>()
const attrs = useAttrs()
const container = ref<HTMLElement | null>(null)
let hasTextFocus = false
function rememberTextFocus(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    hasTextFocus = true
}
function insertAtCursor(text: string): boolean {
  const field = container.value?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input,textarea',
  )
  if (!field || field.disabled || field.readOnly || field.selectionStart === null) return false
  const start = hasTextFocus ? field.selectionStart : model.value.length
  const end = hasTextFocus ? (field.selectionEnd ?? start) : start
  const updated = model.value.slice(0, start) + text + model.value.slice(end)
  if (field.maxLength >= 0 && updated.length > field.maxLength) return false
  const scrollTop = field.scrollTop
  const scrollLeft = field.scrollLeft
  model.value = updated
  void nextTick(() => {
    if (!field.isConnected) return
    field.focus({ preventScroll: true })
    field.setSelectionRange(start + text.length, start + text.length)
    field.scrollTop = scrollTop
    field.scrollLeft = scrollLeft
  })
  return true
}
defineExpose({ insertAtCursor })
const label = props.label || String(attrs.placeholder || '') || undefined
function clear() {
  model.value = ''
  emit('clear')
}
</script>
