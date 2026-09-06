<template>
  <div class="management-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">AGENT DEVICES</span>
        <h2>设备管理</h2>
        <p>管理 Agent 注册、在线状态和访问权限。禁用设备会立即断开连接并终止活动 Turn。</p>
      </div>
      <AppButton tone="primary" :icon="Plus" @click="enrollmentVisible = true"
        >生成注册码</AppButton
      >
    </section>

    <section class="data-card">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row">
        <div>
          <AppInput
            v-model="keywordInput"
            clearable
            placeholder="搜索设备名称、编码或系统"
            @keyup.enter="search"
          />
        </div>
        <div>
          <AppSelect v-model="statusInput" clearable placeholder="全部状态" @keyup.enter="search">
            <option value="ONLINE">在线</option>
            <option value="OFFLINE">离线</option>
            <option value="DISABLED">已禁用</option>
          </AppSelect>
        </div>
        <div class="search-actions">
          <AppButton tone="primary" :icon="Search" @click="search">查询</AppButton>
          <AppButton @click="resetSearch">重置</AppButton>
          <AppButton :icon="Refresh" :loading="loading" @click="load">刷新</AppButton>
        </div>
      </div>

      <p v-if="loadError" role="alert" class="mb-3 text-sm text-destructive">{{ loadError }}</p>
      <div class="table-area">
        <Table
          ><TableHeader
            ><TableRow
              ><TableHead style="min-width: 180px">设备</TableHead
              ><TableHead style="min-width: 110px">状态</TableHead
              ><TableHead style="min-width: 160px">操作系统</TableHead
              ><TableHead style="min-width: 130px">Agent 版本</TableHead
              ><TableHead style="min-width: 180px">最后心跳</TableHead
              ><TableHead style="min-width: 150px">操作</TableHead></TableRow
            ></TableHeader
          ><TableBody
            ><TableRow v-if="loading"
              ><TableCell :colspan="6" class="text-center">加载中…</TableCell></TableRow
            ><template v-for="row in filteredDevices" :key="row.id"
              ><TableRow
                ><TableCell>
                  <div class="primary-cell">
                    <strong>{{ row.deviceName }}</strong
                    ><span>{{ row.deviceCode }}</span>
                  </div> </TableCell
                ><TableCell
                  ><AppBadge :tone="statusMeta(row.status).type">{{
                    statusMeta(row.status).label
                  }}</AppBadge></TableCell
                ><TableCell>{{
                  [row.osName, row.osVersion].filter(Boolean).join(' ') || '--'
                }}</TableCell
                ><TableCell>{{ row.agentVersion }}</TableCell
                ><TableCell>{{ formatDate(row.lastHeartbeatAt) }}</TableCell
                ><TableCell>
                  <AppButton
                    v-if="row.status !== 'DISABLED'"
                    link
                    tone="danger"
                    :loading="changingId === row.id"
                    @click="changeStatus(row, 'DISABLED')"
                    >禁用</AppButton
                  >
                  <AppButton
                    v-else
                    link
                    tone="primary"
                    :loading="changingId === row.id"
                    @click="changeStatus(row, 'ENABLED')"
                    >启用</AppButton
                  >
                  <AppButton
                    link
                    @click="router.push({ name: 'workspaces', query: { deviceId: row.id } })"
                    >工作区</AppButton
                  >
                  <AppButton v-if="auth.can('model:manage')" link @click="configureModel(row)"
                    >模型</AppButton
                  >
                </TableCell></TableRow
              ></template
            ><TableRow v-if="!filteredDevices.length && !loading"
              ><TableCell :colspan="6" class="text-center text-muted-foreground"
                >暂无已注册设备</TableCell
              ></TableRow
            ></TableBody
          ></Table
        >
      </div>
    </section>

    <CreateEnrollmentDialog v-model="enrollmentVisible" />
    <DeviceModelDialog v-model="modelVisible" :device="modelDevice" @saved="load" />
  </div>
</template>

<script setup lang="ts">
import type { Device, Id } from '@/types/domain'
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
import { useRouter } from 'vue-router'
import { Plus, RefreshCw as Refresh, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { confirmAction } from '@/lib/confirm'
import { updateDeviceStatus } from '../../api/agent'
import { useAgentStore } from '../../stores/agent'
import CreateEnrollmentDialog from '../../components/agent/CreateEnrollmentDialog.vue'
import DeviceModelDialog from '@/components/model/DeviceModelDialog.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const agentStore = useAgentStore()
const loading = ref(false)
const loadError = ref('')
const changingId = ref<Id | null>(null)
const enrollmentVisible = ref(false)
const modelVisible = ref(false)
const modelDevice = ref<Device | null>(null)
const keywordInput = ref('')
const statusInput = ref('')
const filters = ref({ keyword: '', status: '' })

const filteredDevices = computed(() =>
  agentStore.devices.filter((device) => {
    const haystack = [device.deviceName, device.deviceCode, device.osName, device.osVersion]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return (
      (!filters.value.keyword || haystack.includes(filters.value.keyword.toLowerCase())) &&
      (!filters.value.status || device.status === filters.value.status)
    )
  }),
)

function statusMeta(status: string) {
  return (
    {
      ONLINE: { label: '在线', type: 'success' },
      OFFLINE: { label: '离线', type: 'info' },
      DISABLED: { label: '已禁用', type: 'danger' },
    }[status] || { label: status || '未知', type: 'warning' }
  )
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--'
}

function search() {
  filters.value = { keyword: keywordInput.value.trim(), status: statusInput.value }
}

function resetSearch() {
  keywordInput.value = ''
  statusInput.value = ''
  search()
}

function configureModel(device: Device) {
  modelDevice.value = device
  modelVisible.value = true
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    await agentStore.loadDevices()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function changeStatus(device: Device, status: string) {
  if (changingId.value) return
  if (status === 'DISABLED') {
    if (
      !(await confirmAction(
        `禁用 ${device.deviceName} 将立即断开 Agent，并终止其活动 Turn。`,
        '确认禁用设备',
      ))
    )
      return
  }
  changingId.value = device.id
  try {
    await updateDeviceStatus(device.id, status)
    toast.success(status === 'DISABLED' ? '设备已禁用' : '设备已启用，等待 Agent 重新连接')
    await load()
  } finally {
    changingId.value = null
  }
}

onMounted(load)
</script>

<style scoped src="../../assets/styles/management.scss"></style>
