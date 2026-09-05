<template>
  <div class="space-y-6 p-6">
    <header class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">专家管理</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          定义职责与 Skills，发布后供用户在项目中启用。
        </p>
      </div>
      <AppButton tone="primary" @click="edit(null)">创建专家</AppButton>
    </header>
    <form class="flex gap-2" @submit.prevent="load">
      <AppInput v-model="keyword" placeholder="搜索名称、描述" /><AppButton
        :loading="loading"
        @click="load"
        >搜索</AppButton
      >
    </form>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="loading" role="status">加载中…</p>
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b">
            <th class="p-4">专家</th>
            <th class="p-4">状态</th>
            <th class="p-4">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="border-b last:border-0">
            <td class="p-4">
              <strong>{{ row.name }}</strong>
              <p class="mt-1 max-w-xl whitespace-pre-wrap text-muted-foreground">
                {{ row.description }}
              </p>
            </td>
            <td class="whitespace-nowrap p-4">{{ labels[row.status] }}</td>
            <td class="p-4">
              <div class="flex flex-wrap gap-2">
                <AppButton size="small" :disabled="busy" @click="edit(row)">编辑草稿</AppButton
                ><AppButton size="small" :disabled="busy" @click="openPublish(row)"
                  >发布新版本</AppButton
                ><AppButton
                  v-if="row.status === 'PUBLISHED'"
                  size="small"
                  :disabled="busy"
                  @click="change(row, 'unpublish')"
                  >下架</AppButton
                ><AppButton
                  v-if="row.status !== 'DISABLED'"
                  size="small"
                  tone="danger"
                  :disabled="busy"
                  @click="change(row, 'disable')"
                  >禁用</AppButton
                >
              </div>
            </td>
          </tr>
          <tr v-if="!loading && !rows.length">
            <td colspan="3" class="p-8 text-center text-muted-foreground">
              暂无专家，创建第一个专家开始使用。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ExpertEditDialog v-model="editing" :expert="selected" @saved="saved" />
    <ExpertPublishDialog v-model="publishing" :expert="selected" @published="published" />
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { toast } from 'vue-sonner'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ExpertEditDialog from '@/components/expert/ExpertEditDialog.vue'
import ExpertPublishDialog from '@/components/expert/ExpertPublishDialog.vue'
import { listExperts, changeExpertStatus } from '@/api/expert'
import { confirmAction } from '@/lib/confirm'
import type { Expert } from '@/types/expert'
const rows = ref<Expert[]>([]),
  selected = ref<Expert | null>(null)
const keyword = ref(''),
  error = ref(''),
  loading = ref(false),
  busy = ref(false),
  editing = ref(false),
  publishing = ref(false)
const labels = { DRAFT: '草稿', PUBLISHED: '已发布', UNPUBLISHED: '已下架', DISABLED: '已禁用' }
let controller: AbortController | undefined
async function load() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const result = await listExperts(true, keyword.value, current.signal)
    if (!current.signal.aborted) rows.value = result.data
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
function edit(row: Expert | null) {
  selected.value = row
  editing.value = true
}
function saved() {
  toast.success('草稿已保存，发布后用户可用')
  void load()
}
function openPublish(row: Expert) {
  selected.value = row
  publishing.value = true
}
function published() {
  toast.success('专家新版本已发布')
  void load()
}
async function change(row: Expert, action: 'unpublish' | 'disable') {
  if (busy.value) return
  if (
    !(await confirmAction(
      action === 'disable'
        ? '禁用后将阻止新会话和既有会话继续使用此专家。'
        : '下架后市场不再展示，新会话和既有会话都不能继续使用此专家。',
      '更新专家',
    ))
  )
    return
  busy.value = true
  try {
    await changeExpertStatus(row.id, action, row.revision)
    toast.success('专家状态已更新')
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
  } finally {
    busy.value = false
  }
}
onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>
