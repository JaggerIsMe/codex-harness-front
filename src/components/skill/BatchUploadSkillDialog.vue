<template>
  <AppDialog
    :model-value="modelValue"
    :title="mode === 'CREATE' ? '批量上传 Skill' : '批量更新 Skill'"
    width="1200px"
    @close="close"
  >
    <div class="skill-import" @dragover.prevent @drop.prevent="drop">
      <p class="text-sm text-muted-foreground">
        每批最多 50 个独立 ZIP，每包一个 Skill，单包不超过
        20MB。先上传并预览，确认后才创建或更新版本。
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <div v-if="pending" class="skill-import__notice" role="status">
        提交结果待确认。请恢复原提交，避免重复上传。提交标识：{{ pending.submissionId }}
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <label class="text-sm"
          >选择 ZIP
          <input
            type="file"
            multiple
            accept=".zip,application/zip"
            :disabled="locked"
            aria-label="选择多个 Skill ZIP"
            @change="selectFiles"
          />
        </label>
        <label class="flex items-center gap-2 text-sm"
          ><span class="whitespace-nowrap">统一版本号</span>
          <input
            v-model="commonVersion"
            class="skill-import__input"
            maxlength="64"
            :disabled="locked"
            placeholder="例如 1.1.0"
            @keyup.enter="applyVersion"
          />
        </label>
        <AppButton :disabled="locked || !commonVersion.trim()" @click="applyVersion"
          >应用到全部</AppButton
        >
        <AppButton
          v-if="rows.some((row) => row.uploadState === 'FAILED')"
          :disabled="locked"
          @click="retryUploads(selectedSkills)"
          >重试上传</AppButton
        >
      </div>
      <p v-if="!rows.length && !result" class="py-8 text-center text-muted-foreground">
        选择或拖入多个 ZIP 文件
      </p>
      <div v-if="rows.length" class="overflow-x-auto">
        <table class="skill-import__table">
          <thead>
            <tr>
              <th>文件 / 大小</th>
              <th>{{ mode === 'CREATE' ? 'Skill 名称 / 描述' : '目标 Skill' }}</th>
              <th>当前激活版本</th>
              <th>新版本</th>
              <th>校验与结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in rows" :key="row.itemId">
              <tr>
                <td>
                  <span class="break-all">{{ row.file.name }}</span
                  ><small class="block text-muted-foreground"
                    >{{ (row.file.size / 1024 / 1024).toFixed(2) }} MB</small
                  >
                </td>
                <td>
                  <template v-if="mode === 'CREATE'">
                    <input
                      v-model="row.skillName"
                      class="skill-import__input"
                      :aria-label="`${row.file.name} Skill 名称`"
                      maxlength="128"
                      :disabled="locked"
                      @input="invalidate"
                    />
                    <textarea
                      v-model="row.description"
                      class="skill-import__input mt-2"
                      :aria-label="`${row.file.name} 描述`"
                      maxlength="1000"
                      rows="2"
                      :disabled="locked"
                      @input="invalidate"
                    />
                  </template>
                  <select
                    v-else
                    v-model="row.skillId"
                    class="skill-import__input"
                    :aria-label="`${row.file.name} 目标 Skill`"
                    :disabled="locked"
                    @change="invalidate"
                  >
                    <option :value="null">请选择已有 Skill</option>
                    <option v-for="skill in skills" :key="skill.id" :value="skill.id">
                      {{ skill.skillName }}{{ skill.status === 'DISABLED' ? '（已停用）' : '' }}
                    </option>
                  </select>
                </td>
                <td>
                  {{
                    previewItem(row.itemId)
                      ? previewItem(row.itemId)?.currentVersion || '无'
                      : currentVersion(row.skillId)
                  }}
                </td>
                <td>
                  <input
                    v-model="row.version"
                    class="skill-import__input"
                    :aria-label="`${row.file.name} 新版本`"
                    maxlength="64"
                    :disabled="locked"
                    @input="invalidate"
                  />
                </td>
                <td aria-live="polite">
                  <span :class="itemFailed(row.itemId) ? 'text-destructive' : ''">{{
                    itemMessage(row.itemId) || row.message
                  }}</span>
                  <span
                    v-if="previewItem(row.itemId)?.status === 'READY'"
                    class="block text-xs text-muted-foreground"
                    >受影响专家
                    {{ new Set(previewItem(row.itemId)?.experts.map((e) => e.expertId)).size }}
                    个</span
                  >
                </td>
                <td>
                  <AppButton link :disabled="locked" @click="remove(row.itemId)">移除</AppButton>
                  <label class="block text-xs"
                    >重新选择
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      class="w-40"
                      :disabled="locked"
                      :aria-label="`替换 ${row.file.name}`"
                      @change="replaceFile(row.itemId, $event)"
                    />
                  </label>
                </td>
              </tr>
              <tr v-if="previewItem(row.itemId)?.experts.length">
                <td colspan="6">
                  <details>
                    <summary class="cursor-pointer text-primary">
                      查看 {{ previewItem(row.itemId)?.skillName }} 的受影响专家
                    </summary>
                    <ul class="mt-2 space-y-1 text-sm">
                      <li
                        v-for="expert in previewItem(row.itemId)?.experts"
                        :key="`${expert.expertId}-${expert.source}-${expert.expertVersionId}-${expert.skillVersionId}`"
                      >
                        {{ expert.expertName }}（#{{ expert.expertId }}，{{
                          expertStatus(expert.expertStatus)
                        }}） ·
                        {{
                          expert.source === 'DRAFT'
                            ? '草稿，后续发布受影响'
                            : `专家版本 v${expert.expertVersionNo}`
                        }}
                        · {{ previewItem(row.itemId)?.skillName }}
                        {{ previewItem(row.itemId)?.currentVersion }} →
                        {{ previewItem(row.itemId)?.version }}
                      </li>
                    </ul>
                  </details>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-if="preview && !result" class="skill-import__notice">
        <p>
          可提交
          {{ preview.items.filter((item) => item.status !== 'INVALID').length }} 项；受影响专家共
          {{ preview.affectedExpertCount }} 个（按专家去重）。
        </p>
        <p v-if="mode === 'UPDATE'">
          更新成功后将停用对应旧版本，以下专家会受到影响。专家绑定保持原样，不会自动发布或升级。
        </p>
        <p v-if="mode === 'UPDATE' && !preview.affectedExpertCount">
          未发现依赖将被停用版本的专家。
        </p>
        <ul v-if="affectedExperts.length" class="mt-2 list-inside list-disc text-sm">
          <li v-for="expert in affectedExperts" :key="expert.id">
            {{ expert.name }}：{{ expert.skills.join('、') }}
          </li>
        </ul>
        <label v-if="mode === 'UPDATE'" class="mt-3 flex items-center gap-2 text-sm">
          <input
            v-model="confirmed"
            type="checkbox"
            :disabled="busy || !!pending"
          />已核对受影响专家，确认停用对应旧版本
        </label>
      </div>
      <div v-if="result" class="skill-import__notice" role="status">
        成功 {{ result.successCount }} 项，失败 {{ result.failedCount }} 项，跳过
        {{ result.skippedCount }} 项。
        <ul class="mt-2 text-sm">
          <li v-for="item in result.items" :key="item.itemId">
            {{ rows.find((row) => row.itemId === item.itemId)?.file.name || item.itemId }}：{{
              item.message
            }}
          </li>
        </ul>
      </div>
    </div>
    <template #footer>
      <AppButton @click="close">关闭</AppButton>
      <AppButton v-if="result?.complete && result.failedCount && rows.length" @click="retryFailed"
        >只重试失败项</AppButton
      >
      <AppButton v-if="result?.complete" @click="startNew">新建批次</AppButton>
      <AppButton
        v-if="preview?.items.some((item) => item.status === 'INVALID')"
        :disabled="locked"
        @click="keepValid"
        >仅保留有效项并重新预览</AppButton
      >
      <AppButton
        v-if="!result && !pending"
        :disabled="!canPreview"
        :loading="busy"
        @click="validate"
        >校验预览</AppButton
      >
      <AppButton v-if="pending" tone="primary" :loading="busy" @click="submit"
        >恢复提交结果</AppButton
      >
      <AppButton
        v-else-if="!result"
        tone="primary"
        :disabled="!canCommit || (mode === 'UPDATE' && !confirmed)"
        :loading="busy"
        @click="submit"
      >
        {{ mode === 'CREATE' ? '批量上传并启用' : '批量更新并启用' }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import { useSkillImport } from '@/composables/useSkillImport'
import type { Skill } from '@/types/domain'
import type { SkillImportMode, SkillImportSubmission } from '@/types/skill-import'

const props = defineProps<{
  modelValue: boolean
  initialMode: SkillImportMode
  skills: Skill[]
  selectedSkills: Skill[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  completed: [result: SkillImportSubmission]
}>()
const {
  mode,
  rows,
  preview,
  result,
  error,
  busy,
  pending,
  locked,
  canPreview,
  canCommit,
  open,
  invalidate,
  add,
  remove,
  replace,
  retryUploads,
  validate,
  submit,
  retryFailed,
  keepValid,
  cancelRequests,
  startNew,
} = useSkillImport((value) => emit('completed', value))
const commonVersion = ref('')
const confirmed = ref(false)
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) open(props.initialMode)
    else cancelRequests()
  },
  { immediate: true },
)
watch(preview, () => {
  confirmed.value = false
})
const affectedExperts = computed(() => {
  const experts = new Map<number, { id: number; name: string; skills: string[] }>()
  for (const item of preview.value?.items ?? [])
    for (const expert of item.experts) {
      let summary = experts.get(expert.expertId)
      if (!summary) {
        summary = { id: expert.expertId, name: expert.expertName, skills: [] }
        experts.set(expert.expertId, summary)
      }
      if (!summary.skills.includes(item.skillName)) summary.skills.push(item.skillName)
    }
  return [...experts.values()]
})
function previewItem(id: string) {
  return preview.value?.items.find((item) => item.itemId === id)
}
function itemMessage(id: string) {
  return result.value?.items.find((item) => item.itemId === id)?.message || previewItem(id)?.message
}
function itemFailed(id: string) {
  return (
    previewItem(id)?.status === 'INVALID' ||
    result.value?.items.find((item) => item.itemId === id)?.status === 'FAILED'
  )
}
function currentVersion(id: number | null) {
  return (
    props.skills
      .find((skill) => skill.id === id)
      ?.versions.find((version) => version.status === 'ACTIVE')?.version || '无'
  )
}
function expertStatus(value: string) {
  return (
    (
      { DRAFT: '草稿', PUBLISHED: '已发布', UNPUBLISHED: '已下架', DISABLED: '已禁用' } as Record<
        string,
        string
      >
    )[value] || value
  )
}
function applyVersion() {
  if (locked.value) return
  rows.value.forEach((row) => {
    row.version = commonVersion.value.trim()
  })
  invalidate()
}
async function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  await add(files, props.selectedSkills)
}
async function replaceFile(id: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await replace(id, file, props.selectedSkills)
}
async function drop(event: DragEvent) {
  await add(Array.from(event.dataTransfer?.files ?? []), props.selectedSkills)
}
function close() {
  cancelRequests()
  emit('update:modelValue', false)
}
</script>

<style scoped src="../../assets/styles/skill.management.scss"></style>
