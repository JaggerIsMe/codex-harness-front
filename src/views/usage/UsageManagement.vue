<template>
  <div class="management-page usage-page">
    <section class="page-toolbar">
      <div>
        <span class="page-kicker">MANAGED MODEL USAGE</span>
        <h2>模型用量与额度</h2>
        <p>按配置价格核算托管模型费用，预算周期采用北京时间。</p>
      </div>
      <div class="flex gap-2">
        <AppButton v-if="canPrice" @click="priceOpen = true" :disabled="!versions.length"
          >设置模型价格</AppButton
        ><AppButton v-if="admin && selectedUser" @click="quotaOpen = true">设置用户预算</AppButton>
      </div>
    </section>
    <section class="data-card">
      <form class="grid gap-3 md:grid-cols-3" @submit.prevent="search">
        <div v-if="admin" class="grid gap-2">
          <label
            >查找用户<AppInput
              v-model="userKeyword"
              placeholder="邮箱或显示名称"
              @keyup.enter.stop.prevent="findUsers"
          /></label>
          <AppButton :loading="finding" @click="findUsers">查找用户</AppButton>
          <AppSelect v-model="selectedUser" clearable placeholder="全部用户" @change="search"
            ><option v-for="u in users" :key="u.id" :value="String(u.id)">
              {{ u.displayName }} · {{ u.email }}
            </option></AppSelect
          >
        </div>
        <label
          >模型配置版本 ID<AppInput
            v-model="modelVersion"
            placeholder="全部模型版本"
            type="number"
            min="1"
        /></label>
        <label
          >项目 ID<AppInput v-model="projectId" placeholder="全部项目" type="number" min="1"
        /></label>
        <label
          >Turn ID<AppInput v-model="turnId" placeholder="全部 Turn" type="number" min="1"
        /></label>
        <label>开始日期<AppInput v-model="start" type="date" /></label>
        <label>结束日期<AppInput v-model="end" type="date" /></label>
        <label
          >结算状态<AppSelect v-model="state" clearable placeholder="全部状态"
            ><option value="SETTLED">已结算</option>
            <option value="RESERVED">预占中</option>
            <option value="PENDING">待核实</option>
            <option value="RELEASED">已释放</option></AppSelect
          ></label
        >
        <div class="flex gap-2">
          <AppButton tone="primary" :loading="loading" type="submit">查询</AppButton
          ><AppButton :disabled="loading" @click="load">刷新</AppButton>
        </div>
      </form>
      <p v-if="error" role="alert" class="mt-3 text-destructive">{{ error }}</p>
      <p v-if="optionError" role="alert" class="mt-3 text-destructive">{{ optionError }}</p>
    </section>
    <section v-if="summary" class="grid gap-4 md:grid-cols-2" aria-label="当前用户预算">
      <div v-for="b in summary.buckets" :key="b.period" class="data-card">
        <h3>{{ b.period.length === 7 ? '本月预算' : '今日预算' }} · {{ selectedLabel }}</h3>
        <div class="my-3 text-2xl font-semibold">
          {{ money(b.remaining) }}
          <span class="text-sm font-normal">可用 / {{ money(b.budget) }} 预算</span>
        </div>
        <p>已结算 ¥{{ money(b.spent) }} · 预占 ¥{{ money(b.reserved) }}</p>
        <p v-if="b.alert !== 'NONE'" role="alert" class="mt-2 text-destructive">
          {{
            b.alert === 'EXHAUSTED'
              ? '预算已耗尽，新的模型请求将被阻止。'
              : '预算使用（含预占）已达到 80%。'
          }}
        </p>
      </div>
    </section>
    <section class="grid gap-4 md:grid-cols-4" aria-label="筛选范围统计">
      <div class="data-card">
        <p>已核算费用</p>
        <strong class="text-2xl">¥{{ money(totals.cost) }}</strong>
      </div>
      <div class="data-card">
        <p>输入 token / 其中缓存</p>
        <strong>{{ totals.input.toLocaleString() }} / {{ totals.cached.toLocaleString() }}</strong>
      </div>
      <div class="data-card">
        <p>输出 token</p>
        <strong class="text-2xl">{{ totals.output.toLocaleString() }}</strong>
      </div>
      <div class="data-card">
        <p>未结算请求</p>
        <strong class="text-2xl">{{ totals.pending }}</strong>
      </div>
    </section>
    <section class="data-card">
      <h3 class="mb-3">请求明细</h3>
      <div class="table-area">
        <Table
          ><TableHeader
            ><TableRow
              ><TableHead>时间（北京时间）/ 用户</TableHead><TableHead>模型 / Turn</TableHead
              ><TableHead>输入 / 缓存 / 输出</TableHead><TableHead>费用（元）</TableHead
              ><TableHead>状态</TableHead><TableHead v-if="admin">操作</TableHead></TableRow
            ></TableHeader
          >
          <TableBody>
            <TableRow v-if="loading"
              ><TableCell :colspan="admin ? 6 : 5">加载中…</TableCell></TableRow
            >
            <TableRow v-for="r in data?.records ?? []" :key="r.requestId">
              <TableCell
                ><div>{{ timestamp(r.createdAt) }}</div>
                <AppButton v-if="admin" link @click="selectUser(r.userId)">{{
                  r.displayName || r.userId
                }}</AppButton
                ><span v-else>{{ r.displayName }}</span></TableCell
              >
              <TableCell
                ><div>{{ r.modelName }} · vID {{ r.modelVersionId }}</div>
                <span
                  >项目 {{ r.projectId ?? '—' }} · Turn {{ r.turnId }} · Device
                  {{ r.deviceId }}</span
                ></TableCell
              >
              <TableCell
                >{{ r.inputTokens ?? '未知' }} / {{ r.cachedTokens ?? '未知' }} /
                {{ r.outputTokens ?? '未知' }}</TableCell
              >
              <TableCell
                >{{ r.cost == null ? '待核实' : money(r.cost) }}
                <div
                  v-if="r.state === 'RESERVED' || r.state === 'PENDING'"
                  class="text-muted-foreground"
                >
                  预占 {{ money(r.reservedAmount) }}
                </div></TableCell
              >
              <TableCell>{{ states[r.state] }}</TableCell>
              <TableCell v-if="admin"
                ><AppButton
                  v-if="r.state === 'PENDING' || r.state === 'RESERVED'"
                  link
                  @click="openResolve(r)"
                  >核实</AppButton
                ></TableCell
              >
            </TableRow>
            <TableRow v-if="!loading && !data?.records.length"
              ><TableCell :colspan="admin ? 6 : 5">暂无用量记录</TableCell></TableRow
            >
          </TableBody>
        </Table>
      </div>
      <div class="mt-4 flex items-center gap-3">
        <span>共 {{ data?.total ?? 0 }} 条 · 第 {{ page }} 页</span
        ><AppButton :disabled="loading || page <= 1" @click="changePage(-1)">上一页</AppButton
        ><AppButton :disabled="loading || page * 30 >= (data?.total ?? 0)" @click="changePage(1)"
          >下一页</AppButton
        >
      </div>
    </section>
    <details class="data-card">
      <summary class="cursor-pointer">每日用量</summary>
      <Table
        ><TableHeader
          ><TableRow
            ><TableHead>日期</TableHead><TableHead>请求数</TableHead
            ><TableHead>输入 token</TableHead><TableHead>输出 token</TableHead
            ><TableHead>费用（元）</TableHead></TableRow
          ></TableHeader
        >
        <TableBody
          ><TableRow v-for="d in data?.daily ?? []" :key="d.dimension"
            ><TableCell>{{ d.dimension }}</TableCell
            ><TableCell>{{ d.requests }}</TableCell
            ><TableCell>{{ d.inputTokens }}</TableCell
            ><TableCell>{{ d.outputTokens }}</TableCell
            ><TableCell>{{ money(d.cost) }}</TableCell></TableRow
          ></TableBody
        >
      </Table>
    </details>
    <details v-if="canPrice" class="data-card">
      <summary class="cursor-pointer">当前模型价格（CNY / 百万 token）</summary>
      <p class="my-2 text-sm text-muted-foreground">
        未设置价格的模型版本将阻止调用。价格只适用于输入、缓存输入和输出。
      </p>
      <Table
        ><TableHeader
          ><TableRow
            ><TableHead>模型版本</TableHead><TableHead>未命中输入</TableHead
            ><TableHead>缓存输入</TableHead><TableHead>输出</TableHead
            ><TableHead>输出上限</TableHead></TableRow
          ></TableHeader
        ><TableBody
          ><TableRow v-for="p in prices" :key="p.id"
            ><TableCell>{{ p.modelName }} · {{ p.modelVersionId }}</TableCell
            ><TableCell>{{ p.inputRate }}</TableCell
            ><TableCell>{{ p.cachedRate }}</TableCell
            ><TableCell>{{ p.outputRate }}</TableCell
            ><TableCell>{{ p.maxOutputTokens }}</TableCell></TableRow
          ></TableBody
        ></Table
      >
    </details>
    <PriceEditDialog
      v-model="priceOpen"
      :versions="versions"
      :prices="prices"
      @saved="loadOptions"
    />
    <QuotaEditDialog
      v-model="quotaOpen"
      :user-id="selectedUser || null"
      :user-label="selectedLabel"
      @saved="load"
    />
    <UsageResolveDialog v-model="resolveOpen" :record="resolveRecord" @saved="load" />
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import PriceEditDialog from '@/components/usage/PriceEditDialog.vue'
import QuotaEditDialog from '@/components/usage/QuotaEditDialog.vue'
import UsageResolveDialog from '@/components/usage/UsageResolveDialog.vue'
import { getUsagePrices, getUsageRecords, getUsageSummary } from '@/api/usage'
import { listSelectableModelVersions } from '@/api/model'
import { getUsers } from '@/api/user'
import type { Amount, UsagePage, UsagePrice, UsageSummary, UsageRecord } from '@/types/usage'
import type { Id, ManagedUser } from '@/types/domain'
import type { ModelSelectableVersion } from '@/types/model'
const auth = useAuthStore()
const admin = computed(() => auth.can('system:user:manage')),
  canPrice = computed(() => auth.can('model:manage'))
