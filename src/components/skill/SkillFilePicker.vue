<template>
  <div class="inline-flex items-center">
    <input
      ref="input"
      type="file"
      class="hidden"
      :multiple="multiple"
      accept=".zip,application/zip"
      :disabled="disabled"
      :aria-label="inputLabel"
      @change="select"
    />
    <AppButton :disabled="disabled" :label="inputLabel" @click="input?.click()">{{
      label
    }}</AppButton>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
defineProps<{ label: string; inputLabel: string; multiple?: boolean; disabled?: boolean }>()
const emit = defineEmits<{ selected: [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)
function select(event: Event) {
  const element = event.target as HTMLInputElement
  const files = Array.from(element.files || [])
  element.value = ''
  if (files.length) emit('selected', files)
}
</script>
