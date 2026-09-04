<template>
  <div class="conversation-page">
    <p v-if="error" role="alert" class="p-6 text-destructive">{{ error }}</p>
    <ProjectPreparation
      v-if="currentProject && currentProject.provisioningStatus !== 'READY'"
      :project="currentProject"
      :loading="refreshing"
      @refresh="refresh"
    />
    <template v-else-if="currentProject">
      <ChatWorkspace :project-name="currentProject.projectName" @create="createVisible = true" />
      <CreateConversationDialog
        v-model="createVisible"
        :project-id="projectId"
        @created="handleCreated"
      />
    </template>
    <p v-else-if="!error" class="p-6" role="status">正在加载项目…</p>
  </div>
</template>
<script setup lang="ts">
import type { Conversation } from '@/types/domain'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { useConversationStore } from '@/stores/conversation'
import { useNavigationStore } from '@/stores/navigation'
import { useProjectStore } from '@/stores/project'
import ChatWorkspace from '@/components/conversation/ChatWorkspace.vue'
import CreateConversationDialog from '@/components/conversation/CreateConversationDialog.vue'
import ProjectPreparation from '@/components/project/ProjectPreparation.vue'
const route = useRoute(),
  router = useRouter()
const conversationStore = useConversationStore(),
  projectStore = useProjectStore()
const { currentProject } = storeToRefs(projectStore)
const createVisible = ref(false),
  refreshing = ref(false),
  error = ref('')
const projectId = computed(() => Number(route.params.projectId))
let revision = 0
let timer: ReturnType<typeof setInterval> | undefined
conversationStore.startListening()
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
async function refresh() {
  if (refreshing.value) return
  const id = projectId.value,
    version = revision
  refreshing.value = true
  try {
    const previousStatus = currentProject.value?.provisioningStatus
    const project = await projectStore.loadProject(id)
    if (version !== revision || !project) return
    projectStore.upsertProject(project)
    if (previousStatus !== 'READY' && project.provisioningStatus === 'READY') {
      await conversationStore.loadConversations(id)
      if (route.query.id) await conversationStore.openConversation(id, Number(route.query.id))
    }
    error.value = ''
  } catch (cause) {
    if (version === revision) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    refreshing.value = false
  }
}
watch(
  () => [route.params.projectId, route.query.id],
  async ([id, conversationId], _, onCleanup) => {
    const version = ++revision
    onCleanup(() => {
      if (revision === version) revision += 1
    })
    error.value = ''
    createVisible.value = false
    try {
      conversationStore.activateProject(Number(id))
      const project = await projectStore.loadProject(Number(id))
      if (version !== revision || !project || project.provisioningStatus !== 'READY') return
      await conversationStore.loadConversations(Number(id))
      if (version !== revision) return
      if (conversationId)
        await conversationStore.openConversation(Number(id), Number(conversationId))
      else conversationStore.clearCurrent()
    } catch (cause) {
      if (version === revision)
        error.value = cause instanceof Error ? cause.message : '项目加载失败'
    }
  },
  { immediate: true },
)
onMounted(() => {
  timer = setInterval(() => {
    if (currentProject.value?.provisioningStatus === 'PREPARING') void refresh()
  }, 2500)
})
onBeforeUnmount(() => {
  revision += 1
  clearInterval(timer)
  conversationStore.stopListening()
})
</script>
<style src="../../assets/styles/conversation.scss"></style>
