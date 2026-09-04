import { test, expect, type Page } from '@playwright/test'
import type { WebSocketRoute } from '@playwright/test'

test.afterEach(async ({ page }) => {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
})

const device = {
  id: 1,
  deviceName: '测试设备',
  deviceCode: 'DEV-1',
  status: 'ONLINE',
  isolationMode: 'WINDOWS_ELEVATED',
  osName: 'Windows',
  agentVersion: '1.0',
}
const workspace = {
  id: 2,
  deviceId: 1,
  workspaceName: '示例目录',
  rootPath: 'D:/workspace/demo',
  status: 'ENABLED',
}
const project = {
  id: 3,
  projectName: '示例项目',
  deviceId: 1,
  deviceName: '测试设备',
  workspaceId: 2,
  workspaceName: '示例目录',
  rootPath: 'D:/workspace/demo',
  status: 'ACTIVE',
  deviceStatus: 'ONLINE',
  workspaceStatus: 'ENABLED',
  conversationCount: 1,
  isolationMode: 'WINDOWS_ELEVATED',
}
const conversation = {
  id: 4,
  projectId: 3,
  projectName: '示例项目',
  deviceId: 1,
  title: '测试会话',
  status: 'ACTIVE',
  codexThreadId: 'thread-4',
}
const skill = {
  id: 5,
  skillName: 'code-review',
  description: '示例 Skill',
  status: 'ENABLED',
  versionCount: 1,
  versions: [{ id: 6, version: '1.0', status: 'ACTIVE', fileSize: 1024, sha256: 'a'.repeat(64) }],
}

test('logical Message streaming deduplicates updates and survives page reload', async ({
  page,
}) => {
  const errors = await fixtures(page)
  let socket: WebSocketRoute | undefined
  let revision = 0
  const finalMessage = {
    id: 20,
    turnId: 7,
    sequenceNo: 2,
    role: 'ASSISTANT',
    messageType: 'TEXT',
    messageKey: 'stable-answer',
    revision: 2,
    status: 'COMPLETED',
    content: '你好，完整回答',
  }
  await page.route('**/message-state?*', (route) =>
    route.fulfill({
      json: {
        status: 'success',
        code: 200,
        info: '请求成功',
        data: {
          messages: revision ? [finalMessage] : [],
          turnId: 7,
          cursor: revision,
          hasMore: false,
          degraded: false,
          resetRequired: false,
          updates: [],
        },
      },
    }),
  )
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.goto('/projects/3?id=4')
  await expect(page.getByRole('heading', { name: '测试会话' })).toBeVisible()
  await expect.poll(() => Boolean(socket)).toBe(true)
  const frame = (cursor: number, content: string, status: string) =>
    JSON.stringify({
      type: 'MESSAGE_UPDATED',
      payload: {
        conversationId: 4,
        turnId: 7,
        cursor,
        patches: [
          {
            operation: 'REPLACE',
            baseRevision: cursor - 1,
            message: { ...finalMessage, revision: cursor, status, content },
          },
        ],
      },
    })
  socket!.send(frame(1, '你好', 'STREAMING'))
  socket!.send(frame(1, '你好', 'STREAMING'))
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好')
  socket!.send(frame(2, '你好，完整回答', 'COMPLETED'))
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好，完整回答')
  revision = 2
  await page.reload()
  await expect(page.locator('.agent-answer .message-markdown')).toHaveCount(1)
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好，完整回答')
  expect(errors).toEqual([])
})

