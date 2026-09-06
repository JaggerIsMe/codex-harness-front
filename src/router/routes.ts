import { createRouter, createWebHistory } from 'vue-router'
import { getAccessToken } from '../utils/auth.ts'
import { useAuthStore } from '@/stores/auth'
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/login/LoginView.vue'),
    meta: { guestOnly: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'expert-market',
        name: 'expert-market',
        component: () => import('../views/expert/ExpertMarket.vue'),
        meta: { title: '专家市场', permission: 'expert:read' },
      },
      {
        path: 'mcp-configurations',
        name: 'mcp-management',
        component: () => import('../views/mcp/McpManagement.vue'),
        meta: { title: 'MCP 管理', permission: 'mcp:manage' },
      },
      {
        path: 'experts',
        name: 'expert-management',
        component: () => import('../views/expert/ExpertManagement.vue'),
        meta: { title: '专家管理', permission: 'expert:manage' },
      },
      {
        path: 'projects/:projectId/experts',
        name: 'project-experts',
        component: () => import('../views/expert/ProjectExperts.vue'),
        meta: { title: '项目专家', permission: 'expert:use' },
      },
      {
        path: 'account/password',
        name: 'password',
        component: () => import('../views/account/PasswordView.vue'),
        meta: { title: '修改密码' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('../views/user/UserList.vue'),
        meta: { title: '用户管理', permission: 'system:user:manage' },
      },
      {
        path: '',
        name: 'dashboard',
        component: () => import('../views/dashboard/DashboardView.vue'),
        meta: { title: '总览', permission: 'device:manage' },
      },
      {
        path: 'devices',
        name: 'devices',
        component: () => import('../views/device/DeviceList.vue'),
        meta: { title: '设备管理', permission: 'device:manage' },
      },
      {
        path: 'workspaces',
        name: 'workspaces',
        component: () => import('../views/workspace/WorkspaceList.vue'),
        meta: { title: '执行目录', permission: 'device:manage' },
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('../views/skill/SkillList.vue'),
        meta: { title: 'Skills', permission: 'skill:manage' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('../views/project/ProjectList.vue'),
        meta: { title: '项目', permission: 'workspace:use' },
      },
      {
        path: 'projects/:projectId',
        name: 'project-detail',
        component: () => import('../views/conversation/ConversationList.vue'),
        meta: { title: '项目会话', permission: 'workspace:use' },
      },
      { path: 'conversations', redirect: '/projects' },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const hasToken = Boolean(getAccessToken())
  const auth = useAuthStore()
  if (to.matched.some((record) => record.meta.requiresAuth) && !hasToken) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (hasToken) {
    try {
      if (!auth.user) await auth.loadProfile()
    } catch {
      return to.name === 'login' ? true : { name: 'login' }
    }
    if (auth.user?.mustChangePassword && to.name !== 'password') return { name: 'password' }
    if (to.meta.guestOnly) return auth.home
    if (typeof to.meta.permission === 'string' && !auth.can(to.meta.permission))
      return auth.can('workspace:use') ? '/projects' : '/account/password'
  }
  document.title = `${to.meta.title || '中台'} · My Harness For Codex`
  return true
})

export default router
