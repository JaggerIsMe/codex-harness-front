<template>
  <div class="management-page skill-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">SKILL REGISTRY</span>
        <h2>Skill 管理</h2>
        <p>统一管理版本包，并将经过校验的 Skill 下发到在线执行机器。</p>
      </div>
      <div class="toolbar-actions">
        <AppButton :icon="Promotion" @click="openDeploy()">下发 Skill</AppButton
        ><AppButton tone="primary" :icon="Upload" @click="openUpload()">上传 Skill</AppButton>
      </div>
    </section>

    <Tabs v-model="activeTab" class="skill-tabs" @update:model-value="handleTabChange"
      ><TabsList
        ><TabsTrigger value="registry">Skill 仓库</TabsTrigger
        ><TabsTrigger value="deployments">下发记录</TabsTrigger></TabsList
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
                placeholder="搜索名称或描述"
                @keyup.enter="loadSkills"
              />
            </div>
            <div>
              <AppSelect
                v-model="skillSearch.status"
                clearable
                placeholder="全部状态"
                @keyup.enter="loadSkills"
                ><option value="ENABLED">已启用</option>
                <option value="DISABLED">已停用</option></AppSelect
              >
            </div>
            <div class="search-actions">
              <AppButton tone="primary" :icon="Search" @click="loadSkills">查询</AppButton
              ><AppButton @click="resetSkills">重置</AppButton>
            </div>
          </div>
          <div class="table-area">
            <Table
              ><TableHeader
                ><TableRow
                  ><TableHead style="min-width: 190px">Skill</TableHead
                  ><TableHead style="min-width: 280px">描述</TableHead
                  ><TableHead style="min-width: 90px">版本</TableHead
                  ><TableHead style="min-width: 110px">状态</TableHead
                  ><TableHead style="min-width: 180px">更新时间</TableHead
                  ><TableHead style="min-width: 150px">操作</TableHead></TableRow
                ></TableHeader
              ><TableBody
                ><TableRow v-if="loadingSkills"
                  ><TableCell :colspan="6" class="text-center">加载中…</TableCell></TableRow
                ><template v-for="row in skills" :key="row.id"
                  ><TableRow
                    ><TableCell
                      ><div class="primary-cell">
                        <strong>{{ row.skillName }}</strong
                        ><span>#{{ row.id }}</span>
                      </div></TableCell
                    ><TableCell>{{ row.description }}</TableCell
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
                    ><TableCell :colspan="6"
                      ><details>
                        <summary class="cursor-pointer text-primary">查看版本</summary>
                        <div class="version-panel">
                          <div class="version-panel__header">
                            <strong>版本</strong
                            ><AppButton link tone="primary" :icon="Upload" @click="openUpload(row)"
                              >上传新版本</AppButton
                            >
                          </div>
                          <Table
                            ><TableHeader
                              ><TableRow
                                ><TableHead style="min-width: 140px">版本号</TableHead
                                ><TableHead style="min-width: 110px">大小</TableHead
                                ><TableHead style="min-width: 210px">SHA-256</TableHead
                                ><TableHead style="min-width: 100px">状态</TableHead
                                ><TableHead style="min-width: 180px">上传时间</TableHead
                                ><TableHead style="min-width: 245px">操作</TableHead></TableRow
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
                                      @click="openDeploy(version.id)"
                                      >下发</AppButton
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
                  ><TableCell :colspan="6" class="text-center text-muted-foreground"
                    >暂无 Skill，点击右上角上传</TableCell
                  ></TableRow
                ></TableBody
              ></Table
            >
          </div>
        </section>
      </TabsContent>

      <TabsContent value="deployments"
        ><p v-if="deploymentError" role="alert" class="mb-3 text-sm text-destructive">
          {{ deploymentError }}
        </p>
        <section class="data-card">
          <div class="grid grid-cols-1 gap-4 md:grid-cols-3 search-row">
            <div>
              <AppInput
                v-model="deploymentSearch.keyword"
                clearable
                placeholder="搜索 Skill、机器或项目"
                @keyup.enter="loadDeployments"
              />
            </div>
            <div>
              <AppSelect
                v-model="deploymentSearch.scopeType"
                clearable
                placeholder="全部作用域"
                @keyup.enter="loadDeployments"
                ><option value="GLOBAL">全局</option>
                <option value="PROJECT">项目</option></AppSelect
              >
            </div>
            <div>
              <AppSelect
                v-model="deploymentSearch.status"
                clearable
                placeholder="全部状态"
                @keyup.enter="loadDeployments"
                ><option v-for="status in deploymentStatuses" :key="status" :value="status">
                  {{ deploymentStatusLabel(status) }}
                </option></AppSelect
              >
            </div>
            <div class="search-actions">
              <AppButton tone="primary" :icon="Search" @click="loadDeployments">查询</AppButton
              ><AppButton @click="resetDeployments">重置</AppButton>
            </div>
          </div>
          <div class="table-area">
            <Table
              ><TableHeader
                ><TableRow
                  ><TableHead style="min-width: 170px">Skill</TableHead
                  ><TableHead style="min-width: 180px">执行机器</TableHead
                  ><TableHead style="min-width: 170px">作用域</TableHead
                  ><TableHead style="min-width: 120px">状态</TableHead
                  ><TableHead style="min-width: 230px">错误信息</TableHead
                  ><TableHead style="min-width: 180px">请求时间</TableHead
                  ><TableHead style="min-width: 140px">操作</TableHead></TableRow
                ></TableHeader
              ><TableBody
                ><TableRow v-if="loadingDeployments"
                  ><TableCell :colspan="7" class="text-center">加载中…</TableCell></TableRow
                ><template v-for="row in deployments" :key="row.id"
                  ><TableRow
                    ><TableCell
                      ><div class="primary-cell">
                        <strong>{{ row.skillName }}</strong
                        ><span>{{ row.version }}</span>
                      </div></TableCell
                    ><TableCell>{{ row.deviceName }}</TableCell
                    ><TableCell
                      ><div class="primary-cell">
                        <AppBadge :tone="row.scopeType === 'GLOBAL' ? 'primary' : 'warning'">{{
                          row.scopeType === 'GLOBAL' ? '全局' : '项目'
                        }}</AppBadge
                        ><span v-if="row.projectName">{{ row.projectName }}</span>
                      </div></TableCell
                    ><TableCell
                      ><AppBadge :tone="deploymentStatusType(row.installStatus)">{{
                        deploymentStatusLabel(row.installStatus)
                      }}</AppBadge></TableCell
                    ><TableCell>{{ row.errorMessage || '--' }}</TableCell
                    ><TableCell>{{ formatDate(row.requestedAt) }}</TableCell
                    ><TableCell
                      ><AppButton
                        v-if="row.installStatus === 'FAILED'"
                        link
                        tone="primary"
                        @click="retry(row)"
                        >重试</AppButton
                      ><AppButton
                        link
                        tone="danger"
                        :disabled="!['INSTALLED', 'FAILED'].includes(row.installStatus)"
                        :loading="removingId === row.id"
                        @click="remove(row)"
                        >移除</AppButton
                      ></TableCell
                    ></TableRow
                  ></template
                ><TableRow v-if="!deployments.length && !loadingDeployments"
                  ><TableCell :colspan="7" class="text-center text-muted-foreground"
                    >暂无下发记录</TableCell
                  ></TableRow
                ></TableBody
              ></Table
            >
          </div>
        </section>
      </TabsContent>
    </Tabs>

    <UploadSkillDialog v-model="uploadVisible" :skill="selectedSkill" @uploaded="handleUploaded" />
    <EditSkillDialog v-model="editVisible" :skill="selectedSkill" @saved="handleSaved" />
    <InstallSkillDialog
      v-model="deployVisible"
      :skills="skills"
      :initial-version-id="initialVersionId"
      @deployed="handleDeployed"
    />
  </div>
