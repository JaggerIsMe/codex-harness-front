<template>
  <div class="management-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">AGENT WORKSPACES</span>
        <h2>工作区</h2>
        <p>查看各 Agent 上报的受控目录、状态与最近上报时间。</p>
      </div>
      <div class="toolbar-actions">
        <AppButton :icon="Refresh" :loading="loading" @click="load">刷新数据</AppButton>
        <AppButton tone="primary" :icon="Plus" @click="createVisible = true">新建工作区</AppButton>
      </div>
    </section>
    <section class="data-card">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row">
        <div>
          <AppInput
            v-model="keywordInput"
            clearable
            placeholder="搜索工作区名称或路径"
            @keyup.enter="search"
          />
        </div>
        <div>
          <AppSelect v-model="deviceInput" clearable placeholder="全部设备" @keyup.enter="search">
            <option
              v-for="device in agentStore.devices"
              :key="device.id"
              :value="String(device.id)"
            >
              {{ device.deviceName }}
            </option>
          </AppSelect>
        </div>
        <div class="search-actions">
          <AppButton tone="primary" :icon="Search" @click="search">查询</AppButton
          ><AppButton @click="resetSearch">重置</AppButton>
        </div>
      </div>
      <p v-if="loadError" role="alert" class="mb-3 text-sm text-destructive">{{ loadError }}</p>
      <div class="table-area">
        <Table
          ><TableHeader
            ><TableRow
              ><TableHead style="min-width: 180px">工作区</TableHead
              ><TableHead style="min-width: 180px">所属设备</TableHead
              ><TableHead style="min-width: 150px">授权父目录</TableHead
              ><TableHead style="min-width: 320px">根目录</TableHead
              ><TableHead style="min-width: 120px">状态</TableHead
              ><TableHead style="min-width: 180px">最近上报</TableHead></TableRow
            ></TableHeader
          ><TableBody
            ><TableRow v-if="loading"
              ><TableCell :colspan="6" class="text-center">加载中…</TableCell></TableRow
            ><template v-for="row in filteredWorkspaces" :key="row.id"
              ><TableRow
                ><TableCell
                  ><div class="primary-cell">
                    <strong>{{ row.workspaceName }}</strong
                    ><span>ID {{ row.id }}</span>
                  </div></TableCell
                ><TableCell>{{ deviceName(row.deviceId) }}</TableCell
                ><TableCell>{{ row.parentName || '--' }}</TableCell
                ><TableCell>{{ row.rootPath || '--' }}</TableCell
                ><TableCell
                  ><span :title="row.failureMessage"
                    ><AppBadge :tone="statusMeta(row.status).type">{{
                      statusMeta(row.status).label
                    }}</AppBadge></span
                  ></TableCell
                ><TableCell>{{ formatDate(row.lastReportedAt) }}</TableCell></TableRow
              ></template
            ><TableRow v-if="!filteredWorkspaces.length && !loading"
              ><TableCell :colspan="6" class="text-center text-muted-foreground"
                >暂无 Agent 上报的工作区</TableCell
              ></TableRow
            ></TableBody
          ></Table
        >
      </div>
    </section>
    <CreateWorkspaceDialog
      v-model="createVisible"
      :initial-device-id="deviceInput"
      @created="load"
    />
  </div>
</template>

<script setup lang="ts">
import type { Id } from '@/types/domain'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import AppBadge from '@/components/common/AppBadge.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Plus, RefreshCw as Refresh, Search } from 'lucide-vue-next'
import { useAgentStore } from '../../stores/agent'
import CreateWorkspaceDialog from '../../components/workspace/CreateWorkspaceDialog.vue'

const route = useRoute()
const agentStore = useAgentStore()
const loading = ref(false)
const loadError = ref('')
const createVisible = ref(false)
const keywordInput = ref('')
const deviceInput = ref(route.query.deviceId ? String(route.query.deviceId) : '')
const filters = ref({ keyword: '', deviceId: deviceInput.value })
const allWorkspaces = computed(() => Object.values(agentStore.workspacesByDevice).flat())
const filteredWorkspaces = computed(() =>
  allWorkspaces.value.filter((workspace) => {
    const text = `${workspace.workspaceName} ${workspace.rootPath}`.toLowerCase()
    return (
      (!filters.value.keyword || text.includes(filters.value.keyword.toLowerCase())) &&
      (!filters.value.deviceId || String(workspace.deviceId) === filters.value.deviceId)
    )
  }),
)

function search() {
  filters.value = { keyword: keywordInput.value.trim(), deviceId: deviceInput.value }
}
function resetSearch() {
  keywordInput.value = ''
  deviceInput.value = ''
  search()
}
function deviceName(id: Id) {
  return agentStore.devices.find((item) => item.id === id)?.deviceName || `设备 #${id}`
}
function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--'
}
function statusMeta(status: string) {
  return (
    {
      CREATING: { label: '创建中', type: 'warning' },
      ENABLED: { label: '可用', type: 'success' },
      FAILED: { label: '创建失败', type: 'danger' },
      MISSING: { label: '目录丢失', type: 'danger' },
      DISABLED: { label: '已禁用', type: 'info' },
    }[status] || { label: status || '未知', type: 'info' }
  )
}
async function load() {
  loading.value = true
  loadError.value = ''
  try {
    await agentStore.loadDevices()
    await agentStore.loadAllWorkspaces()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<style scoped src="../../assets/styles/management.scss"></style>
