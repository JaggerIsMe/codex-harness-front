<template>
  <section class="data-card p-4">
    <div class="flex flex-wrap gap-3 mb-3">
      <AppButton :loading="loading" @click="load">刷新分配记录</AppButton
      ><span>展示全部管理员已提交的分配记录</span>
    </div>
    <p class="mb-3 text-sm text-muted-foreground">
      结果分别按专家和 Skill 绑定统计；一个 Skill
      分配给一位专家计一项绑定。成功表示草稿已更新，仍需发布。
    </p>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="loading" role="status">加载中…</p>
    <table v-else class="skill-assignment-history__table w-full table-fixed text-sm">
      <thead>
        <tr>
          <th class="w-[20%]">Skill</th>
          <th class="w-[8%]">版本</th>
          <th class="w-[13%]">操作人</th>
          <th class="w-[17%]">分配时间</th>
          <th class="w-[32%]">结果</th>
          <th class="w-[10%]">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.batchId" class="border-t">
          <td class="break-words">
            <template v-if="row.targets?.length"
              ><div v-for="target in row.targets" :key="target.skillId">
                {{ target.skillName }}
              </div></template
            ><template v-else>{{ row.skillName }}</template>
          </td>
          <td>
            <template v-if="row.targets?.length"
              ><div v-for="target in row.targets" :key="target.skillId">
                {{ target.version }}
              </div></template
            ><template v-else>{{ row.version }}</template>
          </td>
          <td>
            {{ row.ownerName || '--'
            }}<small v-if="row.ownerId" class="block text-muted-foreground"
              >#{{ row.ownerId }}</small
            >
          </td>
          <td>{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</td>
          <td>
            <strong
              v-if="row.complete !== undefined"
              class="block"
              :class="row.complete ? '' : 'text-amber-700'"
              >{{ row.complete ? '处理完成' : '未完成' }}</strong
            >
            <div v-if="row.expertResults">
              专家（{{ row.expertResults.total }} 位）：{{ formatCounts(row.expertResults) }}
            </div>
            <div v-else>
              专家：成功 {{ row.successCount }} / 失败 {{ row.failedCount }} / 跳过
              {{ row.skippedCount }}
            </div>
            <div v-if="row.bindingResults">
              Skill 绑定（{{ row.bindingResults.total }} 项）：{{
                formatCounts(row.bindingResults)
              }}
            </div>
          </td>
          <td>
            <AppButton link class="h-auto px-0 py-0" @click="details(row.batchId)"
              >查看结果</AppButton
            >
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="6" class="py-8 text-center">暂无分配记录</td>
        </tr>
      </tbody>
    </table>
    <div class="flex items-center gap-3 mt-3">
      <AppButton :disabled="page <= 1 || loading" @click="changePage(-1)">上一页</AppButton
      ><span>第 {{ page }} 页</span
      ><AppButton :disabled="rows.length < 20 || loading" @click="changePage(1)">下一页</AppButton>
    </div>
    <AppDialog
      :model-value="detailOpen"
      title="专家分配结果"
      width="800px"
      @close="detailOpen = false"
      ><p v-if="detailLoading">加载中…</p>
      <p v-if="detailError" role="alert">{{ detailError }}</p>
      <template v-if="detail"
        ><p>
          {{
            detail.targets?.map((t) => `${t.skillName} · ${t.version}`).join('、') ||
            `${detail.skillName} · ${detail.version}`
          }}
          ·
          {{
            detail.complete
              ? '处理完成'
              : detail.canResume
                ? '尚未处理完成，可回到分配弹窗恢复提交'
                : '尚未处理完成，请由原操作人恢复提交；超过恢复期限需重新预览分配'
          }}
        </p>
        <p class="my-2">
          操作人：{{ detail.ownerName || '--'
          }}<span v-if="detail.ownerId">（#{{ detail.ownerId }}）</span>
        </p>
        <p v-if="detail.expertResults">
          专家（{{ detail.expertResults.total }} 位）：{{ formatCounts(detail.expertResults) }}
        </p>
        <p v-if="detail.bindingResults" class="mb-3">
          Skill 绑定（{{ detail.bindingResults.total }} 项）：{{
            formatCounts(detail.bindingResults)
          }}
        </p>
        <ul>
          <li v-for="item in detail.items" :key="item.expertId">
            {{ item.name }}：{{ item.message }}
            <div v-for="change in item.changes" :key="change.skillId" class="ml-3 break-words">
              {{ change.skillName }}：{{ change.draftVersion || '未绑定' }} →
              {{ change.version }}（{{
                item.status === 'FAILED'
                  ? '未执行'
                  : change.action === 'SKIP'
                    ? '已绑定，跳过'
                    : change.action === 'REPLACE'
                      ? '替换版本'
                      : '新增绑定'
              }}）
            </div>
          </li>
        </ul></template
      ></AppDialog
    >
  </section>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import { listAssignments, getAssignment } from '@/api/skill-assignment'
import type {
  AssignmentCounts,
  AssignmentHistory,
  AssignmentSubmission,
} from '@/types/skill-assignment'
const props = defineProps<{ revision: number }>()
const rows = ref<AssignmentHistory[]>([]),
  page = ref(1),
  loading = ref(false),
  error = ref('')
const detail = ref<AssignmentSubmission | null>(null),
  detailOpen = ref(false),
  detailLoading = ref(false),
  detailError = ref('')
let query: AbortController | null = null,
  detailQuery: AbortController | null = null
function formatCounts(counts: AssignmentCounts) {
  return `成功 ${counts.successCount} / 失败 ${counts.failedCount} / 跳过 ${counts.skippedCount} / 待处理 ${counts.pendingCount}`
}
async function load() {
  query?.abort()
  const current = new AbortController()
  query = current
  loading.value = true
  error.value = ''
  try {
    const response = await listAssignments(page.value, current.signal)
    if (!current.signal.aborted) rows.value = response.data
  } catch (cause) {
    if (!current.signal.aborted) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (query === current) loading.value = false
  }
}
async function details(id: string) {
  detailQuery?.abort()
  const current = new AbortController()
  detailQuery = current
  detail.value = null
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  try {
    const response = await getAssignment(id, current.signal)
    if (!current.signal.aborted) detail.value = response.data
  } catch (cause) {
    if (!current.signal.aborted)
      detailError.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (detailQuery === current) detailLoading.value = false
  }
}
function changePage(delta: number) {
  page.value += delta
  void load()
}
watch(
  () => props.revision,
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
watch(detailOpen, (value) => {
  if (!value) detailQuery?.abort()
})
onBeforeUnmount(() => {
  query?.abort()
  detailQuery?.abort()
})
</script>
<style scoped src="../../assets/styles/skill.management.scss"></style>
