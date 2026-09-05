<template>
  <div class="space-y-6 p-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">项目专家</h1>
        <p class="mt-2 text-sm text-muted-foreground">
          项目可启用多个专家；每个会话在创建时固定一个专家，兼容版本升级可从下一轮原地生效。
        </p>
      </div>
      <div class="flex gap-2">
        <RouterLink :to="`/projects/${projectId}`"><AppButton>返回会话</AppButton></RouterLink
        ><RouterLink :to="{ path: '/expert-market', query: { projectId } }"
          ><AppButton tone="primary">从市场添加</AppButton></RouterLink
        ><AppButton :loading="loading" @click="load">刷新</AppButton>
      </div>
    </header>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="loading" role="status">加载中…</p>
    <div class="overflow-x-auto rounded-lg border">
      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b">
            <th class="p-4">专家</th>
            <th class="p-4">项目版本</th>
            <th class="p-4">状态</th>
            <th class="p-4">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="expert in state?.experts || []"
            :key="expert.expertId"
            class="border-b last:border-0"
          >
            <td class="p-4">
              <strong>{{ expert.name }}</strong>
              <p class="mt-1 text-muted-foreground">{{ expert.description }}</p>
            </td>
            <td class="p-4">v{{ expert.versionNo }}</td>
            <td class="p-4">
              <div class="flex flex-wrap items-center gap-2">
                <span>{{
                  expert.available ? '可选择 · 首次执行准备 Skills' : expert.unavailableReason
                }}</span>
                <AppBadge v-if="expert.upgradeAvailable" tone="warning"
                  >可升级至 v{{ expert.latestVersionNo }}</AppBadge
                >
              </div>
            </td>
            <td class="p-4">
              <AppButton
                v-if="expert.upgradeAvailable"
                tone="primary"
                size="small"
                :disabled="busy"
                @click="upgrade(expert)"
                >升级到 v{{ expert.latestVersionNo }}</AppButton
              ><AppButton tone="danger" size="small" :disabled="busy" @click="remove(expert)"
                >移除</AppButton
              >
            </td>
          </tr>
          <tr v-if="!loading && !state?.experts.length">
            <td colspan="4" class="p-8 text-center text-muted-foreground">
              尚未启用专家，请从市场添加。
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import AppButton from '@/components/common/AppButton.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import { bindExpert, getProjectExperts, unbindExpert } from '@/api/expert'
import { confirmAction } from '@/lib/confirm'
import type { ProjectExperts, ProjectExpert } from '@/types/expert'
const route = useRoute(),
  projectId = computed(() => String(route.params.projectId))
const state = ref<ProjectExperts | null>(null),
  loading = ref(false),
  busy = ref(false),
  error = ref('')
let controller: AbortController | undefined
async function load() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const result = await getProjectExperts(projectId.value, current.signal)
    if (!current.signal.aborted) state.value = result.data
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
async function remove(expert: ProjectExpert) {
  if (
    !state.value ||
    busy.value ||
    !(await confirmAction(
      `移除「${expert.name}」后，已绑定它的会话将保留历史，但不能再发送新消息。`,
      '移除项目专家',
    ))
  )
    return
  const id = projectId.value,
    revision = state.value.projectRevision
  busy.value = true
  try {
    const result = await unbindExpert(id, expert.expertId, revision)
    if (id === projectId.value) state.value = result.data
    toast.success('专家已移除')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '移除失败'
  } finally {
    busy.value = false
  }
}
async function upgrade(expert: ProjectExpert) {
  if (!state.value || busy.value || !expert.upgradeAvailable || expert.latestVersionId == null)
    return
  const id = projectId.value,
    revision = state.value.projectRevision
  busy.value = true
  error.value = ''
  try {
    const result = await bindExpert(id, expert.latestVersionId, revision)
    if (id === projectId.value) state.value = result.data
    toast.success(`「${expert.name}」已升级到 v${expert.latestVersionNo}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '升级失败'
  } finally {
    busy.value = false
  }
}
watch(
  projectId,
  () => {
    state.value = null
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => controller?.abort())
</script>
