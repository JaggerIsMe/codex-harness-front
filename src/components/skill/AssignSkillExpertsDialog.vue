<template>
  <AppDialog
    :model-value="modelValue"
    :title="batchMode ? '批量分配 Skill 给专家' : '分配 Skill 给专家'"
    width="1000px"
    @close="close"
  >
    <p class="text-sm text-muted-foreground">
      分配将更新专家草稿，管理员发布后再按项目升级流程生效。替换仅针对所选 Skill。
    </p>
    <p v-if="error" role="alert" class="my-3 text-destructive">{{ error }}</p>
    <p v-if="pending" role="status" class="my-3">存在待确认的分配，请恢复提交结果。</p>
    <div v-if="batchMode" class="my-3">
      <p class="mb-2 text-sm">
        已选 {{ versionIds.length }} 个 Skill。如需调整，请关闭弹窗后在 Skill 列表重新勾选。
      </p>
      <ul aria-label="本次分配的 Skill" class="max-h-60 overflow-y-auto grid gap-3 sm:grid-cols-2">
        <li
          v-for="target in selectedTargets"
          :key="target.versionId"
          class="min-w-0 break-words rounded border p-3"
        >
          {{ target.skillName }} · {{ target.version }}
        </li>
      </ul>
    </div>
    <label v-else class="block my-3"
      >Skill 版本
      <select
        v-model="versionId"
        aria-label="Skill 版本"
        class="skill-import__input"
        :disabled="locked"
        @change="changeVersion"
      >
        <option :value="null">请选择已激活版本</option>
        <optgroup v-for="skill in availableSkills" :key="skill.id" :label="skill.skillName">
          <option
            v-for="version in skill.versions.filter((v) => v.status === 'ACTIVE')"
            :key="version.id"
            :value="version.id"
          >
            {{ skill.skillName }} · {{ version.version }}
          </option>
        </optgroup>
      </select>
    </label>
    <template v-if="!pending && !result">
      <form class="flex gap-2 my-3" @submit.prevent="search(1)">
        <AppInput v-model="keyword" placeholder="搜索专家名称" maxlength="128" :disabled="locked" />
        <AppButton :disabled="locked || !hasTargets" @click="search(1)">搜索</AppButton>
      </form>
      <p class="text-sm mb-2">
        已选 {{ selected.length }} 位，最多 50
        位。已绑定全部目标版本和已禁用的专家不在候选列表中。同一专家的所选 Skill 一起保存。
      </p>
      <p v-if="loading" role="status">正在加载专家…</p>
      <table v-else class="w-full table-fixed text-sm">
        <thead>
          <tr>
            <th class="w-10">
              <input
                type="checkbox"
                aria-label="选择当前页专家"
                :disabled="locked || !candidates.length"
                :checked="allSelected"
                @change="selectPage"
              />
            </th>
            <th>专家</th>
            <th>草稿版本</th>
            <th>发布版本中的绑定</th>
            <th>本次操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in candidates" :key="item.expertId" class="border-t">
            <td class="py-3">
              <input
                type="checkbox"
                :aria-label="`选择 ${item.name}`"
                :disabled="locked || item.action === 'BLOCKED'"
                :checked="selected.some((s) => s.expertId === item.expertId)"
                @change="toggle(item, ($event.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="break-words">
              {{ item.name }}<small class="block">{{ statusLabel(item.status) }}</small>
            </td>
            <td class="break-words">
              <template v-if="batchMode"
                ><div v-for="change in item.changes" :key="change.skillId">
                  {{ change.skillName }}：{{ change.draftVersion || '未绑定' }} →
                  {{ change.version }}（{{ actionLabel(change.action) }}）
                </div></template
              ><template v-else>{{ item.draftVersion || '未绑定' }}</template>
            </td>
            <td class="break-words">
              <template v-if="batchMode"
                ><div v-for="change in item.changes" :key="change.skillId">
                  {{ change.skillName }}：{{ change.publishedVersion || '未绑定' }}
                </div></template
              ><template v-else>{{ item.publishedVersion || '未绑定' }}</template>
            </td>
            <td>{{ item.reason || actionLabel(item.action) }}</td>
          </tr>
          <tr v-if="!candidates.length">
            <td colspan="5" class="py-5 text-center">
              {{ hasTargets ? '没有可分配的专家' : '请先选择 Skill 版本' }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="flex items-center gap-3 my-3">
        <AppButton :disabled="page <= 1 || loading || locked" @click="search(page - 1)"
          >上一页</AppButton
        ><span>第 {{ page }} 页，共 {{ total }} 位</span
        ><AppButton :disabled="page * 20 >= total || loading || locked" @click="search(page + 1)"
          >下一页</AppButton
        >
      </div>
      <div v-if="selected.length" class="flex flex-wrap gap-2 text-sm">
        <AppButton
          v-for="item in selected"
          :key="item.expertId"
          :disabled="locked"
          @click="toggle(item, false)"
          >{{ item.name }} ×</AppButton
        >
      </div>
      <div v-if="preview" class="skill-import__notice mt-4">
        <strong>{{
          batchMode
            ? `确认批量分配 ${preview.targets?.length ?? versionIds.length} 个 Skill`
            : `确认分配 ${preview.skillName} · ${preview.version}`
        }}</strong>
        <ul class="my-3">
          <li v-for="item in preview.items" :key="item.expertId">
            <template v-if="batchMode"
              ><strong>{{ item.name }}</strong
              ><span v-if="item.reason">：{{ item.reason }}</span>
              <div v-for="change in item.changes" :key="change.skillId" class="ml-3 break-words">
                {{ change.skillName }}：{{ change.draftVersion || '未绑定' }} →
                {{ change.version }}（{{ actionLabel(change.action) }}）；发布版本绑定：{{
                  change.publishedVersion || '未绑定'
                }}
              </div></template
            >
            <template v-else
              >{{ item.name }}：{{ item.draftVersion || '未绑定' }} → {{ preview.version }}（{{
                item.reason || actionLabel(item.action)
              }}）</template
            >
          </li>
        </ul>
        <label class="flex gap-2"
          ><input
            v-model="confirmed"
            type="checkbox"
            :disabled="busy"
          />已核对新增与替换内容，确认更新专家草稿</label
        >
      </div>
    </template>
    <div v-if="result" role="status" class="skill-import__notice my-3">
      <strong>{{
        (result.targets?.length ?? 1) > 1
          ? `${result.targets!.length} 个 Skill 批量分配结果`
          : `${result.skillName} · ${result.version} 分配结果`
      }}</strong>
      <ul>
        <li v-for="item in result.items" :key="item.expertId">
          {{ item.name }}：{{ item.message }}
          <div v-for="change in item.changes" :key="change.skillId" class="ml-3 break-words">
            {{ change.skillName }}：{{ change.draftVersion || '未绑定' }} → {{ change.version }}（{{
              item.status === 'FAILED' ? '未执行' : actionLabel(change.action)
            }}）
          </div>
        </li>
      </ul>
    </div>
    <template #footer>
      <AppButton @click="close">关闭</AppButton>
      <AppButton
        v-if="result?.complete && preview && result.items.some((i) => i.status === 'FAILED')"
        @click="retryFailed"
        >只重试失败项</AppButton
      >
      <AppButton v-if="result?.complete" @click="startNew">新建分配</AppButton>
      <AppButton v-if="pending" tone="primary" :loading="busy" @click="submit"
        >恢复提交结果</AppButton
      >
      <template v-else-if="!result"
        ><AppButton :disabled="locked || !selected.length" :loading="busy" @click="validate"
          >预览分配</AppButton
        ><AppButton
          tone="primary"
          :disabled="
            locked || !confirmed || !preview || preview.items.some((i) => i.action === 'BLOCKED')
          "
          :loading="busy"
          @click="submit"
          >确认分配</AppButton
        ></template
      >
    </template>
  </AppDialog>
</template>
<script setup lang="ts">
import { computed, watch } from 'vue'
import type { Skill } from '@/types/domain'
import type { AssignmentAction } from '@/types/skill-assignment'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import { useSkillExpertAssignment } from '@/composables/useSkillExpertAssignment'
const props = defineProps<{
  modelValue: boolean
  skills: Skill[]
  initialVersionId: number | null
  initialVersionIds?: number[]
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; completed: [] }>()
const {
  batchMode,
  versionIds,
  hasTargets,
  versionId,
  keyword,
  page,
  total,
  candidates,
  selected,
  preview,
  result,
  confirmed,
  busy,
  loading,
  error,
  pending,
  locked,
  open,
  search,
  changeVersion,
  toggle,
  validate,
  submit,
  startNew,
  retryFailed,
  cancel,
} = useSkillExpertAssignment(
  () => props.skills,
  () => emit('completed'),
)
const availableSkills = computed(() =>
  props.skills.filter(
    (s) => s.status === 'ENABLED' && s.versions.some((v) => v.status === 'ACTIVE'),
  ),
)
const selectedTargets = computed(
  () =>
    result.value?.targets ??
    preview.value?.targets ??
    versionIds.value.map((id) => {
      const skill = props.skills.find((s) => s.versions.some((v) => v.id === id))
      const version = skill?.versions.find((v) => v.id === id)
      return {
        versionId: id,
        skillName: skill?.skillName ?? `Skill 版本 #${id}`,
        version: version?.version ?? '未知版本',
      }
    }),
)
const allSelected = computed(
  () =>
    candidates.value.some((i) => i.action !== 'BLOCKED') &&
    candidates.value
      .filter((i) => i.action !== 'BLOCKED')
      .every((i) => selected.value.some((s) => s.expertId === i.expertId)),
)
function selectPage(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  candidates.value.forEach((i) => toggle(i, checked))
}
function actionLabel(action: AssignmentAction) {
  return { ADD: '新增绑定', REPLACE: '替换版本', SKIP: '已绑定，跳过', BLOCKED: '不可分配' }[action]
}
function statusLabel(status: string) {
  return (
    (
      { DRAFT: '草稿', PUBLISHED: '已发布', UNPUBLISHED: '已下架', DISABLED: '已禁用' } as Record<
        string,
        string
      >
    )[status] || status
  )
}
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) void open(props.initialVersionId, props.initialVersionIds)
    else cancel()
  },
  { immediate: true },
)
function close() {
  cancel()
  emit('update:modelValue', false)
}
</script>
<style scoped src="../../assets/styles/skill.management.scss"></style>