</template>

<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Id, Skill, SkillVersion, SkillDeployment, DeploymentResult } from '@/types/domain'
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
import { onMounted, reactive, ref, watch } from 'vue'
import { Send as Promotion, Search, Upload } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { confirmAction } from '@/lib/confirm'
import { deploySkill, removeSkill } from '../../api/agent'
import {
  downloadSkillVersion,
  getSkillDeployments,
  getSkills,
  updateSkillVersionStatus,
} from '../../api/skill'
import { useAgentStore } from '../../stores/agent'
import EditSkillDialog from '../../components/skill/EditSkillDialog.vue'
import InstallSkillDialog from '../../components/skill/InstallSkillDialog.vue'
import UploadSkillDialog from '../../components/skill/UploadSkillDialog.vue'

const agentStore = useAgentStore()
const activeTab = ref('registry')
const skillError = ref('')
const deploymentError = ref('')
const skills = ref<Skill[]>([])
const deployments = ref<SkillDeployment[]>([])
const loadingSkills = ref(false)
const loadingDeployments = ref(false)
const uploadVisible = ref(false)
const editVisible = ref(false)
const deployVisible = ref(false)
const selectedSkill = ref<Skill | null>(null)
const initialVersionId = ref<number | null>(null)
const removingId = ref<Id | null>(null)
const skillSearch = reactive({ keyword: '', status: '' })
const deploymentSearch = reactive({ keyword: '', status: '', scopeType: '' })
const deploymentStatuses = ['INSTALLING', 'INSTALLED', 'REMOVING', 'REMOVED', 'FAILED']

