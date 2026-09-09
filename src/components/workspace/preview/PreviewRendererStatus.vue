<template>
  <p class="file-preview-notice" :role="error ? 'alert' : 'status'">
    {{ error ? '预览组件加载失败，请刷新页面或下载查看。' : '正在加载预览组件…' }}
  </p>
</template>

<script setup lang="ts">
defineProps<{ error?: Error }>()
</script>
