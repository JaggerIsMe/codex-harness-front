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
      <form class="workspace-search" @submit.prevent="search">
        <Search class="size-3.5 shrink-0" /><input
          v-model="searchInput"
          placeholder="搜索项目或会话"
          aria-label="搜索项目或会话"
          maxlength="200"
          @input="scheduleSearch"
        />
      </form>
      <p v-if="projects.loading && !filteredProjects.length" class="sidebar-hint" role="status">
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
          <ProjectActions :project="project" compact />
          <button
            type="button"
            class="sidebar-icon"
            :aria-label="`在 ${project.projectName} 新建会话`"
            title="新建会话"
            :disabled="project.provisioningStatus !== 'READY'"
            @click="emit('createConversation', project.id)"
          >
            <SquarePen class="size-3.5" />
          </button>
        </div>
        <p v-if="project.provisioningStatus !== 'READY'" class="sidebar-hint">
          {{
            project.provisioningStatus === 'PREPARING' ? '目录准备中…' : '目录未就绪，进入项目处理'
          }}
        </p>
        <div v-else-if="isExpanded(project.id) || keyword" class="workspace-conversations">
          <p v-if="navigation.loading[project.id]" class="sidebar-hint" role="status">
            加载会话中…
          </p>
          <p v-else-if="navigation.errors[project.id]" class="sidebar-hint" role="alert">
            会话加载失败
            <button type="button" class="underline" @click="navigation.load(project.id, true)">
              重试
            </button>
          </p>
          <div
            v-for="{ conversation, activity } in visibleConversations(project)"
            :key="conversation.id"
            class="workspace-conversation-row"
            :class="{
              'is-active':
                String(route.params.projectId) === String(project.id) &&
                String(route.query.id) === String(conversation.id),
            }"
          >
            <RouterLink
              class="workspace-conversation"
              :to="{
                name: 'project-detail',
                params: { projectId: project.id },
                query: { id: conversation.id },
              }"
              :aria-label="conversation.title || `会话 #${conversation.id}`"
              :aria-describedby="`${statusId}-${conversation.id}`"
              :title="`${conversation.title || `会话 #${conversation.id}`} · ${activity.label}`"
            >
              <MessageSquare class="size-3.5 shrink-0" aria-hidden="true" /><span
                class="workspace-conversation__title"
                >{{ conversation.title || `会话 #${conversation.id}` }}</span
              >
              <span :id="`${statusId}-${conversation.id}`" class="sr-only">{{
                activity.label
              }}</span>
            </RouterLink>
            <div class="workspace-conversation__trailing">
              <ConversationActions :conversation="conversation" compact />
              <span
                v-if="activity.state !== 'idle'"
                class="workspace-conversation__activity"
                :data-state="activity.state"
                :title="activity.label"
              >
                <LoaderCircle
                  v-if="activity.state === 'running'"
                  class="workspace-conversation__spinner"
                  aria-hidden="true"
                />
                <span
                  v-else-if="activity.state === 'completed' || activity.state === 'error'"
                  class="workspace-conversation__dot"
                  aria-hidden="true"
                ></span>
              </span>
            </div>
          </div>
          <p v-if="navigation.errorsMore[project.id]" class="sidebar-hint" role="alert">
            {{ navigation.errorsMore[project.id] }}
            <button type="button" class="underline" @click="navigation.loadMore(project.id)">
              重试加载更多会话
            </button>
          </p>
          <button
            v-else-if="navigation.hasMore(project.id)"
            type="button"
            class="workspace-conversation text-muted-foreground"
            :disabled="navigation.loading[project.id] || navigation.loadingMore[project.id]"
            :aria-busy="navigation.loadingMore[project.id]"
            @click="navigation.loadMore(project.id)"
          >
            <LoaderCircle v-if="navigation.loadingMore[project.id]" class="size-3.5 animate-spin" />
            <span>加载更多会话</span>
          </button>
          <button
            v-if="
              !navigation.loading[project.id] &&
              !navigation.errors[project.id] &&
              !keyword &&
              !navigation.conversations[project.id]?.length
            "
            type="button"
            class="workspace-conversation text-muted-foreground"
            @click="emit('createConversation', project.id)"
          >
            <Plus class="size-3.5" /><span>新建第一个会话</span>
          </button>
          <p
            v-if="
              keyword &&
              !navigation.loading[project.id] &&
              !navigation.errors[project.id] &&
              !visibleConversations(project).length
            "
            class="sidebar-hint"
          >
            未找到匹配的会话
          </p>
        </div>
      </div>
      <p v-if="projects.moreError" class="sidebar-hint" role="alert">
        {{ projects.moreError }}
        <button type="button" class="underline" @click="projects.loadMore()">
          重试加载更多项目
        </button>
      </p>
      <button
        v-else-if="projects.hasMore"
        type="button"
        class="sidebar-link text-muted-foreground"
        :disabled="projects.loading || projects.loadingMore"
        :aria-busy="projects.loadingMore"
        @click="projects.loadMore()"
      >
        <LoaderCircle v-if="projects.loadingMore" class="size-3.5 animate-spin" /><span
          >加载更多项目</span
        >
      </button>
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
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ChevronDown,
  Folder,
  LoaderCircle,
  MessageSquare,
  PanelsTopLeft,
  Plus,
  Search,
  SquarePen,
} from 'lucide-vue-next'
import { useProjectStore } from '@/stores/project'
import { useNavigationStore } from '@/stores/navigation'
import { useConversationStore } from '@/stores/conversation'
import ProjectActions from '@/components/project/ProjectActions.vue'
import ConversationActions from '@/components/conversation/ConversationActions.vue'
import type { Id, Project } from '@/types/domain'
const emit = defineEmits<{ createProject: []; createConversation: [projectId: number] }>()
const route = useRoute()
const projects = useProjectStore()
const navigation = useNavigationStore()
const conversationStore = useConversationStore()
const open = ref(true)
const keyword = computed(() => projects.keyword)
const searchInput = ref(projects.keyword)
const statusId = useId()
const filteredProjects = computed(() => projects.visibleProjects)
let searchTimer: ReturnType<typeof setTimeout> | undefined
function search() {
  clearTimeout(searchTimer)
  const query = searchInput.value.trim()
  void projects.setKeyword(query)
  void navigation.setKeyword(query)
}
function scheduleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 300)
}
onBeforeUnmount(() => clearTimeout(searchTimer))
function visibleConversations(project: Project) {
  const items = navigation.conversations[project.id] || []
  return items.map((conversation) => ({
    conversation,
    activity: navigation.activity(conversation),
  }))
}
function isExpanded(id: Id) {
  return navigation.expanded[id] !== false
}
function toggle(id: Id) {
  navigation.expanded[id] = !isExpanded(id)
}
watch(
  () =>
    projects.visibleProjects
      .filter((item) => item.provisioningStatus === 'READY')
      .map((item) => item.id),
  (ids) => {
    ids.forEach((id) => void navigation.load(id))
  },
  { immediate: true },
)
watch(
  () => conversationStore.currentConversation,
  (value, previous) => {
    if (value)
      navigation.upsert(value, {
        promote:
          String(value.id) !== String(previous?.id) ||
          String(value.projectId) !== String(previous?.projectId),
      })
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