async function fixtures(page: Page, authenticated = true) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  if (authenticated)
    await page.addInitScript(() => localStorage.setItem('harness_access_token', 'test-token'))
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile') data = { username: '测试管理员' }
    else if (path === '/auth/login')
      data = { accessToken: 'test-token', user: { username: '测试管理员' } }
    else if (path === '/devices') data = [device]
    else if (path === '/devices/1/workspaces')
      data = [workspace, { ...workspace, id: 22, workspaceName: '空闲目录' }]
    else if (path === '/devices/1/workspace-roots') data = [{ id: 1, rootName: '允许的父目录' }]
    else if (path === '/devices/enrollments')
      data = { enrollmentCode: 'TEST-1234', expiresAt: '2026-09-04T12:00:00' }
    else if (path === '/projects' && route.request().method() === 'POST')
      data = {
        ...project,
        id: 10,
        projectName: route.request().postDataJSON().projectName,
        workspaceId: 22,
      }
    else if (path === '/projects') data = [project]
    else if (path === '/projects/10')
      data = { ...project, id: 10, projectName: '侧栏新项目', workspaceId: 22 }
    else if (path === '/projects/10/conversations' && route.request().method() === 'POST')
      data = { ...conversation, id: 11, projectId: 10, title: route.request().postDataJSON().title }
    else if (path === '/projects/10/conversations') data = []
    else if (path === '/projects/10/conversations/11')
      data = { ...conversation, id: 11, projectId: 10, title: '第一条侧栏会话' }
    else if (path === '/projects/3/conversations' && route.request().method() === 'POST')
      data = { ...conversation, id: 12, title: route.request().postDataJSON().title }
    else if (path === '/projects/3/conversations/12')
      data = { ...conversation, id: 12, title: '已有项目新会话' }
    else if (path === '/projects/3') data = project
    else if (path === '/projects/3/conversations') data = [conversation]
    else if (path === '/projects/3/conversations/4') data = conversation
    else if (path.endsWith('/active-turn')) data = { id: 7, status: 'RUNNING' }
    else if (path.endsWith('/message-state'))
      data = {
        turnId: 7,
        cursor: 0,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
        messages: [
          {
            id: 7,
            turnId: 7,
            sequenceNo: 1,
            role: 'USER',
            messageType: 'TEXT',
            content: '请帮我检查项目结构。',
          },
          {
            id: 8,
            turnId: 7,
            sequenceNo: 1,
            role: 'ASSISTANT',
            messageType: 'TEXT',
            content: '# 测试回答\n\n**安全 Markdown**',
          },
        ],
      }
    else if (path === '/skills') data = [skill]
    else if (path === '/skill-deployments')
      data = [
        {
          id: 9,
          skillName: 'code-review',
          version: '1.0',
          deviceName: '测试设备',
          scopeType: 'GLOBAL',
          installStatus: 'INSTALLED',
        },
      ]
    await route.fulfill({ json: { status: 'success', code: 200, info: '请求成功', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  return errors
}

test('login validates required fields and submits using Enter', async ({ page }) => {
  const errors = await fixtures(page, false)
  await page.goto('/login')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请输入用户名')
  await page.getByPlaceholder('请输入用户名').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('test-password')
  await page.getByPlaceholder('请输入密码').press('Enter')
  await expect(page.getByRole('heading', { name: '欢迎回到 Harness 中台' })).toBeVisible()
  expect(errors).toEqual([])
})

test('device search, confirmation cancellation and enrollment dialog', async ({ page }) => {
  const errors = await fixtures(page)
  await page.goto('/devices')
  await expect(page.locator('#app > div').first()).toHaveCSS('display', 'flex')
  await expect(page.getByRole('button', { name: '生成注册码', exact: true })).toHaveCSS(
    'background-color',
    'rgb(33, 33, 33)',
  )
  await expect(page.getByRole('cell', { name: '测试设备 DEV-1' })).toBeVisible()
  await page.getByPlaceholder('搜索设备名称、编码或系统').fill('不存在')
  await page.getByPlaceholder('搜索设备名称、编码或系统').press('Enter')
  await expect(page.getByText('暂无已注册设备')).toBeVisible()
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.getByRole('button', { name: '禁用', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await page.getByRole('button', { name: '生成注册码', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '生成注册码' }).click()
  await expect(page.getByText('TEST-1234')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.screenshot({ path: 'test-results/devices.png', fullPage: true })
  expect(errors).toEqual([])
})

test('Skill versions, upload validation and deployment tabs', async ({ page }) => {
  const errors = await fixtures(page)
  await page.goto('/skills')
  await page.getByText('查看版本', { exact: true }).click()
  await expect(page.getByRole('cell', { name: '1.0', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '上传 Skill', exact: true }).click()
  await page.getByRole('button', { name: '上传并启用' }).click()
  await expect(page.getByRole('alert')).toContainText('请选择 Skill ZIP')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '下发记录' }).click()
  await expect(page.getByRole('cell', { name: '已安装', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/skills.png', fullPage: true })
  expect(errors).toEqual([])
})

test('project navigation renders Markdown and preserves full table width on mobile', async ({
  page,
}) => {
  const errors = await fixtures(page)
  await page.goto('/projects')
  await page.getByRole('button', { name: '进入项目' }).click()
  await page.getByRole('link', { name: '测试会话', exact: true }).click()
  await expect(page.getByRole('heading', { name: '测试回答' })).toBeVisible()
  await expect(page.locator('.message-markdown strong')).toHaveText('安全 Markdown')
  await page.screenshot({ path: 'test-results/conversation.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/workspaces')
  await expect(page.getByRole('cell', { name: '示例目录 ID 2' })).toBeVisible()
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('sidebar creates a project and a conversation without leaving the workspace', async ({
  page,
}) => {
  const errors = await fixtures(page)
  await page.goto('/devices')
  await expect(page.locator('.app-header')).toHaveCount(0)
  await expect(
    page
      .getByRole('region', { name: '工作区项目与会话' })
      .getByRole('button', { name: '工作区', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '新建项目', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('例如：订单服务').fill('侧栏新项目')
  await dialog
    .getByRole('combobox', { name: '选择已启用 Windows elevated 的在线机器' })
    .selectOption('1')
  await expect(dialog.getByRole('button', { name: '没有可用目录？新建执行目录' })).toBeVisible()
  await dialog.getByRole('combobox', { name: '选择尚未绑定项目的目录' }).selectOption('22')
  await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
  await expect(page.getByRole('link', { name: '侧栏新项目', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '在 侧栏新项目 新建会话', exact: true }).click()
  await page.getByRole('dialog').getByPlaceholder('例如：修复订单导出问题').fill('第一条侧栏会话')
  await page.getByRole('button', { name: '创建并连接', exact: true }).click()
  await expect(page).toHaveURL(/projects\/10\?id=11/)
  await expect(page.getByRole('link', { name: '第一条侧栏会话', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '测试回答' })).toBeVisible()
  await expect(page.locator('.message-avatar')).toHaveCount(0)
  await expect(page.locator('.message-row--user')).toHaveCSS('justify-content', 'flex-end')
  const row = await page.locator('.message-row--assistant').boundingBox()
  const panel = await page.locator('.message-panel').boundingBox()
  expect(Math.abs(row!.x + row!.width / 2 - (panel!.x + panel!.width / 2))).toBeLessThan(12)
  await page.screenshot({ path: 'test-results/workspace-chat.png', fullPage: true })
  expect(errors).toEqual([])
})

test('sidebar search and mobile drawer keep conversations accessible', async ({ page }) => {
  const errors = await fixtures(page)
  await page.goto('/devices')
  await page.getByPlaceholder('搜索项目或会话').fill('不存在')
  await page.getByPlaceholder('搜索项目或会话').press('Enter')
  await expect(page.getByText('未找到项目或会话')).toBeVisible()
  await page.getByPlaceholder('搜索项目或会话').fill('测试会话')
  await page.getByRole('link', { name: '测试会话', exact: true }).click()
  await expect(page).toHaveURL(/projects\/3\?id=4/)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.getByRole('link', { name: '测试会话', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '在 示例项目 新建会话', exact: true }).click()
  await page.getByRole('dialog').getByPlaceholder('例如：修复订单导出问题').fill('已有项目新会话')
  await page.getByRole('button', { name: '创建并连接' }).click()
  await expect(page).toHaveURL(/projects\/3\?id=12/)
  await expect(page.getByRole('button', { name: '打开导航' })).toBeVisible()
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '打开导航' })).toBeFocused()
  expect(errors).toEqual([])
})
