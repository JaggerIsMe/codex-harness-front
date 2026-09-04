<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed, 'is-mobile-open': mobileOpen }">
    <button
      ref="mobileTrigger"
      type="button"
      class="mobile-menu-trigger sidebar-icon"
      aria-label="打开导航"
      :aria-expanded="mobileOpen"
      aria-controls="app-sidebar"
      @click="mobileOpen = true"
    >
      <PanelLeft class="size-5" />
    </button>
    <button
      v-if="mobileOpen"
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />
    <aside
      id="app-sidebar"
      class="app-sidebar"
      aria-label="侧边导航"
      :inert="isMobile && !mobileOpen"
      @keydown.esc="closeMobile"
    >
      <div class="sidebar-brand">
        <RouterLink to="/" class="brand-link" aria-label="Harness 总览"
          ><Command class="size-6 shrink-0" /><span v-if="!collapsed || mobileOpen"
            >Harness</span
          ></RouterLink
        >
        <button
          class="sidebar-icon sidebar-collapse"
          type="button"
          :aria-label="collapsed ? '展开导航' : '收起导航'"
          @click="toggleSidebar"
        >
          <PanelLeft class="size-[18px]" />
        </button>
      </div>
      <div class="sidebar-scroll">
        <nav aria-label="主导航" class="sidebar-menu">
          <RouterLink
            v-for="item in menuItems"
            :key="item.path"
            :to="item.path"
            class="sidebar-link"
            :class="{ 'is-active': route.path === item.path }"
            :aria-label="item.label"
            :title="item.label"
            ><component :is="item.icon" class="size-[18px] shrink-0" /><span
              v-if="!collapsed || mobileOpen"
              >{{ item.label }}</span
            ></RouterLink
          >
        </nav>
        <WorkspaceNavigation
          v-if="!collapsed || mobileOpen"
          @create-project="projectVisible = true"
          @create-conversation="createConversation"
        />
        <button
          v-else
          type="button"
          class="sidebar-link sidebar-workspace-toggle"
          aria-label="展开工作区"
          title="工作区"
          @click="collapsed = false"
        >
          <PanelsTopLeft class="size-[18px]" />
        </button>
      </div>
      <footer class="sidebar-footer">
        <div v-if="!collapsed || mobileOpen" class="sidebar-connection">
          <span :class="['connection-dot', agentStore.connectionState.toLowerCase()]" />{{
            connectionLabel
          }}
        </div>
        <div class="sidebar-account">
          <span v-if="!collapsed || mobileOpen" class="truncate">{{
            authStore.user?.displayName || authStore.user?.username || '管理员'
          }}</span
          ><button
            type="button"
            class="sidebar-icon"
            aria-label="退出登录"
            title="退出登录"
            @click="signOut"
          >
            <LogOut class="size-4" />
          </button>
        </div>
      </footer>
    </aside>
    <main
      class="app-main"
      :class="{ 'app-main--conversation': route.name === 'project-detail' }"
      :inert="isMobile && mobileOpen"
    >
      <router-view />
    </main>
    <CreateProjectDialog v-model="projectVisible" @created="projectCreated" />
    <CreateConversationDialog
      v-if="targetProjectId !== null"
      v-model="conversationVisible"
      :project-id="targetProjectId"
      @created="conversationCreated"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMediaQuery } from '@vueuse/core'
import {
  Command,
  LayoutDashboard,
  Monitor,
  Files,
  Sparkles,
  Folder,
  PanelLeft,
  PanelsTopLeft,
  LogOut,
} from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useAgentStore } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import { useNavigationStore } from '@/stores/navigation'
import WorkspaceNavigation from '@/components/navigation/WorkspaceNavigation.vue'
import CreateProjectDialog from '@/components/project/CreateProjectDialog.vue'
import CreateConversationDialog from '@/components/conversation/CreateConversationDialog.vue'
import type { Project, Conversation } from '@/types/domain'
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const agentStore = useAgentStore()
const projectStore = useProjectStore()
const navigation = useNavigationStore()
const collapsed = ref(false)
const mobileOpen = ref(false)
const mobileTrigger = ref<HTMLButtonElement | null>(null)
const isMobile = useMediaQuery('(max-width: 760px)')
const projectVisible = ref(false)
const conversationVisible = ref(false)
const targetProjectId = ref<number | null>(null)
const menuItems = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/devices', label: '设备管理', icon: Monitor },
  { path: '/workspaces', label: '执行目录', icon: Files },
  { path: '/skills', label: 'Skills', icon: Sparkles },
  { path: '/projects', label: '项目', icon: Folder },
]
const connectionLabel = computed(
  () =>
    ({ CONNECTED: '已连接', CONNECTING: '正在连接…', DISCONNECTED: '连接已断开' })[
      agentStore.connectionState
    ],
)
function closeMobile() {
  mobileOpen.value = false
  void nextTick(() => mobileTrigger.value?.focus())
}
function toggleSidebar() {
  if (isMobile.value) closeMobile()
  else collapsed.value = !collapsed.value
}
function createConversation(id: number) {
  targetProjectId.value = id
  conversationVisible.value = true
}
async function projectCreated(project: Project) {
  navigation.expanded[project.id] = true
  await router.push({ name: 'project-detail', params: { projectId: project.id } })
}
async function conversationCreated(value: Conversation) {
  navigation.upsert(value)
  await router.push({
    name: 'project-detail',
    params: { projectId: value.projectId },
    query: { id: value.id },
  })
}
function signOut() {
  authStore.signOut()
  void router.replace({ name: 'login' })
}
watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)
watch(mobileOpen, async (open) => {
  if (open) {
    await nextTick()
    document.querySelector<HTMLButtonElement>('.sidebar-collapse')?.focus()
  }
})
onMounted(async () => {
  agentStore.connect()
  await Promise.all([
    projectStore.loadProjects(),
    authStore.user ? Promise.resolve() : authStore.loadProfile().catch(() => {}),
  ])
})
onBeforeUnmount(() => {
  agentStore.disconnect()
  navigation.reset()
})
</script>
<style scoped src="../assets/styles/main.layout.scss"></style>
