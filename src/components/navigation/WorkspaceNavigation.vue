<template>
  <section class="workspace-navigation" aria-label="工作区项目与会话">
    <div class="workspace-navigation__heading">
      <button type="button" class="sidebar-link flex-1" :aria-expanded="open" @click="open = !open">
        <PanelsTopLeft class="size-[18px]" /><span>工作区</span
        ><ChevronDown class="ml-auto size-3.5" :class="{ '-rotate-90': !open }" />
      </button>
      <button
        type="button"
        class="sidebar-icon"
        aria-label="新建项目"
        title="新建项目"
        @click="emit('createProject')"
      >
        <Plus class="size-4" />
      </button>
    </div>
    <div v-if="open" class="workspace-navigation__content">
      <form class="workspace-search" @submit.prevent="keyword = searchInput.trim()">
        <Search class="size-3.5 shrink-0" /><input
          v-model="searchInput"
          placeholder="搜索项目或会话"
          aria-label="搜索项目或会话"
          @input="keyword = searchInput.trim()"
        />
      </form>
      <p v-if="projects.loading && !projects.projects.length" class="sidebar-hint" role="status">
        加载项目中…
      </p>
      <div v-if="projects.error" class="sidebar-hint" role="alert">
        {{ projects.error }}
        <button type="button" class="underline" @click="projects.loadProjects()">重试</button>
      </div>
      <div v-for="project in filteredProjects" :key="project.id" class="workspace-project">
        <div
          class="workspace-project__heading"
          :class="{ 'is-current': String(route.params.projectId) === String(project.id) }"
        >
          <button
            type="button"
            class="sidebar-icon"
            :aria-label="`${isExpanded(project.id) ? '收起' : '展开'} ${project.projectName}`"
            :aria-expanded="isExpanded(project.id)"
            @click="toggle(project.id)"
          >
            <ChevronDown class="size-3.5" :class="{ '-rotate-90': !isExpanded(project.id) }" />
          </button>
          <RouterLink
            class="workspace-project__name"
            :to="{ name: 'project-detail', params: { projectId: project.id } }"
            :title="project.projectName"
            ><Folder class="size-4 shrink-0" /><span>{{ project.projectName }}</span></RouterLink
          >
          <button
            type="button"
            class="sidebar-icon"
            :aria-label="`在 ${project.projectName} 新建会话`"
            title="新建会话"
            @click="emit('createConversation', project.id)"
          >
            <SquarePen class="size-3.5" />
          </button>
        </div>
        <div v-if="isExpanded(project.id) || keyword" class="workspace-conversations">
          <p v-if="navigation.loading[project.id]" class="sidebar-hint" role="status">
            加载会话中…
          </p>
          <p v-else-if="navigation.errors[project.id]" class="sidebar-hint" role="alert">
            会话加载失败
            <button type="button" class="underline" @click="navigation.load(project.id, true)">
              重试
            </button>
          </p>
          <RouterLink
            v-for="conversation in visibleConversations(project)"
            :key="conversation.id"
            class="workspace-conversation"
            :class="{
              'is-active':
                String(route.params.projectId) === String(project.id) &&
                String(route.query.id) === String(conversation.id),
            }"
            :to="{
              name: 'project-detail',
              params: { projectId: project.id },
              query: { id: conversation.id },
            }"
            :title="conversation.title || `会话 #${conversation.id}`"
          >
            <MessageSquare class="size-3.5 shrink-0" /><span>{{
              conversation.title || `会话 #${conversation.id}`
            }}</span>
          </RouterLink>
          <button
            v-if="
              !navigation.loading[project.id] &&
              !navigation.errors[project.id] &&
              !navigation.conversations[project.id]?.length
            "
            type="button"
            class="workspace-conversation text-muted-foreground"
            @click="emit('createConversation', project.id)"
          >
            <Plus class="size-3.5" /><span>新建第一个会话</span>
          </button>
        </div>
      </div>
      <p
        v-if="!projects.loading && !projects.error && !filteredProjects.length"
        class="sidebar-hint"
      >
        {{ keyword ? '未找到项目或会话' : '还没有项目，点击 + 开始' }}
      </p>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ChevronDown,
  Folder,
  MessageSquare,
  PanelsTopLeft,
  Plus,
  Search,
  SquarePen,
} from 'lucide-vue-next'
import { useProjectStore } from '@/stores/project'
import { useNavigationStore } from '@/stores/navigation'
import { useConversationStore } from '@/stores/conversation'
import type { Id, Project } from '@/types/domain'
const emit = defineEmits<{ createProject: []; createConversation: [projectId: number] }>()
const route = useRoute()
const projects = useProjectStore()
const navigation = useNavigationStore()
const conversationStore = useConversationStore()
const open = ref(true)
const keyword = ref('')
const searchInput = ref('')
const matches = (value: string) => value.toLowerCase().includes(keyword.value.toLowerCase())
const filteredProjects = computed(() =>
  projects.projects.filter(
    (project) =>
      !keyword.value ||
      matches(project.projectName) ||
      navigation.conversations[project.id]?.some((item) => matches(item.title || String(item.id))),
  ),
)
function visibleConversations(project: Project) {
  const items = navigation.conversations[project.id] || []
  return !keyword.value || matches(project.projectName)
    ? items
    : items.filter((item) => matches(item.title || String(item.id)))
}
function isExpanded(id: Id) {
  return navigation.expanded[id] !== false
}
function toggle(id: Id) {
  navigation.expanded[id] = !isExpanded(id)
}
watch(
  () => projects.projects.map((item) => item.id),
  (ids) => {
    ids.forEach((id) => void navigation.load(id))
  },
  { immediate: true },
)
watch(
  () => conversationStore.currentConversation,
  (value) => {
    if (value) navigation.upsert(value)
  },
)
watch(
  () => route.params.projectId,
  (id) => {
    if (id) {
      navigation.expanded[String(id)] = true
      open.value = true
    }
  },
  { immediate: true },
)
</script>
<style src="../../assets/styles/workspace.navigation.scss"></style>
