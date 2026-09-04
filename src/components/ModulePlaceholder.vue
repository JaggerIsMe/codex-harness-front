<template>
  <section class="module-placeholder">
    <div class="module-placeholder__icon">
      <span class="inline-flex shrink-0 items-center [&_svg]:size-4"><component :is="icon" /></span>
    </div>
    <span class="page-kicker">MODULE READY</span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <AppBadge tone="info">接口接入后启用</AppBadge>
  </section>
</template>

<script setup lang="ts">
import AppBadge from '@/components/common/AppBadge.vue'
defineProps<{ title: string; description: string; icon: import('vue').Component }>()
</script>

<style scoped src="../assets/styles/module.placeholder.scss"></style>
