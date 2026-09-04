import { test, expect, type Page } from '@playwright/test'

const member = {
  id: 2,
  username: 'member',
  displayName: '普通用户',
  roles: ['USER'],
  permissions: [
    'workspace:use',
    'project:create',
    'project:read',
    'conversation:read',
    'conversation:create',
  ],
  mustChangePassword: false,
}
const admin = {
  ...member,
  id: 1,
  username: 'admin',
  roles: ['SYS_ADMIN'],
  permissions: [...member.permissions, 'system:user:manage', 'device:manage', 'skill:manage'],
}
const machines = [1, 2].map((id) => ({
  id,
  deviceName: `机器 ${id}`,
  status: 'ONLINE',
  isolationMode: 'WINDOWS_PROJECT_PROFILE',
  provisioningAvailable: true,
}))
async function setup(page: Page, profile = member) {
  const requests: string[] = []
  await page.addInitScript(() => localStorage.setItem('harness_access_token', 'test-token'))
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    requests.push(path)
    let data: unknown = []
    if (path === '/auth/profile') data = profile
    if (path === '/auth/socket-ticket') data = { ticket: 'ticket', expiresInSeconds: 30 }
    if (path === '/devices' || path === '/devices/available') data = machines
    await route.fulfill({ json: { status: 'success', code: 200, info: '成功', data } })
  })
  return requests
}

test('member navigation and direct management URLs are restricted to workspace', async ({
  page,
}) => {
  const requests = await setup(page)
  await page.goto('/users')
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '用户管理' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '设备管理' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Skill 管理' })).toHaveCount(0)
  await page.goto('/devices')
  await expect(page).toHaveURL(/\/projects$/)
  expect(requests.some((path) => ['/users', '/devices', '/skills'].includes(path))).toBe(false)
})

test('temporary password must be changed before workspace is loaded', async ({ page }) => {
  const requests = await setup(page, { ...member, mustChangePassword: true })
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/account\/password$/)
  await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible()
  expect(requests).not.toContain('/projects')
  expect(requests).not.toContain('/auth/socket-ticket')
})

test('admin creates a member and grants multiple shared machines', async ({ page }) => {
  await setup(page, admin)
  let users: Record<string, unknown>[] = []
  let assigned: number[] = []
  await page.route('**/api/v1/users**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      expect(body.role).toBe('USER')
      users = [
        {
          id: 2,
          username: body.username,
          displayName: body.displayName,
          roles: ['USER'],
          deviceIds: [],
          status: 'ENABLED',
          mustChangePassword: true,
        },
      ]
      data = users[0]
    } else if (path.endsWith('/devices')) {
      assigned = request.postDataJSON().deviceIds
      users[0]!.deviceIds = assigned
      data = users[0]
    } else data = { items: users, total: users.length, page: 1, size: 20 }
    await route.fulfill({ json: { status: 'success', code: 200, info: '成功', data } })
  })
  await page.goto('/users')
  await page.getByRole('button', { name: '新增用户' }).click()
  const editor = page.getByRole('dialog')
  await editor.getByLabel('用户名', { exact: true }).fill('member')
  await editor.getByLabel('显示名称').fill('普通用户')
  await editor.getByLabel('临时密码').fill('Temporary12345')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.getByRole('button', { name: '分配机器' }).click()
  const devices = page.getByRole('dialog')
  await devices.getByRole('checkbox', { name: /机器 1/ }).check()
  await devices.getByRole('checkbox', { name: /机器 2/ }).check()
  await devices.getByRole('button', { name: '保存授权' }).click()
  await expect(devices).toHaveCount(0)
  expect(assigned).toEqual([1, 2])
  await expect(page.getByRole('cell', { name: '2 台' })).toBeVisible()
  await page.screenshot({ path: 'test-results/user-management.png', fullPage: true })
})

test('project creation allocates no client path and a failed preparation retries the same project', async ({
  page,
}) => {
  await setup(page)
  let project: Record<string, unknown> | undefined
  let retried = 0
  await page.route('**/api/v1/projects**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (request.method() === 'POST' && path === '/projects') {
      const body = request.postDataJSON()
      expect(Object.keys(body).sort()).toEqual(['deviceId', 'projectName', 'requestKey'])
      expect(body.requestKey).toMatch(/^[0-9a-f-]{36}$/)
      project = {
        id: 9,
        projectName: body.projectName,
        deviceId: 1,
        deviceName: '机器 1',
        workspaceId: 19,
        workspaceStatus: 'FAILED',
        provisioningStatus: 'FAILED',
        status: 'ACTIVE',
        failureMessage: '目录创建失败，请重试',
        conversationCount: 0,
      }
      data = project
    } else if (path.endsWith('/retry-preparation')) {
      retried++
      project = {
        ...project,
        workspaceStatus: 'CREATING',
        provisioningStatus: 'PREPARING',
        failureMessage: null,
      }
      data = project
    } else if (path === '/projects/9') data = project
    else if (path === '/projects') data = project ? [project] : []
    await route.fulfill({ json: { status: 'success', code: 200, info: '成功', data } })
  })
  await page.goto('/projects')
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('项目名称').fill('独占项目')
  await dialog.getByRole('combobox', { name: '可执行机器' }).selectOption('1')
  await dialog.getByRole('button', { name: '创建项目' }).click()
  await expect(page).toHaveURL(/\/projects\/9$/)
  await expect(page.getByText('目录创建失败，请重试')).toBeVisible()
  await page.getByRole('button', { name: '重试准备' }).click()
  await expect(page.getByText('正在 机器 1 上准备独占执行目录…')).toBeVisible()
  expect(retried).toBe(1)
  expect(project?.workspaceId).toBe(19)
  project = {
    ...project,
    workspaceStatus: 'ENABLED',
    provisioningStatus: 'READY',
    rootPath: 'D:/projects/u2-unique',
  }
  await page.getByRole('button', { name: '刷新状态' }).click()
  await expect(page.getByText('正在 机器 1 上准备独占执行目录…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /创建.*会话|新建会话/ }).first()).toBeVisible()
})
