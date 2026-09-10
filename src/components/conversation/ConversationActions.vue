<template>
  <ResourceActionsMenu
    ref="menu"
    kind="会话"
    :name="conversation.title || `会话 #${conversation.id}`"
    :compact="compact"
    :busy="deleting || renameVisible"
    :can-rename="auth.can('conversation:update')"
    :can-delete="auth.can('conversation:delete')"
    @rename="renameVisible = true"
    @delete="remove"
  />
  <RenameConversationDialog
    v-if="renameVisible"
    v-model="renameVisible"
    :conversation="conversation"
    @saved="emit('changed')"
  />
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { Conversation } from '@/types/domain'
import ResourceActionsMenu from '@/components/common/ResourceActionsMenu.vue'
import RenameConversationDialog from '@/components/conversation/RenameConversationDialog.vue'
import { useProjectConversationActions } from '@/composables/useProjectConversationActions'
import { useAuthStore } from '@/stores/auth'
import { confirmAction } from '@/lib/confirm'

const props = defineProps<{ conversation: Conversation; compact?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const auth = useAuthStore()
const { removeConversation } = useProjectConversationActions()
const menu = ref<InstanceType<typeof ResourceActionsMenu> | null>(null)
const renameVisible = ref(false)
const deleting = ref(false)
watch(renameVisible, async (open) => {
  if (!open) {
    await nextTick()
    menu.value?.focus()
  }
})
async function remove() {
  if (deleting.value || !auth.can('conversation:delete')) return
  const conversation = props.conversation
  deleting.value = true
  try {
    if (
      !(await confirmAction(
        `确定删除会话“${conversation.title || `会话 #${conversation.id}`}”及其全部消息记录？`,
        '删除会话',
        '此操作无法撤销，请先自行下载保留项目文件。',
      ))
    )
      return
    await removeConversation(conversation)
    toast.success('会话已删除')
    emit('changed')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '删除会话失败')
  } finally {
    deleting.value = false
    await nextTick()
    menu.value?.focus()
  }
}
</script>
