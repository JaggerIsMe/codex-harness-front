<template>
  <div class="management-page mcp-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">MCP REGISTRY</span>
        <h2>MCP 管理</h2>
        <p>管理可版本化 MCP Server 配置，供专家发布时锁定使用。</p>
      </div>
      <AppButton tone="primary" :icon="Plus" @click="edit(null)">新增 MCP</AppButton>
    </section>
    <p v-if="error" role="alert" class="mb-3 text-sm text-destructive">{{ error }}</p>
    <section class="data-card">
      <form class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row" @submit.prevent="load">
        <AppInput
          v-model="search.keyword"
          clearable
          placeholder="搜索名称或 Server Code"
          @keyup.enter="load"
        />
        <AppSelect v-model="search.status" clearable placeholder="全部状态" @keyup.enter="load">
          <option value="ENABLED">已启用</option>
          <option value="DISABLED">已停用</option>
        </AppSelect>
        <div class="search-actions">
          <AppButton tone="primary" :icon="Search" :loading="loading" @click="load">查询</AppButton>
          <AppButton @click="reset">重置</AppButton>
        </div>
      </form>
      <div class="table-area">
        <Table class="w-full">
          <TableHeader
            ><TableRow>
              <TableHead style="min-width: 210px">MCP</TableHead
              ><TableHead style="min-width: 140px">Transport</TableHead>
              <TableHead style="min-width: 100px">当前版本</TableHead
              ><TableHead style="min-width: 110px">状态</TableHead>
              <TableHead style="min-width: 180px">更新时间</TableHead
              ><TableHead style="min-width: 230px">操作</TableHead>
            </TableRow></TableHeader
          >
          <TableBody>
            <TableRow v-if="loading"
              ><TableCell :colspan="6" class="text-center">加载中…</TableCell></TableRow
            >
            <template v-for="row in rows" :key="row.id">
              <TableRow>
                <TableCell
                  ><div class="primary-cell">
                    <strong>{{ row.name }}</strong
                    ><code>{{ row.serverCode }}</code
                    ><span>{{ row.description || '暂无描述' }}</span>
                  </div></TableCell
                >
                <TableCell>{{ transportLabel(row.runtimeSpec.transportType) }}</TableCell>
                <TableCell>v{{ row.currentVersionNo }}</TableCell>
                <TableCell
                  ><AppBadge :tone="row.status === 'ENABLED' ? 'success' : 'info'">{{
                    row.status === 'ENABLED' ? '已启用' : '已停用'
                  }}</AppBadge></TableCell
                >
                <TableCell>{{ formatDate(row.updatedAt) }}</TableCell>
                <TableCell>
                  <AppButton link tone="primary" @click="edit(row)">编辑/新版本</AppButton>
                  <AppButton link tone="primary" @click="toggleVersions(row)">{{
                    expandedId === row.id ? '收起版本' : '查看版本'
                  }}</AppButton>
                  <AppButton
                    link
                    :tone="row.status === 'ENABLED' ? 'danger' : 'primary'"
                    @click="toggleStatus(row)"
                    >{{ row.status === 'ENABLED' ? '停用' : '启用' }}</AppButton
                  >
                </TableCell>
              </TableRow>
              <TableRow v-if="expandedId === row.id">
                <TableCell :colspan="6" class="mcp-version-cell">
                  <p v-if="versionsLoading" role="status">版本加载中…</p>
                  <Table v-else class="w-full">
                    <TableHeader
                      ><TableRow
                        ><TableHead>版本</TableHead><TableHead>Server Code</TableHead
                        ><TableHead>Transport</TableHead><TableHead>摘要</TableHead
                        ><TableHead>状态</TableHead><TableHead>创建时间</TableHead
                        ><TableHead>操作</TableHead></TableRow
                      ></TableHeader
                    >
                    <TableBody>
                      <TableRow v-for="version in versions" :key="version.id">
                        <TableCell>v{{ version.versionNo }}</TableCell
                        ><TableCell
                          ><code>{{ version.serverCode }}</code></TableCell
                        >
                        <TableCell>{{
                          transportLabel(version.runtimeSpec.transportType)
                        }}</TableCell>
                        <TableCell
                          ><code :title="version.configDigest"
                            >{{ version.configDigest.slice(0, 12) }}…</code
                          ></TableCell
                        >
                        <TableCell
                          ><AppBadge :tone="version.status === 'ACTIVE' ? 'success' : 'info'">{{
                            version.status === 'ACTIVE' ? '有效' : '已撤销'
                          }}</AppBadge></TableCell
                        >
                        <TableCell>{{ formatDate(version.createdAt) }}</TableCell>
                        <TableCell
                          ><AppButton
                            v-if="version.status === 'ACTIVE'"
                            link
                            tone="danger"
                            @click="revoke(row, version)"
                            >撤销</AppButton
                          ></TableCell
                        >
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableCell>
              </TableRow>
            </template>
            <TableRow v-if="!loading && !rows.length"
              ><TableCell :colspan="6" class="text-center text-muted-foreground"
                >暂无 MCP 配置，点击右上角新增。</TableCell
              ></TableRow
            >
          </TableBody>
        </Table>
      </div>
    </section>
    <McpEditDialog v-model="editing" :configuration="selected" @saved="saved" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { Plus, Search } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import AppBadge from '@/components/common/AppBadge.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import McpEditDialog from '@/components/mcp/McpEditDialog.vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  changeMcpConfigurationStatus,
  getMcpConfigurationVersions,
  listMcpConfigurations,
  revokeMcpConfigurationVersion,
} from '@/api/mcp'
import { confirmAction } from '@/lib/confirm'
import type { McpConfiguration, McpConfigurationVersion, McpTransportType } from '@/types/mcp'

