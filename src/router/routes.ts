import { createRouter, createWebHistory } from 'vue-router'
import { getAccessToken } from '../utils/auth.ts'
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
        path: '',
        name: 'dashboard',
        component: () => import('../views/dashboard/DashboardView.vue'),
        meta: { title: '总览' },
      },
      {
        path: 'devices',
        name: 'devices',
        component: () => import('../views/device/DeviceList.vue'),
        meta: { title: '设备管理' },
      },
      {
        path: 'workspaces',
        name: 'workspaces',
        component: () => import('../views/workspace/WorkspaceList.vue'),
        meta: { title: '工作区' },
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('../views/skill/SkillList.vue'),
        meta: { title: 'Skills' },
      },
      {
        path: 'projects',
        name: 'projects',
        component: () => import('../views/project/ProjectList.vue'),
        meta: { title: '项目' },
      },
      {
        path: 'projects/:projectId',
        name: 'project-detail',
        component: () => import('../views/conversation/ConversationList.vue'),
        meta: { title: '项目会话' },
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

router.beforeEach((to) => {
  const hasToken = Boolean(getAccessToken())
  if (to.matched.some((record) => record.meta.requiresAuth) && !hasToken) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guestOnly && hasToken) {
    return { name: 'dashboard' }
  }
  document.title = `${to.meta.title || '中台'} · My Harness For Codex`
  return true
})

export default router
