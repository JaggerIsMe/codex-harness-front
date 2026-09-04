<template>
  <Dialog :open="modelValue" @update:open="onOpen">
    <DialogContent
      class="max-h-[90vh] overflow-y-auto"
      :style="{ maxWidth: `min(${width || '560px'}, calc(100vw - 2rem))` }"
    >
      <DialogHeader
        ><DialogTitle>{{ title }}</DialogTitle
        ><DialogDescription class="sr-only">{{ title }}表单</DialogDescription></DialogHeader
      >
      <slot /><DialogFooter class="gap-2"><slot name="footer" /></DialogFooter>
    </DialogContent>
  </Dialog>
</template>
<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
defineProps<{ modelValue: boolean; title: string; width?: string }>()
const emit = defineEmits<{ close: []; 'update:modelValue': [value: boolean] }>()
function onOpen(open: boolean) {
  emit('update:modelValue', open)
  if (!open) emit('close')
}
</script>
