<template>
  <AppDialog :model-value="true" title="选择项目工作区文件" width="700px" @close="emit('close')">
    <div class="space-y-3">
      <div class="flex gap-2">
        <AppInput
          v-model="pathInput"
          label="文件目录"
          placeholder="相对目录，留空为根目录"
          @keydown.enter.prevent="browse(pathInput)"
        /><AppButton @click="browse(pathInput)">浏览 / 刷新</AppButton>
      </div>
      <AppButton v-if="path" @click="browse(workspaceParent(path))">上级目录</AppButton>
      <p class="break-all text-sm">当前目录：{{ path || '/' }}</p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="loading" role="status">正在加载目录…</p>
      <p v-else-if="!entries.length" class="text-sm text-muted-foreground">
        {{ pending ? '目录尚未返回，稍后点击刷新。' : '目录中没有可选择的文件。' }}
      </p>
      <ul class="max-h-80 space-y-1 overflow-y-auto">
        <li
          v-for="entry in entries"
          :key="entry.path"
          class="flex items-center justify-between gap-3 rounded border p-2"
        >
          <span class="min-w-0 break-all text-sm"
            >{{ entry.name }} {{ entry.type === 'DIRECTORY' ? '／' : '' }}</span
          >
          <AppButton
            v-if="entry.type === 'DIRECTORY'"
            :aria-label="`打开目录 ${entry.name}`"
            @click="browse(entry.path)"
            >打开</AppButton
          >
          <AppButton
            v-else-if="entry.type === 'FILE'"
            :aria-label="`选择文件 ${entry.name}`"
            @click="emit('select', entry.path)"
            >选择</AppButton
          >
          <span v-else class="text-xs text-muted-foreground">不可用</span>
        </li>
      </ul>
      <AppButton v-if="nextCursor" :disabled="loading" @click="load(nextCursor)">下一页</AppButton>
    </div>
    <template #footer><AppButton @click="emit('close')">关闭</AppButton></template>
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import type { Id } from '@/types/domain'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import { getWorkspaceDirectory } from '@/api/workspace-file'
import { workspaceParent } from '@/utils/workspaceFileActions'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps<{ projectId: Id }>()
const emit = defineEmits<{ select: [string]; close: [] }>()
const path = ref(''),
  pathInput = ref(''),
  entries = ref<WorkspaceFileEntry[]>([]),
  nextCursor = ref<string | null>(null),
  error = ref(''),
  loading = ref(false),
  pending = ref(false)
let controller: AbortController | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  version = 0
function browse(value: string) {
  path.value = value
  pathInput.value = value
  entries.value = []
  nextCursor.value = null
  void load('')
}
async function load(cursor: string, attempt = 0) {
  controller?.abort()
  clearTimeout(timer)
  const current = ++version
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const response = await getWorkspaceDirectory(
      props.projectId,
      path.value,
      cursor,
      attempt === 0,
      controller.signal,
    )
    if (current !== version) return
    const data = response.data
    entries.value = data.entries
    nextCursor.value = data.nextCursor
    pending.value = !data.loaded
    if (!data.supported) error.value = '设备尚不支持工作区文件浏览，可填写相对路径。'
    else if (!data.online) error.value = '设备离线，显示缓存目录；请在执行时确认文件仍存在。'
    else if (data.operation?.status === 'FAILED')
      error.value = data.operation.error || '目录加载失败'
    else if (
      (data.operation?.status === 'QUEUED' || data.operation?.status === 'RUNNING') &&
      attempt < 8
    )
      timer = setTimeout(() => void load(cursor, attempt + 1), 1000)
  } catch (cause) {
    if (current === version && !controller.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '目录加载失败'
  } finally {
    if (current === version) loading.value = false
  }
}
onMounted(() => browse(''))
onBeforeUnmount(() => {
  version++
  controller?.abort()
  clearTimeout(timer)
})
</script>