const selectedUser = ref(''),
  userKeyword = ref(''),
  modelVersion = ref(''),
  turnId = ref(''),
  projectId = ref(''),
  start = ref(''),
  end = ref(''),
  state = ref('')
const data = ref<UsagePage | null>(null),
  summary = ref<UsageSummary | null>(null)
const users = ref<ManagedUser[]>([]),
  versions = ref<ModelSelectableVersion[]>([]),
  prices = ref<UsagePrice[]>([])
const loading = ref(false),
  finding = ref(false),
  error = ref(''),
  optionError = ref(''),
  page = ref(1)
const priceOpen = ref(false),
  quotaOpen = ref(false),
  resolveOpen = ref(false),
  resolveRecord = ref<UsageRecord | null>(null)
const states: Record<UsageRecord['state'], string> = {
  RESERVED: '预占中',
  PENDING: '待核实',
  SETTLED: '已结算',
  RELEASED: '已释放',
}
const selectedLabel = computed(
  () =>
    users.value.find((u) => String(u.id) === selectedUser.value)?.displayName ||
    (selectedUser.value ? '用户 ' + selectedUser.value : '我的额度'),
)
const totals = computed(() =>
  (data.value?.daily ?? []).reduce(
    (sum, d) => ({
      cost: sum.cost + Number(d.cost),
      input: sum.input + Number(d.inputTokens),
      cached: sum.cached + Number(d.cachedTokens),
      output: sum.output + Number(d.outputTokens),
      pending: sum.pending + Number(d.pending),
    }),
    { cost: 0, input: 0, cached: 0, output: 0, pending: 0 },
  ),
)
const money = (n: Amount | null) =>
  n == null ? '不限额' : Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 6 })
