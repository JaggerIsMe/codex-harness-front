<template>
  <section class="project-page">
    <div class="project-toolbar">
      <div>
        <span class="page-kicker">ISOLATED PROJECTS</span>
        <h2>项目</h2>
        <p>每个项目独占一个执行机器目录，会话和运行状态按项目隔离。</p>
      </div>
      <AppButton tone="primary" :icon="Plus" @click="createVisible = true">创建项目</AppButton>
    </div>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-3 project-search">
      <div>
        <AppInput
          v-model="keywordInput"
          maxlength="200"
          clearable
          placeholder="搜索项目、设备或目录"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
      </div>
    </div>
    <p v-if="queryError" role="alert" class="text-sm text-destructive">
      {{ queryError }} <AppButton link @click="query.retry()">重试</AppButton>
    </p>
    <Table
      ><TableHeader
        ><TableRow
          ><TableHead style="min-width: 180px">项目</TableHead
          ><TableHead style="min-width: 170px">执行机器</TableHead
          ><TableHead style="min-width: 280px">独占目录</TableHead
          ><TableHead style="min-width: 160px">隔离</TableHead
          ><TableHead style="min-width: 90px">会话数</TableHead
          ><TableHead style="min-width: 110px">状态</TableHead
          ><TableHead style="min-width: 110px">操作</TableHead></TableRow
        ></TableHeader
      ><TableBody
        ><TableRow v-if="loading"
          ><TableCell :colspan="7" class="text-center">加载中…</TableCell></TableRow
        ><template v-for="row in filteredProjects" :key="row.id"
          ><TableRow
            ><TableCell
              ><button class="project-link" type="button" @click="open(row)">
                {{ row.projectName }}</button
              ><small>#{{ row.id }}</small></TableCell
            ><TableCell
              >{{ row.deviceName }}<small>{{ row.deviceCode }}</small></TableCell
            ><TableCell
              >{{ row.rootPath || '正在准备独占目录' }}
              <p v-if="row.failureMessage" class="text-destructive">
                {{ row.failureMessage }}
              </p></TableCell
            ><TableCell
              ><AppBadge tone="success">{{ row.isolationMode }}</AppBadge></TableCell
            ><TableCell>{{ row.conversationCount }}</TableCell
            ><TableCell
              ><AppBadge :tone="row.provisioningStatus === 'READY' ? 'success' : 'info'">{{
                { READY: '就绪', PREPARING: '准备中', FAILED: '准备失败' }[row.provisioningStatus]
              }}</AppBadge></TableCell
            ><TableCell
              ><AppButton link tone="primary" @click="open(row)">进入项目</AppButton></TableCell
            ></TableRow
          ></template
        ><TableRow v-if="!filteredProjects.length && !loading"
          ><TableCell :colspan="7" class="text-center text-muted-foreground"
            >暂无项目</TableCell
          ></TableRow
        ></TableBody
      ></Table
    >
    <div class="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>共 {{ total }} 个项目</span>
      <AppButton v-if="hasMore" :loading="loading" @click="query.loadMore()"
        >加载更多项目</AppButton
      >
    </div>
    <CreateProjectDialog v-model="createVisible" @created="open" />
  </section>
</template>

<script setup lang="ts">
import type { Project } from '@/types/domain'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import AppBadge from '@/components/common/AppBadge.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { useProjectQuery } from '@/composables/useProjectQuery'
import { getProject } from '@/api/project'
import CreateProjectDialog from '../../components/project/CreateProjectDialog.vue'

const router = useRouter()
const query = useProjectQuery()
const { items: filteredProjects, loading, error: queryError, total, hasMore } = query
const createVisible = ref(false)
const keywordInput = ref('')
function handleSearch() {
  void query.search(keywordInput.value)
}
function open(project: Project) {
  router.push({ name: 'project-detail', params: { projectId: project.id } })
}
let timer: ReturnType<typeof setInterval> | undefined
const preparationController = new AbortController()
const preparing = new Set<number>()
onMounted(() => {
  void query.search()
  timer = setInterval(() => {
    if (loading.value) return
    for (const project of filteredProjects.value.filter(
      (item) => item.provisioningStatus === 'PREPARING',
    )) {
      if (preparing.has(project.id)) continue
      preparing.add(project.id)
      void getProject(project.id, preparationController.signal)
        .then((result) => {
          if (preparationController.signal.aborted) return
          filteredProjects.value = filteredProjects.value.map((item) =>
            item.id === result.data.id ? result.data : item,
          )
        })
        .catch((cause) => {
          if (!preparationController.signal.aborted)
            queryError.value = cause instanceof Error ? cause.message : '项目状态刷新失败'
        })
        .finally(() => preparing.delete(project.id))
    }
  }, 3000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  preparationController.abort()
})
</script>

<style src="../../assets/styles/project.scss"></style>
