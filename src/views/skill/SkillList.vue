<template>
  <div class="management-page skill-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">SKILL REGISTRY</span>
        <h2>Skill 管理</h2>
        <p>统一管理版本包，将指定 Skill 版本分配到专家草稿。</p>
      </div>
      <div class="toolbar-actions">
        <AppButton :disabled="loadingBatch" @click="openBatch('CREATE')">批量上传</AppButton>
        <AppButton :disabled="loadingBatch" @click="openBatch('UPDATE')"
          >批量更新{{ selectedSkillIds.length ? `（${selectedSkillIds.length}）` : '' }}</AppButton
        >
        <AppButton
          :disabled="loadingAssignment || !selectedSkillIds.length"
          @click="openBatchAssign"
        >
          批量分配{{ selectedSkillIds.length ? `（${selectedSkillIds.length}）` : '' }}
        </AppButton>
        <AppButton :icon="Promotion" :disabled="loadingAssignment" @click="openAssign()"
          >分配专家</AppButton
        ><AppButton tone="primary" :icon="Upload" @click="openUpload()">上传 Skill</AppButton>
      </div>
    </section>

    <Tabs v-model="activeTab" class="skill-tabs"
      ><TabsList
        ><TabsTrigger value="registry">Skill 仓库</TabsTrigger
        ><TabsTrigger value="assignments">分配记录</TabsTrigger></TabsList
      >
      <TabsContent value="registry"
        ><p v-if="skillError" role="alert" class="mb-3 text-sm text-destructive">
          {{ skillError }}
        </p>
        <section class="data-card">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row">
            <div>
              <AppInput
                v-model="skillSearch.keyword"
                clearable
                placeholder="搜索名称、描述或标签"
                @keyup.enter="searchSkills"
              />
            </div>
            <div>
              <AppSelect
                v-model="skillSearch.status"
                clearable
                placeholder="全部状态"
                @keyup.enter="searchSkills"
                ><option value="ENABLED">已启用</option>
                <option value="DISABLED">已停用</option></AppSelect
              >
            </div>
            <div class="search-actions">
              <AppButton tone="primary" :icon="Search" @click="searchSkills">查询</AppButton
              ><AppButton @click="resetSkills">重置</AppButton>
            </div>
          </div>
          <div v-if="selectedSkillIds.length" class="mb-3 flex items-center gap-3 text-sm">
            <span>已跨页选择 {{ selectedSkillIds.length }} 个 Skill</span>
            <AppButton
              link
              :disabled="loadingBatch || loadingAssignment"
              @click="selectedSkillIds = []"
              >清空选择</AppButton
            >
          </div>
          <div class="table-area skill-registry">
            <Table class="skill-registry__table"
              ><TableHeader
                ><TableRow
                  ><TableHead style="width: 32px"
                    ><input
                      type="checkbox"
                      aria-label="选择当前页全部 Skill"
                      :disabled="
                        loadingSkills || loadingBatch || loadingAssignment || !skills.length
                      "
                      :checked="
                        skills.length > 0 &&
                        skills.every((skill) => selectedSkillIds.includes(skill.id))
                      "
                      @change="
                        selectPage(($event.target as HTMLInputElement).checked)
                      " /></TableHead
                  ><TableHead style="width: 16%">Skill</TableHead><TableHead>描述</TableHead
                  ><TableHead style="width: 14%">标签</TableHead
                  ><TableHead style="width: 7%">版本</TableHead
                  ><TableHead style="width: 11%">状态</TableHead
                  ><TableHead style="width: 16%">更新时间</TableHead
                  ><TableHead style="width: 15%">操作</TableHead></TableRow
                ></TableHeader
              ><TableBody
                ><TableRow v-if="loadingSkills"
                  ><TableCell :colspan="8" class="text-center">加载中…</TableCell></TableRow
                ><template v-for="row in skills" :key="row.id"
                  ><TableRow
                    ><TableCell
                      ><input
                        v-model="selectedSkillIds"
                        type="checkbox"
                        :value="row.id"
                        :disabled="loadingBatch || loadingAssignment"
                        :aria-label="`选择 ${row.skillName}`" /></TableCell
                    ><TableCell
                      ><div class="primary-cell">
                        <strong>{{ row.skillName }}</strong
                        ><span>#{{ row.id }}</span>
                      </div></TableCell
                    ><TableCell
                      ><span class="skill-description" :title="row.description">{{
                        row.description
                      }}</span></TableCell
                    ><TableCell
                      ><span
                        class="skill-description"
                        :title="row.tag"
                        :aria-label="row.tag ? `标签：${row.tag}` : '无标签'"
                        >{{ row.tag || '—' }}</span
                      ></TableCell
                    ><TableCell>{{ row.versionCount }}</TableCell
                    ><TableCell
                      ><AppBadge :tone="row.status === 'ENABLED' ? 'success' : 'info'">{{
                        row.status === 'ENABLED' ? '已启用' : '已停用'
                      }}</AppBadge></TableCell
                    ><TableCell>{{ formatDate(row.updatedAt) }}</TableCell
                    ><TableCell
                      ><AppButton link tone="primary" @click="openUpload(row)">新版本</AppButton
                      ><AppButton link tone="primary" @click="openEdit(row)"
                        >编辑</AppButton
                      ></TableCell
                    ></TableRow
                  ><TableRow
                    ><TableCell :colspan="8"
                      ><details>
                        <summary class="cursor-pointer text-primary">查看版本</summary>
                        <div class="version-panel">
                          <div class="version-panel__header">
                            <strong>版本</strong
                            ><AppButton link tone="primary" :icon="Upload" @click="openUpload(row)"
                              >上传新版本</AppButton
                            >
                          </div>
                          <Table class="skill-versions__table"
                            ><TableHeader
                              ><TableRow
                                ><TableHead style="width: 15%">版本号</TableHead
                                ><TableHead style="width: 12%">大小</TableHead
                                ><TableHead style="width: 22%">SHA-256</TableHead
                                ><TableHead style="width: 13%">状态</TableHead
                                ><TableHead style="width: 20%">上传时间</TableHead
                                ><TableHead style="width: 18%">操作</TableHead></TableRow
                              ></TableHeader
                            ><TableBody
                              ><template
                                v-for="(version, versionIndex) in row.versions"
                                :key="version.id"
                                ><TableRow
                                  ><TableCell>{{ version.version }}</TableCell
                                  ><TableCell>{{ formatSize(version.fileSize) }}</TableCell
                                  ><TableCell
                                    ><span :title="version.sha256"
                                      ><code>{{ version.sha256?.slice(0, 16) }}…</code></span
                                    ></TableCell
                                  ><TableCell
                                    ><AppBadge
                                      :tone="version.status === 'ACTIVE' ? 'success' : 'info'"
                                      >{{
                                        version.status === 'ACTIVE' ? '已激活' : '已停用'
                                      }}</AppBadge
                                    ></TableCell
                                  ><TableCell>{{ formatDate(version.createdAt) }}</TableCell
                                  ><TableCell
                                    ><AppButton link tone="primary" @click="download(row, version)"
                                      >下载</AppButton
                                    ><AppButton
                                      link
                                      tone="primary"
                                      :disabled="
                                        row.status !== 'ENABLED' || version.status !== 'ACTIVE'
                                      "
                                      @click="openAssign(version.id)"
                                      >分配</AppButton
                                    ><AppButton
                                      v-if="versionIndex === 0"
                                      link
                                      :tone="version.status === 'ACTIVE' ? 'danger' : 'success'"
                                      @click="toggleVersion(row, version)"
                                      >{{
                                        version.status === 'ACTIVE' ? '停用' : '激活'
                                      }}</AppButton
                                    ></TableCell
                                  ></TableRow
                                ></template
                              ><TableRow v-if="!row.versions.length"
                                ><TableCell :colspan="6" class="text-center text-muted-foreground"
                                  >暂无版本</TableCell
                                ></TableRow
                              ></TableBody
                            ></Table
                          >
                        </div>
                      </details></TableCell
                    ></TableRow
                  ></template
                ><TableRow v-if="!skills.length && !loadingSkills"
                  ><TableCell :colspan="8" class="text-center text-muted-foreground"
                    >暂无 Skill，点击右上角上传</TableCell
                  ></TableRow
                ></TableBody
              ></Table
            >
          </div>
          <PaginationBar
            :page="page"
            :size="size"
            :total="total"
            :loading="loadingSkills"
            @change="loadSkills"
          />
        </section>
      </TabsContent>

      <TabsContent value="assignments"
        ><SkillAssignmentHistory :revision="assignmentRevision"
      /></TabsContent>
    </Tabs>
    <BatchUploadSkillDialog
      v-model="batchVisible"
      :initial-mode="batchMode"
      :skills="batchSkills"
      :selected-skills="batchSelectedSkills"
      @completed="handleBatchCompleted"
    />
    <UploadSkillDialog v-model="uploadVisible" :skill="selectedSkill" @uploaded="handleUploaded" />
    <EditSkillDialog v-model="editVisible" :skill="selectedSkill" @saved="handleSaved" />
    <AssignSkillExpertsDialog
      v-model="assignVisible"
      :skills="assignmentSkills"
      :initial-version-id="initialVersionId"
      :initial-version-ids="initialVersionIds"
      @completed="handleAssigned"
    />
  </div>
