<template>
  <div class="conversation-page">
    <ChatWorkspace :project-name="currentProject?.projectName" @create="createVisible = true" />
    <CreateConversationDialog
      v-model="createVisible"
      :project-id="projectId"
      @created="handleCreated"
    />
  </div>
</template>

<script setup lang="ts">
import type { Conversation } from '@/types/domain'

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import { toast } from 'vue-sonner'
import { useConversationStore } from '../../stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectStore } from '../../stores/project'
import ChatWorkspace from '../../components/conversation/ChatWorkspace.vue'
import CreateConversationDialog from '../../components/conversation/CreateConversationDialog.vue'

const route = useRoute()
const router = useRouter()
const conversationStore = useConversationStore()
const projectStore = useProjectStore()

const { currentProject } = storeToRefs(projectStore)

const createVisible = ref(false)
conversationStore.startListening()
const projectId = computed(() => Number(route.params.projectId))

async function handleCreated(value: Conversation) {
  toast.success('会话创建成功，等待 Agent 初始化')
  conversationStore.upsertConversation(value)
  useNavigationStore().upsert(value)
  await router.push({
    name: 'project-detail',
    params: { projectId: projectId.value },
    query: { id: value.id },
  })
}

watch(
  () => [route.params.projectId, route.query.id],
  async ([nextProjectId, id], previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    const [previousProjectId, previousId] = previous || []
    if (String(nextProjectId) !== String(previousProjectId)) {
      conversationStore.activateProject(Number(nextProjectId))
      await Promise.all([
        projectStore.loadProject(Number(nextProjectId)),
        conversationStore.loadConversations(Number(nextProjectId)),
      ])
    }
    if (cancelled) return
    if (!id) {
      conversationStore.clearCurrent()
      return
    }
    if (String(id) === String(previousId) && String(nextProjectId) === String(previousProjectId))
      return
    try {
      await conversationStore.openConversation(Number(nextProjectId), Number(id))
    } catch (error) {
      if ((error instanceof Error ? error.message : '') === 'INVALID_CONVERSATION_ID')
        toast.warning('请输入有效的会话 ID')
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => conversationStore.stopListening())
</script>

<style src="../../assets/styles/conversation.scss"></style>
