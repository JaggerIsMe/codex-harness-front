<template>
  <AppDialog :model-value="!!file" title="重命名" width="460px" @close="close">
    <form class="space-y-3" @submit.prevent="submit">
      <p class="break-all text-sm text-muted-foreground">
        位置：{{ file ? workspaceParent(file.path) || '工作区根目录' : '' }}
      </p>
      <label for="workspace-rename-name" class="text-sm">名称</label>
      <AppInput
        id="workspace-rename-name"
        v-model="name"
        maxlength="255"
        :disabled="submitting"
        @focus="selectName"
      />
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="submitted" class="text-xs text-muted-foreground">
        已提交的操作可在“近期操作”查看；关闭窗口不会撤销操作。
      </p>
      <button
        type="submit"
        class="hidden"
        tabindex="-1"
        aria-hidden="true"
        :disabled="submitting || blocked"
      >
        保存名称
      </button>
    </form>
    <template #footer>
      <AppButton @click="close">{{ submitted ? '关闭' : '取消' }}</AppButton>
      <AppButton
        tone="primary"
        :loading="submitting"
        :disabled="name === file?.name || !name || blocked"
        @click="submit"
        >保存名称</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import { validWorkspaceName, workspaceParent } from '@/utils/workspaceFileActions'
import { WorkspaceOperationError } from '@/api/workspace-file'
const props = defineProps<{
  file: WorkspaceFileEntry | null
  rename: (file: WorkspaceFileEntry, name: string, requestKey: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const name = ref('')
const error = ref('')
const submitting = ref(false)
const submitted = ref(false)
const blocked = ref(false)
let request: { name: string; id: string } | undefined
let epoch = 0
watch(
  () => props.file,
  (file) => {
    epoch++
    name.value = file?.name || ''
    error.value = ''
    submitting.value = false
    submitted.value = false
    blocked.value = false
    request = undefined
  },
  { immediate: true },
)
function selectName(event: FocusEvent) {
  const input = event.target as HTMLInputElement
  const extension = props.file?.type === 'FILE' ? name.value.lastIndexOf('.') : -1
  input.setSelectionRange(0, extension > 0 ? extension : name.value.length)
}
function close() {
  emit('close')
}
async function submit() {
  const file = props.file
  if (!file || submitting.value || blocked.value || name.value === file.name) return
  if (!validWorkspaceName(name.value)) {
    error.value = '请输入有效的单个名称，不能包含路径或受保护名称'
    return
  }
  if (request?.name !== name.value) request = { name: name.value, id: crypto.randomUUID() }
  const current = epoch
  submitting.value = true
  submitted.value = true
  error.value = ''
  try {
    await props.rename(file, name.value, request.id)
    if (current === epoch) emit('close')
  } catch (cause) {
    if (current !== epoch) return
    error.value = cause instanceof Error ? cause.message : '重命名失败'
    blocked.value =
      cause instanceof WorkspaceOperationError &&
      ['UNKNOWN', 'PARTIAL_FAILED'].includes(cause.operation.status)
  } finally {
    if (current === epoch) submitting.value = false
  }
}
</script>
