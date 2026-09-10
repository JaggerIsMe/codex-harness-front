<template>
  <section class="management-page">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">用户管理</h1>
        <p class="text-muted-foreground">管理账号、角色和可执行机器授权。</p>
      </div>
      <AppButton tone="primary" @click="invite = true">新增用户</AppButton>
    </div>
    <form class="my-5 flex flex-wrap gap-3" @submit.prevent="search">
      <div class="min-w-60 flex-1">
        <AppInput
          v-model="keyword"
          placeholder="搜索邮箱或显示名称"
          aria-label="搜索邮箱或显示名称"
        />
      </div>
      <div class="w-44">
        <AppSelect v-model="status" clearable placeholder="全部状态"
          ><option value="PENDING">待激活</option>
          <option value="ENABLED">已启用</option>
          <option value="DISABLED">禁用</option></AppSelect
        >
      </div>
      <AppButton tone="primary" @click="search">查询</AppButton
      ><AppButton @click="reset">重置</AppButton>
      <AppButton :loading="loading" @click="load">刷新状态</AppButton>
    </form>
    <p v-if="error" role="alert" class="mb-3 text-destructive">{{ error }}</p>
    <div class="w-full overflow-x-auto">
      <Table class="w-full"
        ><TableHeader
          ><TableRow>
            <TableHead>用户</TableHead><TableHead>角色</TableHead><TableHead>机器</TableHead
            ><TableHead>专家</TableHead><TableHead>状态</TableHead><TableHead>激活邮件</TableHead
            ><TableHead>最近登录</TableHead><TableHead class="min-w-96">操作</TableHead>
          </TableRow></TableHeader
        ><TableBody>
          <TableRow v-if="loading"
            ><TableCell :colspan="8" class="text-center">加载中…</TableCell></TableRow
          >
          <TableRow v-for="user in rows" :key="user.id">
            <TableCell
              ><strong>{{ user.displayName }}</strong>
              <p class="text-muted-foreground">{{ user.email }}</p></TableCell
            >
            <TableCell>{{ user.roles.includes('SYS_ADMIN') ? '管理员' : '普通用户' }}</TableCell>
            <TableCell>{{ user.deviceIds.length }} 台</TableCell>
            <TableCell>{{ user.expertIds.length }} 个</TableCell>
            <TableCell
              >{{ user.status === 'DISABLED' ? '已禁用' : user.activated ? '已启用' : '待激活' }}
              <p v-if="user.mustChangePassword" class="text-xs text-muted-foreground">
                待修改密码
              </p></TableCell
            >
            <TableCell>{{ emailStatus(user.activationEmailStatus) }}</TableCell>
            <TableCell>{{
              user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '尚未登录'
            }}</TableCell>
            <TableCell
              ><div class="flex flex-wrap gap-1">
                <AppButton link @click="edit(user)">编辑</AppButton>
                <AppButton link @click="select(user, 'role')">角色</AppButton>
                <AppButton link @click="select(user, 'devices')">分配机器</AppButton>
                <AppButton link @click="select(user, 'experts')">分配专家</AppButton>
                <AppButton
                  v-if="!user.activated && user.status === 'ENABLED'"
                  link
                  :disabled="busy !== null || resendRemaining(user.id) > 0"
                  @click="resend(user)"
                  >{{
                    resendRemaining(user.id) > 0
                      ? `${resendRemaining(user.id)} 秒后可重发`
                      : '重发激活邮件'
                  }}</AppButton
                >
                <AppButton
                  v-if="user.activated && user.status === 'ENABLED'"
                  link
                  @click="select(user, 'password')"
                  >重置密码</AppButton
                >
                <AppButton
                  link
                  :tone="user.status === 'ENABLED' ? 'danger' : 'primary'"
                  :disabled="busy !== null"
                  @click="toggle(user)"
                  >{{ user.status === 'ENABLED' ? '禁用' : '启用' }}</AppButton
                >
              </div></TableCell
            >
          </TableRow>
          <TableRow v-if="!loading && !rows.length"
            ><TableCell :colspan="8" class="text-center">暂无匹配用户</TableCell></TableRow
          >
        </TableBody></Table
      >
    </div>
    <div class="mt-4 flex items-center justify-end gap-3">
      <span>共 {{ total }} 人 · 第 {{ page }} 页</span
      ><AppButton :disabled="page === 1 || loading" @click="changePage(-1)">上一页</AppButton
      ><AppButton :disabled="page * 20 >= total || loading" @click="changePage(1)"
        >下一页</AppButton
      >
    </div>
    <UserEditorDialog v-model="editor" :user="selected" @saved="saved" />
    <UserInviteDialog v-model="invite" @saved="invited" />
    <UserRoleDialog v-model="roleDialog" :user="selected" @saved="saved" />
    <UserDevicesDialog v-model="devicesDialog" :user="selected" @saved="saved" />
    <UserExpertsDialog v-model="expertsDialog" :user="selected" @saved="saved" />
    <ResetPasswordDialog v-model="passwordDialog" :user="selected" @saved="saved" />
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { ManagedUser } from '@/types/domain'
import { getUsers, updateUser, resendUserActivation } from '@/api/user'
import { ApiError } from '@/api/request'
import { confirmAction } from '@/lib/confirm'
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
import UserEditorDialog from '@/components/user/UserEditorDialog.vue'
import UserInviteDialog from '@/components/user/UserInviteDialog.vue'
import UserRoleDialog from '@/components/user/UserRoleDialog.vue'
import UserDevicesDialog from '@/components/user/UserDevicesDialog.vue'
import UserExpertsDialog from '@/components/user/UserExpertsDialog.vue'
import ResetPasswordDialog from '@/components/user/ResetPasswordDialog.vue'
const rows = ref<ManagedUser[]>([]),
  selected = ref<ManagedUser | null>(null)
