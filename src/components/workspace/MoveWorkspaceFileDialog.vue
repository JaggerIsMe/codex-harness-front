<template>
  <AppDialog :model-value="!!file" title="移动到" width="520px" @close="emit('close')">
    <p class="break-all text-sm">
      {{ file?.path }} → {{ destination ? `${destination}/` : '' }}{{ file?.name }}
    </p>
    <div class="max-h-72 overflow-auto rounded border p-2" aria-label="移动目标目录">
      <button
        type="button"
        class="workspace-file-root"
        :aria-pressed="destination === ''"
        @click="destination = ''"
      >
        <FolderRoot :size="16" />工作区根目录
      </button>
      <WorkspaceFileTree
        path=""
        :directories="directories"
        :expanded="expanded"
        :selected="destination"
        :disabled="submitting"
        directories-only
        @toggle="toggle"
        @more="(path, cursor) => load(path, false, cursor)"
        @retry="(path) => load(path, true)"
      />
    </div>
    <p class="text-xs text-muted-foreground">选择已有文件夹；目标同名时不会覆盖。</p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <template #footer>
      <AppButton @click="emit('close')">关闭</AppButton>
      <AppButton
        tone="primary"
        :loading="submitting"
        :disabled="destination === parent || blocked"
        @click="submit"
        >移动文件</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FolderRoot } from 'lucide-vue-next'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import WorkspaceFileTree from './WorkspaceFileTree.vue'
import type { WorkspaceDirectoryState, WorkspaceFileEntry } from '@/types/workspace-file'
import { workspaceParent } from '@/utils/workspaceFileActions'
import { WorkspaceOperationError } from '@/api/workspace-file'
const props = defineProps<{
  file: WorkspaceFileEntry | null
  directories: Record<string, WorkspaceDirectoryState>
  load: (path: string, refresh?: boolean, cursor?: string) => Promise<void>
  move: (file: WorkspaceFileEntry, targetDirectory: string, requestKey: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const destination = ref('')
const expanded = ref<string[]>([])
const submitting = ref(false)
const blocked = ref(false)
const error = ref('')
const parent = computed(() => (props.file ? workspaceParent(props.file.path) : ''))
let request: { path: string; id: string } | undefined
let epoch = 0
watch(
  () => props.file,
  (file) => {
    epoch++
    destination.value = file ? workspaceParent(file.path) : ''
    expanded.value = []
    submitting.value = false
    blocked.value = false
    error.value = ''
    request = undefined
    if (file) void props.load('', true)
  },
  { immediate: true },
)
function toggle(path: string) {
  destination.value = path
  expanded.value = expanded.value.includes(path)
    ? expanded.value.filter((value) => value !== path)
    : [...expanded.value, path]
  if (expanded.value.includes(path)) void props.load(path, true)
}
async function submit() {
  const file = props.file
  if (!file || submitting.value || blocked.value || destination.value === parent.value) return
  if (request?.path !== destination.value)
    request = { path: destination.value, id: crypto.randomUUID() }
  const current = epoch
  submitting.value = true
  error.value = ''
  try {
    await props.move(file, destination.value, request.id)
    if (current === epoch) emit('close')
  } catch (cause) {
    if (current !== epoch) return
    error.value = cause instanceof Error ? cause.message : '移动失败'
    blocked.value =
      cause instanceof WorkspaceOperationError &&
      ['UNKNOWN', 'PARTIAL_FAILED'].includes(cause.operation.status)
  } finally {
    if (current === epoch) submitting.value = false
  }
}
</script>
