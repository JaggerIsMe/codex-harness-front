<template>
  <article class="approval-card">
    <div class="approval-card__heading">
      <div>
        <span class="inline-flex shrink-0 items-center [&_svg]:size-4"><Warning /></span
        ><strong>等待审批 · {{ approvalTypeLabel(approval.approvalType) }}</strong>
      </div>
      <span>Turn #{{ approval.turnId }}</span>
    </div>
    <pre>{{ formatDetails(approval.details) }}</pre>
    <div class="approval-actions">
      <AppButton size="small" tone="success" :loading="loading" @click="emit('decision', 'ACCEPT')"
        >批准本次</AppButton
      >
      <AppButton
        size="small"
        tone="primary"
        plain
        :loading="loading"
        @click="emit('decision', 'ACCEPT_FOR_SESSION')"
        v-if="auth.can('device:manage') && approval.approvalType !== 'MCP_TOOL_CALL'"
        >本会话批准</AppButton
      >
      <AppButton
        size="small"
        tone="warning"
        plain
        :loading="loading"
        @click="emit('decision', 'DECLINE')"
        >拒绝操作</AppButton
      >
      <AppButton
        size="small"
        tone="danger"
        plain
        :loading="loading"
        @click="emit('decision', 'CANCEL')"
        >拒绝并中断</AppButton
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Approval, Decision } from '@/types/domain'
import AppButton from '@/components/common/AppButton.vue'
import { TriangleAlert as Warning } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
defineProps<{ approval: Approval; loading?: boolean }>()
const emit = defineEmits<{ decision: [value: Decision] }>()

function approvalTypeLabel(type: string) {
  return (
    (
      {
        COMMAND_EXECUTION: '命令执行',
        FILE_CHANGE: '文件变更',
        MCP_TOOL_CALL: 'MCP 工具调用',
      } as Record<string, string>
    )[type] || type
  )
}

function formatDetails(details: Approval['details']) {
  return typeof details === 'string' ? details : JSON.stringify(details, null, 2)
}
</script>