const timestamp = (value: string) =>
  new Date(value.endsWith('Z') ? value : value + 'Z').toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  })
let controller: AbortController | null = null
let optionsController: AbortController | null = null
let usersController: AbortController | null = null
async function load() {
  controller?.abort()
  const active = new AbortController()
  controller = active
  loading.value = true
  error.value = ''
  data.value = null
  summary.value = null
  try {
    const query = {
      allUsers: admin.value && !selectedUser.value,
      userId: selectedUser.value || undefined,
      modelVersionId: modelVersion.value || undefined,
      turnId: turnId.value || undefined,
      projectId: projectId.value || undefined,
      start: start.value || undefined,
      end: end.value || undefined,
      state: state.value,
      page: page.value,
    }
    const [records, quota] = await Promise.all([
      getUsageRecords(query, active.signal),
      !admin.value || selectedUser.value
        ? getUsageSummary(selectedUser.value || undefined, active.signal)
        : Promise.resolve(null),
    ])
    if (active.signal.aborted) return
    data.value = records.data
    summary.value = quota?.data ?? null
  } catch (e) {
    if (!active.signal.aborted) error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    if (!active.signal.aborted) loading.value = false
  }
}
function search() {
  page.value = 1
  void load()
}
function openResolve(record: UsageRecord) {
  resolveRecord.value = record
  resolveOpen.value = true
}
function changePage(delta: number) {
  page.value += delta
  void load()
}
function selectUser(id: Id) {
  selectedUser.value = String(id)
  search()
}
async function findUsers() {
  usersController?.abort()
  const active = new AbortController()
  usersController = active
  finding.value = true
  optionError.value = ''
  try {
    const result = await getUsers(userKeyword.value, '', 1, active.signal)
    if (!active.signal.aborted) users.value = result.data.items
  } catch (e) {
    if (!active.signal.aborted) optionError.value = e instanceof Error ? e.message : '用户查询失败'
  } finally {
    if (!active.signal.aborted) finding.value = false
  }
}
async function loadOptions() {
  if (!canPrice.value) return
  optionsController?.abort()
  const active = new AbortController()
  optionsController = active
  optionError.value = ''
  try {
    const [p, v] = await Promise.all([
      getUsagePrices(active.signal),
      listSelectableModelVersions(active.signal),
    ])
    if (active.signal.aborted) return
    prices.value = p.data
    versions.value = v.data
  } catch (e) {
    if (!active.signal.aborted)
      optionError.value = e instanceof Error ? e.message : '模型选项加载失败'
  }
}
onMounted(() => {
  void load()
  void loadOptions()
  if (admin.value) void findUsers()
})
onBeforeUnmount(() => {
  controller?.abort()
  optionsController?.abort()
  usersController?.abort()
})
</script>
<style scoped src="../../assets/styles/usage.scss"></style>
