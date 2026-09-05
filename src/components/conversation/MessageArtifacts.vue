<template>
  <ul v-if="artifacts.length" class="mt-3 grid gap-2" aria-label="交付文件">
    <li
      v-for="artifact in artifacts"
      :key="artifact.id"
      class="flex w-full items-center gap-3 rounded-lg border p-3"
    >
      <FileDown class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="break-all font-medium">{{ artifact.fileName }}</p>
        <p class="text-sm text-muted-foreground">
          {{ formatSize(artifact.sizeBytes) }}
          <span v-if="artifact.status === 'UPLOADING'" role="status">
            · 正在准备下载，等待源设备上传</span
          >
          <span v-else-if="artifact.status === 'FAILED'" role="status">
            · {{ artifact.errorMessage || '上传失败，请重试' }}</span
          >
        </p>
      </div>
      <button
        v-if="artifact.status === 'READY'"
        type="button"
        class="shrink-0 rounded px-3 py-2 text-sm underline focus-visible:outline-2 disabled:opacity-50"
        :disabled="busy.has(String(artifact.id))"
        @click="download(artifact)"
      >
        {{ busy.has(String(artifact.id)) ? '下载中…' : '下载' }}
      </button>
      <button
        v-else-if="artifact.status === 'FAILED'"
        type="button"
        class="shrink-0 rounded px-3 py-2 text-sm underline focus-visible:outline-2 disabled:opacity-50"
        :disabled="busy.has(String(artifact.id))"
        @click="retry(artifact)"
      >
        {{ busy.has(String(artifact.id)) ? '提交中…' : '重试上传' }}
      </button>
    </li>
  </ul>
  <p v-if="error" role="alert" class="mt-2 text-sm text-destructive">{{ error }}</p>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import { FileDown } from 'lucide-vue-next'
import { downloadArtifact, retryArtifact } from '@/api/artifact'
import type { ConversationArtifact, Id } from '@/types/domain'

const props = defineProps<{
  artifacts: ConversationArtifact[]
  projectId: Id
  conversationId: Id
}>()
const emit = defineEmits<{ changed: [] }>()
const busy = ref(new Set<string>())
const error = ref('')
const lifetime = new AbortController()
const urls = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
function formatSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`
}
async function act(artifact: ConversationArtifact, action: () => Promise<void>) {
  const id = String(artifact.id)
  if (busy.value.has(id)) return
  busy.value.add(id)
  error.value = ''
  try {
    await action()
  } catch (cause) {
    if (!lifetime.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '文件操作失败，请重试'
  } finally {
    busy.value.delete(id)
  }
}
function retry(artifact: ConversationArtifact) {
  return act(artifact, async () => {
    await retryArtifact(props.projectId, props.conversationId, artifact.id, lifetime.signal)
    if (!lifetime.signal.aborted) emit('changed')
  })
}
function download(artifact: ConversationArtifact) {
  return act(artifact, async () => {
    const blob = await downloadArtifact(
      props.projectId,
      props.conversationId,
      artifact.id,
      lifetime.signal,
    )
    if (lifetime.signal.aborted) return
    const url = URL.createObjectURL(blob)
    urls.add(url)
    const link = document.createElement('a')
    link.href = url
    link.download = artifact.fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      urls.delete(url)
      timers.delete(timer)
    }, 1000)
    timers.add(timer)
  })
}
onBeforeUnmount(() => {
  lifetime.abort()
  for (const timer of timers) clearTimeout(timer)
  for (const url of urls) URL.revokeObjectURL(url)
})
</script>
