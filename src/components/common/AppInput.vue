<template>
  <div class="relative w-full">
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
import { useAttrs } from 'vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ type?: string; clearable?: boolean; label?: string }>(), {
  type: 'text',
})
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ clear: [] }>()
const attrs = useAttrs()
const label = props.label || String(attrs.placeholder || '') || undefined
function clear() {
  model.value = ''
  emit('clear')
}
</script>
