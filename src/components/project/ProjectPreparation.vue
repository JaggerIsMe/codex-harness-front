<template>
  <section class="grid gap-4 rounded-xl border p-6" aria-live="polite">
    <h2 class="text-lg font-semibold">{{ project.projectName }}</h2>
    <p v-if="project.provisioningStatus === 'PREPARING'">
      正在 {{ project.deviceName }} 上准备独占执行目录…
    </p>
    <p v-else>项目执行目录尚未就绪</p>
    <p v-if="project.failureMessage" role="alert" class="text-destructive">
      {{ project.failureMessage }}
    </p>
    <p class="text-sm text-muted-foreground">
      目录就绪后将自动打开工作区。重试会复用当前项目与目录。
    </p>
    <div class="flex gap-2">
      <AppButton :loading="loading" @click="emit('refresh')">刷新状态</AppButton>
      <AppButton
        v-if="project.workspaceStatus === 'FAILED'"
        tone="primary"
        :loading="retrying"
        @click="retry"
        >重试准备</AppButton
      >
    </div>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { Project } from '@/types/domain'
import AppButton from '@/components/common/AppButton.vue'
import { retryProjectPreparation } from '@/api/project'
import { useProjectStore } from '@/stores/project'
const props = defineProps<{ project: Project; loading?: boolean }>()
const emit = defineEmits<{ refresh: [] }>()
const retrying = ref(false)
const error = ref('')
const store = useProjectStore()
async function retry() {
  if (retrying.value) return
  retrying.value = true
  error.value = ''
  try {
    const result = await retryProjectPreparation(props.project.id)
    store.upsertProject(result.data)
    emit('refresh')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '重试失败'
  } finally {
    retrying.value = false
  }
}
</script>
