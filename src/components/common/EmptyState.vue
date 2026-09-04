<template>
  <div
    class="flex flex-col items-center justify-center gap-4 p-10 text-sm text-muted-foreground"
    role="status"
  >
    <p>{{ description || title }}</p>
    <p v-if="subTitle">{{ subTitle }}</p>
    <slot />
  </div>
</template>
<script setup lang="ts">
defineProps<{ description?: string; title?: string; subTitle?: string }>()
</script>
