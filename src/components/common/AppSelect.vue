<template>
  <select
    v-model="model"
    class="flex min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
    :multiple="multiple"
    :disabled="disabled || loading"
    :aria-label="placeholder"
    @change="onChange"
  >
    <option v-if="!multiple" :value="emptyValue" :disabled="!clearable">
      {{ loading ? '加载中…' : placeholder || '请选择' }}
    </option>
    <slot />
  </select>
</template>
<script setup lang="ts" generic="T extends string | number | null | (string | number)[]">
import { nextTick } from 'vue'
const model = defineModel<T>({ required: true })
const props = defineProps<{
  multiple?: boolean
  disabled?: boolean
  loading?: boolean
  placeholder?: string
  clearable?: boolean
}>()
const emit = defineEmits<{ change: [value: T] }>()
const emptyValue = props.clearable ? '' : null
async function onChange() {
  // The parent must apply update:modelValue before dependent fields read the selection.
  await nextTick()
  emit('change', model.value)
}
</script>
