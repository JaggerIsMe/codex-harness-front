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
          clearable
          placeholder="搜索项目、设备或目录"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
      </div>
    </div>
    <p v-if="projectStore.error" role="alert" class="text-sm text-destructive">
      {{ projectStore.error }}
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
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import { useProjectStore } from '../../stores/project'
import CreateProjectDialog from '../../components/project/CreateProjectDialog.vue'

const router = useRouter()
const projectStore = useProjectStore()
const { projects, loading } = storeToRefs(projectStore)
const createVisible = ref(false)
const keywordInput = ref('')
const keyword = ref('')
const filteredProjects = computed(() => {
  if (!keyword.value) return projects.value
  return projects.value.filter((item) =>
    [item.projectName, item.deviceName, item.deviceCode, item.workspaceName, item.rootPath].some(
      (value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword.value),
    ),
  )
})
function handleSearch() {
  keyword.value = keywordInput.value.trim().toLowerCase()
}
function open(project: Project) {
  router.push({ name: 'project-detail', params: { projectId: project.id } })
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void projectStore.loadProjects()
  timer = setInterval(() => {
    if (
      !loading.value &&
      projects.value.some((project) => project.provisioningStatus === 'PREPARING')
    )
      void projectStore.loadProjects()
  }, 3000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<style src="../../assets/styles/project.scss"></style>