</template>

<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Skill, SkillVersion } from '@/types/domain'
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
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PaginationBar from '@/components/common/PaginationBar.vue'
import { useSkillList } from '@/composables/useSkillList'
import BatchUploadSkillDialog from '@/components/skill/BatchUploadSkillDialog.vue'
import type { SkillImportMode, SkillImportSubmission } from '@/types/skill-import'
import { Send as Promotion, Search, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { confirmAction } from '@/lib/confirm'
import {
  downloadSkillVersion,
  getSkillOptions,
  getSelectedSkills,
  updateSkillVersionStatus,
} from '../../api/skill'
import EditSkillDialog from '../../components/skill/EditSkillDialog.vue'
import AssignSkillExpertsDialog from '@/components/skill/AssignSkillExpertsDialog.vue'
import SkillAssignmentHistory from '@/components/skill/SkillAssignmentHistory.vue'
import UploadSkillDialog from '../../components/skill/UploadSkillDialog.vue'

const activeTab = ref('registry')
const {
  skills,
  page,
  size,
  total,
  skillError,
  loadingSkills,
  selectedSkillIds,
  skillSearch,
  loadSkills,
  searchSkills,
  resetSkills,
  selectPage,
} = useSkillList()
const uploadVisible = ref(false)
const editVisible = ref(false)
const assignVisible = ref(false)
const assignmentRevision = ref(0)
const assignmentSkills = ref<Skill[]>([])
const batchVisible = ref(false)
const batchMode = ref<SkillImportMode>('CREATE')
const batchSkills = ref<Skill[]>([])
const batchSelectedSkills = ref<Skill[]>([])
const loadingBatch = ref(false)
const selectedSkill = ref<Skill | null>(null)
const initialVersionId = ref<number | null>(null)
const initialVersionIds = ref<number[] | undefined>()
const loadingAssignment = ref(false)
const optionRequests = new Set<AbortController>()
onBeforeUnmount(() => optionRequests.forEach((request) => request.abort()))
async function openBatch(mode: SkillImportMode) {
  if (loadingBatch.value || loadingAssignment.value) return
  const selectedIds = [...selectedSkillIds.value]
  if (mode === 'UPDATE' && selectedIds.length > 50) {
    skillError.value = '批量更新每批最多选择 50 个 Skill'
    return
  }
  const controller = new AbortController()
  optionRequests.add(controller)
  loadingBatch.value = true
  try {
    const options =
      mode === 'CREATE'
        ? []
        : selectedIds.length
          ? (await getSelectedSkills(selectedIds, controller.signal)).data
          : (await getSkillOptions({}, controller.signal)).data
    if (controller.signal.aborted) return
    batchSkills.value = options
    batchSelectedSkills.value = options.filter((skill) => selectedIds.includes(skill.id))
    batchMode.value = mode
    batchVisible.value = true
  } catch (cause) {
    if (!controller.signal.aborted)
      skillError.value = cause instanceof Error ? cause.message : 'Skill 加载失败'
  } finally {
    optionRequests.delete(controller)
    loadingBatch.value = false
  }
}
function handleBatchCompleted(result: SkillImportSubmission) {
  toast.success(
    `批量处理完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项，跳过 ${result.skippedCount} 项`,
  )
  selectedSkillIds.value = []
  void loadSkills()
}
function openUpload(skill: Skill | null = null) {
  selectedSkill.value = skill
  uploadVisible.value = true
}
function openEdit(skill: Skill) {
  selectedSkill.value = skill
  editVisible.value = true
}
async function openAssign(versionId: number | null = null) {
  if (loadingAssignment.value || loadingBatch.value) return
  const controller = new AbortController()
  optionRequests.add(controller)
  loadingAssignment.value = true
  try {
    const source = skills.value.find((s) => s.versions.some((v) => v.id === versionId))
    const response = source
      ? await getSelectedSkills([source.id], controller.signal)
      : await getSkillOptions({ status: 'ENABLED' }, controller.signal)
    if (controller.signal.aborted) return
    assignmentSkills.value = response.data
    initialVersionId.value = versionId
    initialVersionIds.value = undefined
    assignVisible.value = true
  } catch (error) {
    if (!controller.signal.aborted)
      skillError.value = error instanceof Error ? error.message : 'Skill 加载失败'
  } finally {
    optionRequests.delete(controller)
    loadingAssignment.value = false
  }
}
async function openBatchAssign() {
  if (loadingAssignment.value || loadingBatch.value) return
  if (!selectedSkillIds.value.length || selectedSkillIds.value.length > 30) {
    skillError.value = '批量分配请选择 1～30 个 Skill'
    return
  }
  loadingAssignment.value = true
  skillError.value = ''
  const selectedIds = [...selectedSkillIds.value]
  const controller = new AbortController()
  optionRequests.add(controller)
  try {
    const all = (await getSelectedSkills(selectedIds, controller.signal)).data
    if (controller.signal.aborted) return
    const chosen = selectedIds.map((id) => all.find((s) => s.id === id))
    if (
      chosen.some(
        (s) => !s || s.status !== 'ENABLED' || !s.versions.some((v) => v.status === 'ACTIVE'),
      )
    ) {
      skillError.value = '所选 Skill 中存在已停用、已删除或没有激活版本的项，请调整选择'
      return
    }
    assignmentSkills.value = all
    initialVersionId.value = null
    initialVersionIds.value = chosen.map((s) => s!.versions.find((v) => v.status === 'ACTIVE')!.id)
    assignVisible.value = true
  } catch (error) {
    if (!controller.signal.aborted)
      skillError.value = error instanceof Error ? error.message : 'Skill 加载失败'
  } finally {
    optionRequests.delete(controller)
    loadingAssignment.value = false
  }
}
function handleAssigned() {
  assignmentRevision.value++
  toast.success('分配处理完成，请查看逐项结果；成功项已更新专家草稿')
}
function handleUploaded() {
  toast.success('Skill 版本上传成功')
  loadSkills()
}
function handleSaved() {
  toast.success('Skill 已更新')
  loadSkills()
}
async function toggleVersion(skill: Skill, version: SkillVersion) {
  if (
    version.status === 'ACTIVE' &&
    !(await confirmAction(
      '停用后将无法分配此版本，依赖该版本的专家后续使用也会受影响，是否继续？',
      '停用 Skill 版本',
    ))
  )
    return
  const status = version.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  await updateSkillVersionStatus(skill.id, version.id, status)
  toast.success(status === 'ACTIVE' ? '版本已激活' : '版本已停用')
  loadSkills()
}
async function download(skill: Skill, version: SkillVersion) {
  const blob = await downloadSkillVersion(skill.id, version.id)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${skill.skillName}-${version.version}.zip`
  anchor.click()
  URL.revokeObjectURL(url)
}
function formatSize(bytes: number) {
  if (!Number.isFinite(bytes)) return '--'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--'
}
onMounted(loadSkills)
</script>

<style scoped src="../../assets/styles/management.scss"></style>
<style scoped src="../../assets/styles/skill.management.scss"></style>
