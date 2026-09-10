<template>
  <details class="border-t p-3 text-xs">
    <summary class="cursor-pointer font-medium">
      近期操作 <span v-if="activeCount">（{{ activeCount }} 项处理中或待核实）</span>
    </summary>
    <div class="mt-2 space-y-2">
      <AppButton size="small" :loading="loading" @click="emit('refresh')">刷新操作状态</AppButton>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-if="!operations.length && !loading" class="text-muted-foreground">暂无近期操作</p>
      <ul class="max-h-56 space-y-3 overflow-auto" aria-label="近期文件操作">
        <li
          v-for="operation in operations"
          :key="operation.id"
          class="space-y-1 rounded border p-2"
        >
          <p class="break-all">
            {{ names[operation.kind] || '文件操作' }} · {{ operation.path || '工作区文件' }}
          </p>
          <p
            role="status"
            :class="
              ['UNKNOWN', 'FAILED', 'PARTIAL_FAILED'].includes(operation.status)
                ? 'text-destructive'
                : 'text-muted-foreground'
            "
          >
            {{ statuses[operation.status] }}
          </p>
          <p v-if="operation.error" class="break-words text-destructive">{{ operation.error }}</p>
          <p v-if="operation.status === 'UNKNOWN'" class="text-muted-foreground">
            结果尚未确认，请核实状态，不要重复提交。
          </p>
          <p v-if="operation.contentState === 'EXPIRED'" class="text-muted-foreground">
            下载副本已过期，请重新选择文件打包。
          </p>
          <div class="flex flex-wrap gap-2">
            <AppButton
              v-if="operation.status === 'UNKNOWN'"
              size="small"
              @click="emit('reconcile', operation)"
              >核实状态</AppButton
            >
            <AppButton
              v-if="
                operation.kind === 'PREPARE_WORKSPACE_ARCHIVE' &&
                operation.status === 'SUCCEEDED' &&
                operation.contentState !== 'EXPIRED'
              "
              size="small"
              @click="emit('download', operation)"
              >下载 ZIP</AppButton
            >
            <AppButton
              v-if="['FAILED', 'PARTIAL_FAILED', 'SUCCEEDED'].includes(operation.status)"
              size="small"
              @click="detail = operation"
              >查看明细</AppButton
            >
          </div>
        </li>
      </ul>
      <AppButton v-if="nextCursor" size="small" :loading="loading" @click="emit('more')"
        >更早操作</AppButton
      >
    </div>
  </details>
  <WorkspaceOperationDetailsDialog :operation="detail" :details="details" @close="detail = null" />
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import WorkspaceOperationDetailsDialog from './WorkspaceOperationDetailsDialog.vue'
import type { WorkspaceFileOperation, WorkspaceOperationItem } from '@/types/workspace-file'
const props = defineProps<{
  operations: WorkspaceFileOperation[]
  loading: boolean
  error: string
  nextCursor: string | null
  details: (
    operation: WorkspaceFileOperation,
    cursor?: string,
  ) => Promise<{ items: WorkspaceOperationItem[]; nextCursor: string | null }>
}>()
const emit = defineEmits<{
  refresh: []
  more: []
  reconcile: [operation: WorkspaceFileOperation]
  download: [operation: WorkspaceFileOperation]
}>()
const detail = shallowRef<WorkspaceFileOperation | null>(null)
const activeCount = computed(
  () =>
    props.operations.filter((operation) =>
      ['QUEUED', 'RUNNING', 'UNKNOWN'].includes(operation.status),
    ).length,
)
const names: Record<string, string> = {
  RELOCATE_WORKSPACE_ENTRY: '重命名 / 移动',
  PREPARE_WORKSPACE_DELETE: '删除检查',
  DELETE_WORKSPACE_ENTRY: '删除',
  PREPARE_WORKSPACE_ARCHIVE: '打包下载',
}
const statuses: Record<WorkspaceFileOperation['status'], string> = {
  QUEUED: '等待处理',
  RUNNING: '正在处理',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  EXPIRED: '已过期',
  PARTIAL_FAILED: '部分完成',
  UNKNOWN: '结果未知',
}
</script>
