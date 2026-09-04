<template>
  <label class="block space-y-2"
    ><span class="block text-sm font-medium">{{ label }}</span
    ><slot /><span v-if="prop && errors?.[prop]" class="block text-xs text-destructive">{{
      errors[prop]
    }}</span></label
  >
</template>
<script setup lang="ts">
import { inject } from 'vue'
import { formContext } from './form'
defineProps<{ label: string; prop?: string }>()
const errors = inject(formContext)
</script>
