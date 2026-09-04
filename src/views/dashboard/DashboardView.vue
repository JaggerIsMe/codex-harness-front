<template>
  <div class="dashboard-page">
    <p v-if="loading" role="status">加载总览中…</p>
    <p v-if="loadError" role="alert" class="text-destructive">{{ loadError }}</p>
    <section class="welcome-card">
      <div>
        <span class="page-kicker">SYSTEM OVERVIEW</span>
        <h2>欢迎回到 Harness 中台</h2>
        <p>设备、隔离项目与 Codex 会话将在这里汇聚。每个项目独占执行目录。</p>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 metric-grid">
      <div v-for="metric in metrics" :key="metric.label">
        <article class="metric-card">
          <div class="metric-card__icon" :class="`metric-card__icon--${metric.tone}`">
            <span class="inline-flex shrink-0 items-center [&_svg]:size-4"
              ><component :is="metric.icon"
            /></span>
          </div>
          <div>
            <span>{{ metric.label }}</span
            ><strong>{{ metric.value }}</strong
            ><small>{{ metric.note }}</small>
          </div>
        </article>
      </div>
    </div>

    <section class="setup-card">
      <div class="setup-card__header">
        <div>
          <span class="page-kicker">GET STARTED</span>
          <h3>完成第一条执行链路</h3>
        </div>
        <AppBadge :tone="agentStore.connectionState === 'CONNECTED' ? 'success' : 'warning'">{{
          connectionLabel
        }}</AppBadge>
      </div>
      <div class="setup-steps">
        <div v-for="(step, index) in steps" :key="step.title" class="setup-step">
          <span class="setup-step__index">0{{ index + 1 }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <p>{{ step.description }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import AppBadge from '@/components/common/AppBadge.vue'
import { computed, onMounted, ref } from 'vue'
import { Network as Connection, Files, FolderOpen as FolderOpened, Monitor } from 'lucide-vue-next'
import { useAgentStore } from '../../stores/agent'
import { useProjectStore } from '../../stores/project'
const loadError = ref('')
const loading = ref(true)
const agentStore = useAgentStore()
const projectStore = useProjectStore()
const connectionLabel = computed(() =>
  agentStore.connectionState === 'CONNECTED' ? '实时通道已连接' : '实时通道连接中',
)
const metrics = computed(() => [
  {
    label: '在线设备',
    value: agentStore.onlineDeviceCount,
    note: `共 ${agentStore.devices.length} 台已注册`,
    icon: Monitor,
    tone: 'green',
  },
  {
    label: '已上报工作区',
    value: agentStore.workspaceCount,
    note: '来自全部注册设备',
    icon: Files,
    tone: 'blue',
  },
  {
    label: '隔离项目',
    value: projectStore.projects.length,
    note: '当前账号拥有的项目',
    icon: FolderOpened,
    tone: 'purple',
  },
  {
    label: '实时事件',
    value: agentStore.connectionState === 'CONNECTED' ? 'ON' : 'OFF',
    note: '事务提交后广播',
    icon: Connection,
    tone: 'orange',
  },
])

const steps = [
  { title: '生成设备注册码', description: '在设备管理中创建十分钟内有效的一次性注册码。' },
  { title: '连接 Harness Agent', description: '目标电脑完成注册并上报允许 Codex 操作的执行目录。' },
  { title: '创建隔离项目', description: '将项目独占绑定到执行目录，再在项目中发起多个会话。' },
]

onMounted(async () => {
  try {
    await Promise.all([
      agentStore.loadDevices().then(() => agentStore.loadAllWorkspaces()),
      projectStore.loadProjects(),
    ])
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '总览加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped src="../../assets/styles/dashboard.scss"></style>