const rows = ref<McpConfiguration[]>([])
const versions = ref<McpConfigurationVersion[]>([])
const selected = ref<McpConfiguration | null>(null)
const search = reactive({ keyword: '', status: '' })
const loading = ref(false),
  versionsLoading = ref(false),
  editing = ref(false)
const error = ref('')
const expandedId = ref<number | null>(null)
let controller: AbortController | undefined

async function load() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const response = await listMcpConfigurations(search.keyword, search.status, current.signal)
    if (!current.signal.aborted) rows.value = response.data
  } catch (cause) {
    if (!current.signal.aborted)
      error.value = cause instanceof Error ? cause.message : 'MCP 配置加载失败'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
function reset() {
  Object.assign(search, { keyword: '', status: '' })
  void load()
}
function edit(row: McpConfiguration | null) {
  selected.value = row
  editing.value = true
}
function saved() {
  toast.success(selected.value ? 'MCP 配置新版本已创建' : 'MCP 配置已创建')
  expandedId.value = null
  void load()
}
async function toggleStatus(row: McpConfiguration) {
  const next = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  if (
    next === 'DISABLED' &&
    !(await confirmAction('停用后，依赖该配置的专家不能启动新 Turn。', '停用 MCP 配置'))
  )
    return
  await changeMcpConfigurationStatus(row.id, next, row.revision)
  toast.success(next === 'ENABLED' ? 'MCP 配置已启用' : 'MCP 配置已停用')
  await load()
}
async function toggleVersions(row: McpConfiguration) {
  if (expandedId.value === row.id) {
    expandedId.value = null
    return
  }
  expandedId.value = Number(row.id)
  versionsLoading.value = true
  try {
    versions.value = (await getMcpConfigurationVersions(row.id)).data
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '版本加载失败'
    expandedId.value = null
  } finally {
    versionsLoading.value = false
  }
}
async function revoke(row: McpConfiguration, version: McpConfigurationVersion) {
  if (
    !(await confirmAction(
      '撤销后，锁定此版本的专家不能启动新 Turn；历史快照不会被改写。',
      `撤销 v${version.versionNo}`,
    ))
  )
    return
  await revokeMcpConfigurationVersion(row.id, version.id)
  toast.success('MCP 配置版本已撤销')
  versions.value = (await getMcpConfigurationVersions(row.id)).data
}
function transportLabel(value: McpTransportType) {
  return value === 'STDIO' ? 'STDIO' : 'Streamable HTTP'
}
function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--'
}
onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>

<style scoped src="../../assets/styles/management.scss"></style>
<style scoped src="../../assets/styles/mcp.management.scss"></style>
