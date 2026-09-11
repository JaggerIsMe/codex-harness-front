<template>
  <section class="data-card p-4">
    <div class="flex gap-3 mb-3">
      <AppButton :loading="loading" @click="load">刷新分配记录</AppButton
      ><span>仅展示当前管理员的分配记录</span>
    </div>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <p v-if="loading" role="status">加载中…</p>
    <table v-else class="w-full table-fixed text-sm">
      <thead>
        <tr>
          <th>Skill</th>
          <th>版本</th>
          <th>分配时间</th>
          <th>结果</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.batchId" class="border-t">
          <td class="py-3 break-words">
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
          <td>{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</td>
          <td>
            成功 {{ row.successCount }} / 失败 {{ row.failedCount }} / 跳过 {{ row.skippedCount }}
          </td>
          <td><AppButton link @click="details(row.batchId)">查看结果</AppButton></td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="5" class="py-8 text-center">暂无分配记录</td>
        </tr>
      </tbody>
    </table>
    <div class="flex items-center gap-3 mt-3">
      <AppButton :disabled="page <= 1 || loading" @click="changePage(-1)">上一页</AppButton
      ><span>第 {{ page }} 页</span
      ><AppButton :disabled="rows.length < 20 || loading" @click="changePage(1)">下一页</AppButton>
    </div>
    <AppDialog :model-value="detailOpen" title="专家分配结果" @close="detailOpen = false"
      ><p v-if="detailLoading">加载中…</p>
      <p v-if="detailError" role="alert">{{ detailError }}</p>
      <template v-if="detail"
        ><p>
          {{
            detail.targets?.map((t) => `${t.skillName} · ${t.version}`).join('、') ||
            `${detail.skillName} · ${detail.version}`
          }}
          ·
          {{ detail.complete ? '处理完成' : '尚未处理完成，可回到分配弹窗恢复提交' }}
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
import type { AssignmentHistory, AssignmentSubmission } from '@/types/skill-assignment'
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
