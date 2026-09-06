<template>
  <div class="management-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">MODEL PROVIDERS</span>
        <h2>模型管理</h2>
        <p>集中管理第三方模型 API、不可变版本和输入模态。</p>
      </div>
      <AppButton tone="primary" :icon="Plus" @click="edit(null)">添加模型</AppButton>
    </section>
    <section class="data-card">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row">
        <AppInput v-model="keyword" placeholder="名称、配置编码" @keyup.enter="load" /><AppSelect
          v-model="status"
          clearable
          placeholder="全部状态"
          @keyup.enter="load"
          ><option value="ENABLED">已启用</option>
          <option value="DISABLED">已停用</option></AppSelect
        >
        <div class="search-actions">
          <AppButton tone="primary" :icon="Search" @click="load">查询</AppButton
          ><AppButton :icon="Refresh" :loading="loading" @click="load">刷新</AppButton>
        </div>
      </div>
      <p v-if="error" class="mb-3 text-sm text-destructive" role="alert">{{ error }}</p>
      <div class="table-area">
        <Table
          ><TableHeader
            ><TableRow
              ><TableHead>配置</TableHead><TableHead>Provider</TableHead
              ><TableHead>模型 ID</TableHead><TableHead>模态</TableHead><TableHead>版本</TableHead
              ><TableHead>状态</TableHead><TableHead>操作</TableHead></TableRow
            ></TableHeader
          ><TableBody
            ><TableRow v-if="loading"
              ><TableCell :colspan="7" class="text-center">加载中…</TableCell></TableRow
            ><TableRow v-for="row in rows" :key="row.id"
              ><TableCell
                ><div class="primary-cell">
                  <strong>{{ row.name }}</strong
                  ><span>{{ row.configurationCode }}</span>
                </div></TableCell
              ><TableCell>{{ row.runtime.providerName }}</TableCell
              ><TableCell>{{ row.runtime.modelId }}</TableCell
              ><TableCell>{{ row.runtime.inputModalities.join(' / ') }}</TableCell
              ><TableCell>v{{ row.currentVersionNo }}</TableCell
              ><TableCell
                ><AppBadge :tone="row.status === 'ENABLED' ? 'success' : 'info'">{{
                  row.status === 'ENABLED' ? '启用' : '停用'
                }}</AppBadge></TableCell
              ><TableCell
                ><AppButton link @click="edit(row)">编辑并发版</AppButton
                ><AppButton
                  link
                  :tone="row.status === 'ENABLED' ? 'danger' : 'primary'"
                  @click="toggle(row)"
                  >{{ row.status === 'ENABLED' ? '停用' : '启用' }}</AppButton
                ></TableCell
              ></TableRow
            ><TableRow v-if="!rows.length && !loading"
              ><TableCell :colspan="7" class="text-center text-muted-foreground"
                >暂无模型配置</TableCell
              ></TableRow
            ></TableBody
          ></Table
        >
      </div>
    </section>
    <ModelEditDialog v-model="dialog" :configuration="current" @saved="load" />
  </div>
</template>
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Search, RefreshCw as Refresh } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import ModelEditDialog from '@/components/model/ModelEditDialog.vue'
import type { ModelConfiguration } from '@/types/model'
import { changeModelConfigurationStatus, listModelConfigurations } from '@/api/model'
const rows = ref<ModelConfiguration[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const status = ref('')
const dialog = ref(false)
const current = ref<ModelConfiguration | null>(null)
async function load() {
  loading.value = true
  error.value = ''
  try {
    rows.value = (await listModelConfigurations(keyword.value.trim(), status.value)).data
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}
function edit(row: ModelConfiguration | null) {
  current.value = row
  dialog.value = true
}
async function toggle(row: ModelConfiguration) {
  await changeModelConfigurationStatus(
    row.id,
    row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED',
    row.revision,
  )
  toast.success('模型状态已更新')
  await load()
}
onMounted(load)
</script>
<style scoped src="../../assets/styles/management.scss"></style>
