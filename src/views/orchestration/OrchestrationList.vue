<template>
  <div class="mx-auto w-full max-w-6xl space-y-5 p-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">多 Expert 编排</h1>
        <p class="text-sm text-muted-foreground">
          在画布配置 Expert、职责和条件路径，串行协作完成目标。
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <RouterLink :to="{ name: 'project-detail', params: { projectId } }"
          ><AppButton>返回项目</AppButton></RouterLink
        >
        <RouterLink :to="{ name: 'project-experts', params: { projectId } }"
          ><AppButton>项目专家</AppButton></RouterLink
        >
        <RouterLink
          v-if="enabled && auth.can('turn:start') && auth.can('conversation:create')"
          :to="{ name: 'project-workflow-editor', params: { projectId } }"
          :class="buttonVariants()"
          >创建编排</RouterLink
        >
      </div>
    </header>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="!enabled && !loading && !error" class="rounded border p-4">
      多 Expert 编排尚未启用，请联系管理员完成升级并启用。
    </p>
    <form class="flex gap-2" @submit.prevent="refresh">
      <AppInput v-model="keyword" maxlength="120" placeholder="搜索编排名称" />
      <AppButton type="submit" :loading="loading">搜索 / 刷新</AppButton>
    </form>
    <p v-if="loading && !items.length" role="status">正在加载…</p>
    <div v-else-if="items.length" class="overflow-x-auto rounded border">
      <table class="w-full min-w-[600px] text-left text-sm">
        <thead class="bg-muted">
          <tr>
            <th class="p-3">编排名称</th>
            <th class="p-3">状态</th>
            <th class="p-3">创建时间</th>
            <th class="p-3">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" class="border-t">
            <td class="p-3">{{ item.title }}</td>
            <td class="p-3">{{ statusLabels[item.status] }}</td>
            <td class="p-3">{{ item.createdAt?.replace('T', ' ') }}</td>
            <td class="p-3">
              <RouterLink :to="{ query: { execution: item.id } }" class="text-primary underline"
                >查看详情</RouterLink
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p class="p-3 text-xs text-muted-foreground">展示最近 100 条匹配记录。</p>
    </div>
    <p v-else-if="enabled && !error" class="rounded border p-5 text-muted-foreground">
      暂无匹配的编排，创建一个开始协作。
    </p>
    <OrchestrationDetail v-if="current" :key="current.id" :execution="current" @changed="refresh" />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import { buttonVariants } from '@/components/ui/button'
import OrchestrationDetail from '@/components/orchestration/OrchestrationDetail.vue'
import { useOrchestration } from '@/composables/useOrchestration'
import { useAuthStore } from '@/stores/auth'
import { statusLabels } from '@/types/orchestration'
const route = useRoute(),
  auth = useAuthStore()
const projectId = computed(() => Number(route.params.projectId))
const selectedId = computed(() =>
  typeof route.query.execution === 'string' ? route.query.execution : '',
)
const { items, current, keyword, enabled, loading, error, refresh } = useOrchestration(
  projectId,
  selectedId,
)
</script>
