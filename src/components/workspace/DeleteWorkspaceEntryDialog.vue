<template>
  <AlertDialog
    :open="!!file"
    @update:open="
      (value) => {
        if (!value) emit('close')
      }
    "
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle
          >永久删除{{ file?.type === 'DIRECTORY' ? '文件夹' : '文件' }}</AlertDialogTitle
        >
        <AlertDialogDescription class="break-all"
          >{{
            file?.path
          }}。永久删除，无法恢复。已关联的历史附件将标记为文件已删除。</AlertDialogDescription
        >
      </AlertDialogHeader>
      <p v-if="checking" role="status" class="text-sm">正在检查真实删除范围…</p>
      <div v-if="plan" class="space-y-3 text-sm">
        <p>
          检查范围：{{ plan.fileCount }} 个文件、{{ plan.directoryCount }} 个文件夹，{{
            formatWorkspaceBytes(plan.totalBytes)
          }}
        </p>
        <p v-if="plan.attachmentCount">涉及 {{ plan.attachmentCount }} 个附件关联。</p>
        <p role="status" :class="expired ? 'text-destructive' : 'text-muted-foreground'">
          {{ expired ? '检查结果已过期，请重新检查' : `检查结果 ${remaining} 秒后过期` }}
        </p>
        <template v-if="nonempty">
          <label for="workspace-delete-confirm">请输入文件夹名称「{{ file?.name }}」确认</label>
          <AppInput
            id="workspace-delete-confirm"
            v-model="confirmation"
            :disabled="submitting"
            autocomplete="off"
            @keydown.enter.prevent="submit"
          />
        </template>
      </div>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="blocked" class="text-sm">
        请在近期操作中查看或核实结果。再次删除需要关闭后重新检查。
      </p>
      <AlertDialogFooter class="gap-2">
        <AppButton @click="emit('close')">关闭</AppButton>
        <AppButton
          v-if="!plan || expired"
          :loading="checking"
          :disabled="submitting || blocked"
          @click="inspect"
          >重新检查</AppButton
        >
        <AppButton tone="danger" :loading="submitting" :disabled="!canDelete" @click="submit"
          >永久删除</AppButton
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import type { WorkspaceDeletePlan, WorkspaceFileEntry } from '@/types/workspace-file'
import { formatWorkspaceBytes } from '@/utils/workspaceFileActions'
const props = defineProps<{
  file: WorkspaceFileEntry | null
  prepare: (file: WorkspaceFileEntry, requestKey: string) => Promise<WorkspaceDeletePlan>
  remove: (plan: WorkspaceDeletePlan, requestKey: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const plan = ref<WorkspaceDeletePlan | null>(null)
const checking = ref(false)
const submitting = ref(false)
const blocked = ref(false)
const confirmation = ref('')
const error = ref('')
const now = ref(Date.now())
const remaining = computed(() =>
  Math.max(0, Math.ceil(((plan.value?.expiresAt || 0) - now.value) / 1000)),
)
const expired = computed(() => remaining.value <= 0)
const nonempty = computed(
  () =>
    props.file?.type === 'DIRECTORY' &&
    !!plan.value &&
    (plan.value.fileCount > 0 || plan.value.directoryCount > 1),
)
const canDelete = computed(
  () =>
    !!plan.value &&
    !expired.value &&
    !checking.value &&
    !submitting.value &&
    !blocked.value &&
    (!nonempty.value || confirmation.value === props.file?.name),
)
let timer: ReturnType<typeof setInterval> | undefined
let epoch = 0
let deletionKey = ''
watch(
  () => props.file,
  (file) => {
    epoch++
    clearInterval(timer)
    plan.value = null
    checking.value = false
    submitting.value = false
    blocked.value = false
    confirmation.value = ''
    error.value = ''
    if (file) {
      timer = setInterval(() => (now.value = Date.now()), 500)
      void inspect()
    }
  },
  { immediate: true },
)
async function inspect() {
  const file = props.file
  if (!file || checking.value || blocked.value) return
  const current = ++epoch
  checking.value = true
  error.value = ''
  plan.value = null
  confirmation.value = ''
  try {
    const result = await props.prepare(file, crypto.randomUUID())
    if (current !== epoch) return
    if (result.path !== file.path || result.entryRevision !== file.entryRevision)
      throw new Error('删除检查目标不匹配，请刷新目录')
    plan.value = result
    now.value = Date.now()
    deletionKey = crypto.randomUUID()
  } catch (cause) {
    if (current === epoch) error.value = cause instanceof Error ? cause.message : '检查失败'
  } finally {
    if (current === epoch) checking.value = false
  }
}
async function submit() {
  if (!canDelete.value || !plan.value) return
  const current = epoch
  submitting.value = true
  error.value = ''
  // Never reuse a consumed plan after any submitted deletion, including a lost HTTP response.
  blocked.value = true
  try {
    await props.remove(plan.value, deletionKey)
    if (current === epoch) emit('close')
  } catch (cause) {
    if (current === epoch)
      error.value = cause instanceof Error ? cause.message : '删除失败，请查看近期操作'
  } finally {
    if (current === epoch) submitting.value = false
  }
}
onScopeDispose(() => {
  epoch++
  clearInterval(timer)
})
</script>
