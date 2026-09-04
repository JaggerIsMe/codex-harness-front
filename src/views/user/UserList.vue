<template>
  <section class="management-page">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">用户管理</h1>
        <p class="text-muted-foreground">管理账号、角色和可执行机器授权。</p>
      </div>
      <AppButton tone="primary" @click="edit(null)">新增用户</AppButton>
    </div>
    <form class="my-5 flex flex-wrap gap-3" @submit.prevent="search">
      <div class="min-w-60 flex-1">
        <AppInput
          v-model="keyword"
          placeholder="搜索用户名或显示名称"
          aria-label="搜索用户名或显示名称"
        />
      </div>
      <div class="w-44">
        <AppSelect v-model="status" clearable placeholder="全部状态"
          ><option value="ENABLED">启用</option>
          <option value="DISABLED">禁用</option></AppSelect
        >
      </div>
      <AppButton tone="primary" @click="search">查询</AppButton
      ><AppButton @click="reset">重置</AppButton>
    </form>
    <p v-if="error" role="alert" class="mb-3 text-destructive">{{ error }}</p>
    <div class="w-full overflow-x-auto">
      <Table class="w-full"
        ><TableHeader
          ><TableRow>
            <TableHead>用户</TableHead><TableHead>角色</TableHead><TableHead>机器</TableHead
            ><TableHead>状态</TableHead><TableHead>最近登录</TableHead
            ><TableHead class="min-w-96">操作</TableHead>
          </TableRow></TableHeader
        ><TableBody>
          <TableRow v-if="loading"
            ><TableCell :colspan="6" class="text-center">加载中…</TableCell></TableRow
          >
          <TableRow v-for="user in rows" :key="user.id">
            <TableCell
              ><strong>{{ user.displayName }}</strong>
              <p class="text-muted-foreground">{{ user.username }}</p></TableCell
            >
            <TableCell>{{ user.roles.includes('SYS_ADMIN') ? '管理员' : '普通用户' }}</TableCell>
            <TableCell>{{ user.deviceIds.length }} 台</TableCell>
            <TableCell
              >{{ user.status === 'ENABLED' ? '启用' : '禁用' }}
              <p v-if="user.mustChangePassword" class="text-xs text-muted-foreground">
                待修改密码
              </p></TableCell
            >
            <TableCell>{{
              user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '尚未登录'
            }}</TableCell>
            <TableCell
              ><div class="flex flex-wrap gap-1">
                <AppButton link @click="edit(user)">编辑</AppButton>
                <AppButton link @click="select(user, 'role')">角色</AppButton>
                <AppButton link @click="select(user, 'devices')">分配机器</AppButton>
                <AppButton link @click="select(user, 'password')">重置密码</AppButton>
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
            ><TableCell :colspan="6" class="text-center">暂无匹配用户</TableCell></TableRow
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
    <UserRoleDialog v-model="roleDialog" :user="selected" @saved="saved" />
    <UserDevicesDialog v-model="devicesDialog" :user="selected" @saved="saved" />
    <ResetPasswordDialog v-model="passwordDialog" :user="selected" @saved="saved" />
  </section>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import type { ManagedUser } from '@/types/domain'
import { getUsers, updateUser } from '@/api/user'
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
import UserRoleDialog from '@/components/user/UserRoleDialog.vue'
import UserDevicesDialog from '@/components/user/UserDevicesDialog.vue'
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
  editor = ref(false),
  roleDialog = ref(false),
  devicesDialog = ref(false),
  passwordDialog = ref(false)
let revision = 0
async function load() {
  const current = ++revision
  loading.value = true
  error.value = ''
  try {
    const result = await getUsers(filters.value.keyword, filters.value.status, page.value)
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
function edit(user: ManagedUser | null) {
  selected.value = user
  editor.value = true
}
function select(user: ManagedUser, kind: 'role' | 'devices' | 'password') {
  selected.value = user
  if (kind === 'role') roleDialog.value = true
  else if (kind === 'devices') devicesDialog.value = true
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
      `确认${next === 'DISABLED' ? '禁用' : '启用'}用户 ${user.username}？旧登录凭证将失效。`,
      '更改用户状态',
    ))
  )
    return
  busy.value = user.id
  try {
    await updateUser(user.id, { displayName: user.displayName, status: next })
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
})
</script>