const keyword = ref(''),
  status = ref(''),
  error = ref('')
const filters = ref({ keyword: '', status: '' })
const page = ref(1),
  total = ref(0),
  busy = ref<number | null>(null)
const loading = ref(false),
  invite = ref(false),
  editor = ref(false),
  roleDialog = ref(false),
  devicesDialog = ref(false),
  expertsDialog = ref(false),
  passwordDialog = ref(false)
let revision = 0
const controller = new AbortController()
const cooldowns = ref<Record<number, number>>({})
const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, 1000)
function resendRemaining(id: number) {
  return Math.max(0, Math.ceil(((cooldowns.value[id] || 0) - now.value) / 1000))
}
function emailStatus(status: ManagedUser['activationEmailStatus']) {
  return status
    ? {
        PENDING: '待发送',
        PROCESSING: '发送中',
        SENT: '已提交邮件服务器',
        FAILED: '发送失败',
        CANCELLED: '已取消',
      }[status]
    : '—'
}
function invited() {
  toast.success('用户已创建，激活邮件待发送')
  void load()
}
async function resend(user: ManagedUser) {
  if (busy.value !== null || resendRemaining(user.id)) return
  busy.value = user.id
  try {
    const result = await resendUserActivation(user.id, controller.signal)
    if (controller.signal.aborted) return
    cooldowns.value[user.id] = Date.now() + result.data.retryAfterSeconds * 1000
    toast.success('激活邮件待发送，请刷新查看发送状态')
    void load()
  } catch (cause) {
    if (controller.signal.aborted) return
    if (cause instanceof ApiError && cause.retryAfterSeconds)
      cooldowns.value[user.id] = Date.now() + cause.retryAfterSeconds * 1000
    error.value = cause instanceof Error ? cause.message : '重发失败'
  } finally {
    busy.value = null
  }
}
async function load() {
  const current = ++revision
  loading.value = true
  error.value = ''
  try {
    const result = await getUsers(
      filters.value.keyword,
      filters.value.status,
      page.value,
      controller.signal,
    )
    if (current === revision) {
      rows.value = result.data.items
      total.value = result.data.total
    }
  } catch (cause) {
    if (current === revision) error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    if (current === revision) loading.value = false
  }
}
function search() {
  filters.value = { keyword: keyword.value.trim(), status: status.value }
  page.value = 1
  void load()
}
function reset() {
  keyword.value = ''
  status.value = ''
  search()
}
function changePage(step: number) {
  page.value += step
  void load()
}
function edit(user: ManagedUser) {
  selected.value = user
  editor.value = true
}
function select(user: ManagedUser, kind: 'role' | 'devices' | 'experts' | 'password') {
  selected.value = user
  if (kind === 'role') roleDialog.value = true
  else if (kind === 'devices') devicesDialog.value = true
  else if (kind === 'experts') expertsDialog.value = true
  else passwordDialog.value = true
}
function saved() {
  toast.success('操作成功')
  void load()
}
async function toggle(user: ManagedUser) {
  if (busy.value !== null) return
  const next = user.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  if (
    !(await confirmAction(
      `确认${next === 'DISABLED' ? '禁用' : '启用'}用户 ${user.email}？旧登录凭证将失效。`,
      '更改用户状态',
    ))
  )
    return
  busy.value = user.id
  try {
    await updateUser(user.id, { displayName: user.displayName, status: next }, controller.signal)
    if (controller.signal.aborted) return
    saved()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败'
  } finally {
    busy.value = null
  }
}
onMounted(load)
onBeforeUnmount(() => {
  revision += 1
  controller.abort()
  clearInterval(timer)
})
</script>
