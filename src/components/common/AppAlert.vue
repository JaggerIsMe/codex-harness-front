<template>
  <div role="status" class="my-3 rounded-lg border bg-muted/40 p-4 text-sm">
    <slot name="title">{{ title }}</slot
    ><slot />
  </div>
</template>
<script setup lang="ts">
defineProps<{ title?: string }>()
</script>
