<template>
  <AppDialog :model-value="!!operation" title="文件操作明细" width="640px" @close="emit('close')">
    <p class="break-all text-sm">
      {{ operation?.path }} {{ operation?.targetPath ? `→ ${operation.targetPath}` : '' }}
    </p>
    <p v-if="operation?.error" class="text-sm text-destructive">{{ operation.error }}</p>
    <p v-if="operation?.result?.summary" class="text-sm">
      已删除 {{ operation.result.summary.deletedFiles }} 个文件、{{
        operation.result.summary.deletedDirectories
      }}
      个文件夹；剩余 {{ operation.result.summary.remainingCount }} 项。
    </p>
    <ul class="max-h-80 space-y-2 overflow-auto text-sm" aria-label="文件操作结果">
      <li v-for="item in items" :key="item.path" class="break-all rounded border p-2">
        <span>{{ item.path }}</span> · {{ labels[item.status] }}
        <p v-if="item.error" class="text-destructive">{{ item.error }}</p>
      </li>
    </ul>
    <p v-if="loading" role="status">读取明细…</p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="!loading && !error && !items.length" class="text-sm text-muted-foreground">
      暂无逐项明细。
    </p>
    <template #footer
      ><AppButton @click="emit('close')">关闭</AppButton
      ><AppButton v-if="cursor || error" :loading="loading" @click="load">{{
        error ? '重试读取' : '加载更多'
      }}</AppButton></template
    >
  </AppDialog>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { WorkspaceFileOperation, WorkspaceOperationItem } from '@/types/workspace-file'
const props = defineProps<{
  operation: WorkspaceFileOperation | null
  details: (
    operation: WorkspaceFileOperation,
    cursor?: string,
  ) => Promise<{ items: WorkspaceOperationItem[]; nextCursor: string | null }>
}>()
const emit = defineEmits<{ close: [] }>()
const labels = {
  DELETED: '已删除',
  REMAINING: '未删除',
  UNKNOWN: '待核实',
  ARCHIVED: '已打包',
  FAILED: '失败',
}
const items = ref<WorkspaceOperationItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const error = ref('')
let epoch = 0
watch(
  () => props.operation,
  (operation) => {
    epoch++
    items.value = []
    cursor.value = null
    loading.value = false
    error.value = ''
    if (operation) void load()
  },
)
async function load() {
  if (!props.operation || loading.value) return
  const current = epoch
  loading.value = true
  error.value = ''
  try {
    const data = await props.details(props.operation, cursor.value || '')
    if (current === epoch) {
      items.value.push(...data.items)
      cursor.value = data.nextCursor
    }
  } catch (cause) {
    if (current === epoch) error.value = cause instanceof Error ? cause.message : '读取失败'
  } finally {
    if (current === epoch) loading.value = false
  }
}
onScopeDispose(() => epoch++)
</script>
