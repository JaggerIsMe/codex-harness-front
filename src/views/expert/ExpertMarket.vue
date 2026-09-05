<template>
  <div class="space-y-6 p-6">
    <header>
      <h1 class="text-2xl font-semibold">专家市场</h1>
      <p class="mt-2 text-muted-foreground">选择合适的专家启用到项目，再在会话中持续与专家对话。</p>
    </header>
    <form class="flex gap-2" @submit.prevent="load">
      <AppInput v-model="keyword" placeholder="搜索专家名称、描述" /><AppButton
        :loading="loading"
        @click="load"
        >搜索</AppButton
      >
    </form>
    <p v-if="error" role="alert" class="text-destructive">
      {{ error }} <AppButton @click="load">重试</AppButton>
    </p>
    <p v-if="loading" role="status">正在加载专家…</p>
    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="expert in rows"
        :key="expert.id"
        class="flex flex-col gap-4 rounded-xl border bg-card p-5"
      >
        <h2 class="text-lg font-semibold">{{ expert.name }}</h2>
        <p class="flex-1 whitespace-pre-wrap text-sm text-muted-foreground">
          {{ expert.description || '暂无描述' }}
        </p>
        <p class="text-xs text-muted-foreground">MCP · 未配置　知识库 · 未配置</p>
        <AppButton tone="primary" @click="openEnable(expert)">启用到项目</AppButton>
      </article>
    </div>
    <p
      v-if="!loading && !rows.length"
      class="rounded-lg border border-dashed p-12 text-center text-muted-foreground"
    >
      暂无已发布专家。
    </p>
    <EnableExpertDialog
      v-model="enabling"
      :expert="selected"
      :initial-project-id="initialProject"
      @enabled="enabled"
    />
  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import EnableExpertDialog from '@/components/expert/EnableExpertDialog.vue'
import { listExperts } from '@/api/expert'
import type { Expert } from '@/types/expert'
import type { Id } from '@/types/domain'
const route = useRoute(),
  router = useRouter()
const initialProject = computed(() =>
  typeof route.query.projectId === 'string' ? route.query.projectId : undefined,
)
const rows = ref<Expert[]>([]),
  selected = ref<Expert | null>(null),
  enabling = ref(false),
  loading = ref(false),
  keyword = ref(''),
  error = ref('')
let controller: AbortController | undefined
async function load() {
  controller?.abort()
  const current = new AbortController()
  controller = current
  loading.value = true
  error.value = ''
  try {
    const result = await listExperts(false, keyword.value, current.signal)
    if (!current.signal.aborted) rows.value = result.data
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (!current.signal.aborted) loading.value = false
  }
}
function openEnable(expert: Expert) {
  selected.value = expert
  enabling.value = true
}
function enabled(id: Id) {
  void router.push(`/projects/${id}/experts`)
}
onMounted(load)
onBeforeUnmount(() => controller?.abort())
</script>