async function loadSkills() {
  loadingSkills.value = true
  skillError.value = ''
  try {
    const response = await getSkills({ ...skillSearch })
    skills.value = response.data || []
  } catch (error) {
    skillError.value = error instanceof Error ? error.message : 'Skill 加载失败'
  } finally {
    loadingSkills.value = false
  }
}
async function loadDeployments() {
  loadingDeployments.value = true
  deploymentError.value = ''
  try {
    const response = await getSkillDeployments({ ...deploymentSearch })
    deployments.value = response.data || []
  } catch (error) {
    deploymentError.value = error instanceof Error ? error.message : '下发记录加载失败'
  } finally {
    loadingDeployments.value = false
  }
}
function resetSkills() {
  Object.assign(skillSearch, { keyword: '', status: '' })
  loadSkills()
}
function resetDeployments() {
  Object.assign(deploymentSearch, { keyword: '', status: '', scopeType: '' })
  loadDeployments()
}
function handleTabChange(name: string | number) {
  if (name === 'deployments') loadDeployments()
}
function openUpload(skill: Skill | null = null) {
  selectedSkill.value = skill
  uploadVisible.value = true
}
function openEdit(skill: Skill) {
  selectedSkill.value = skill
  editVisible.value = true
}
function openDeploy(versionId: number | null = null) {
  initialVersionId.value = versionId
  deployVisible.value = true
}
function handleUploaded() {
  toast.success('Skill 版本上传成功')
  loadSkills()
}
function handleSaved() {
  toast.success('Skill 已更新')
  loadSkills()
}
function handleDeployed(result: DeploymentResult) {
  toast.success(
    `已向 ${result.deployments.length} 台机器下发${result.failedCount ? `，${result.failedCount} 台失败` : ''}`,
  )
  activeTab.value = 'deployments'
  loadDeployments()
}
async function toggleVersion(skill: Skill, version: SkillVersion) {
  if (
    version.status === 'ACTIVE' &&
    !(await confirmAction('停用后将无法下发此版本，是否继续？', '停用 Skill 版本'))
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
async function retry(row: SkillDeployment) {
  await deploySkill(
    row.scopeType,
    row.scopeType === 'PROJECT' ? row.projectId : row.deviceId,
    row.skillVersionId,
  )
  toast.success('已重新下发')
  loadDeployments()
}
async function remove(row: SkillDeployment) {
  if (removingId.value) return
  const target =
    row.scopeType === 'PROJECT' ? `项目 ${row.projectName}` : `执行机器 ${row.deviceName}`
  if (!(await confirmAction(`确认从${target}移除 ${row.skillName} ${row.version}？`, '移除 Skill')))
    return
  removingId.value = row.id
  try {
    await removeSkill(row.id)
    toast.success('移除命令已下发')
    loadDeployments()
  } finally {
    removingId.value = null
  }
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
function deploymentStatusLabel(status: string) {
  return (
    (
      {
        INSTALLING: '安装中',
        INSTALLED: '已安装',
        REMOVING: '移除中',
        REMOVED: '已移除',
        FAILED: '失败',
      } as Record<string, string>
    )[status] || status
  )
}
function deploymentStatusType(status: string) {
  return (
    (
      {
        INSTALLED: 'success',
        FAILED: 'danger',
        REMOVED: 'info',
        INSTALLING: 'warning',
        REMOVING: 'warning',
      } as Record<string, string>
    )[status] || 'info'
  )
}
watch(
  () => agentStore.eventRevision,
  () => {
    if (['SKILL_INSTALL_RESULT', 'SKILL_REMOVE_RESULT'].includes(agentStore.lastEvent?.type || ''))
      loadDeployments()
  },
)
onMounted(loadSkills)
</script>

<style scoped src="../../assets/styles/management.scss"></style>
<style scoped src="../../assets/styles/skill.management.scss"></style>
