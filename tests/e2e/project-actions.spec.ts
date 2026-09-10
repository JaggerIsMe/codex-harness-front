import { expect, test, type Page } from '@playwright/test'

async function fixture(page: Page, permissions: string[]) {
  const project = {
    id: 3,
    projectName: '示例项目',
    provisioningStatus: 'READY',
    status: 'ACTIVE',
    deviceId: 1,
    deviceCode: 'DEV-1',
    deviceName: '测试设备',
    deviceStatus: 'ONLINE',
    workspaceId: 2,
    workspaceName: '工作区',
    rootPath: 'D:/workspace',
    workspaceStatus: 'ENABLED',
    conversationCount: 1,
    isolationMode: 'WINDOWS_PROJECT_PROFILE',
    createdAt: '',
  }
  const conversation = {
    id: 4,
    projectId: 3,
    projectName: project.projectName,
    deviceId: 1,
    workspaceId: 2,
    title: '示例会话',
    status: 'ACTIVE',
    codexThreadId: 'thread-4',
  }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('harness_access_token', 'test-token'))
  await page.routeWebSocket('**/ws/client?*', () => {})
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'tester@example.com',
        displayName: '测试用户',
        roles: ['USER'],
        mustChangePassword: false,
        activated: true,
        permissions: ['workspace:use', ...permissions],
      }
    else if (path === '/auth/socket-ticket') data = { ticket: 'ticket', expiresInSeconds: 60 }
    else if (path === '/projects') data = { items: [project], total: 1, page: 1, size: 20 }
    else if (path === '/projects/3') data = project
    else if (path === '/projects/3/conversations')
      data = { items: [conversation], total: 1, page: 1, size: 10 }
    await route.fulfill({ json: response(data) })
  })
  return { project, conversation, response, errors }
}

test('project rename is keyboard accessible, validates names and submits once across views', async ({
  page,
}) => {
  const state = await fixture(page, ['project:update'])
  let requests = 0
  let complete!: () => void
  const pending = new Promise<void>((resolve) => (complete = resolve))
  await page.route('**/api/v1/projects/3', async (route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    requests++
    const input = route.request().postDataJSON() as { projectName: string }
    await pending
    state.project.projectName = input.projectName
    await route.fulfill({ json: state.response(state.project) })
  })
  await page.goto('/projects')
  const sidebar = page.getByRole('region', { name: '工作区项目与会话', includeHidden: true })
  const trigger = sidebar.getByRole('button', { name: '项目操作：示例项目' })
  const heading = sidebar.locator('.workspace-project__heading')
  const actions = heading.locator('.resource-actions-menu')
  await expect(
    page.locator('.project-page').getByRole('button', { name: '项目操作：示例项目' }),
  ).toBeVisible()
  await expect(actions).toHaveCSS('opacity', '0')
  await heading.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  await page.mouse.move(1400, 900)
  await expect(actions).toHaveCSS('opacity', '0')
  await trigger.focus()
  await expect(actions).toHaveCSS('opacity', '1')
  await trigger.press('Enter')
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await page.mouse.move(1400, 900)
  await expect(actions).toHaveCSS('opacity', '1')
  await page.getByRole('menuitem', { name: '修改项目名称' }).click()
  const dialog = page.getByRole('dialog', { name: '修改项目名称' })
  const input = dialog.getByRole('textbox', { name: '项目名称' })
  await expect(input).toBeFocused()
  await input.fill('   ')
  await input.press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('1 至 128')
  expect(requests).toBe(0)
  await input.fill('  修改后的项目  ')
  await input.press('Enter')
  await expect.poll(() => requests).toBe(1)
  await expect(input).toBeDisabled()
  await page.keyboard.press('Enter')
  expect(requests).toBe(1)
  complete()
  await expect(dialog).not.toBeVisible()
  await expect(sidebar.getByRole('button', { name: '项目操作：修改后的项目' })).toBeFocused()
  await expect(
    page.locator('.project-page').getByRole('button', { name: '修改后的项目', exact: true }),
  ).toBeVisible()
  expect(state.project.projectName).toBe('修改后的项目')
  expect(state.errors).toEqual([])
})

test('conversation deletion confirms, blocks repeated submission and displays server errors', async ({
  page,
}) => {
  const state = await fixture(page, ['conversation:delete'])
  let requests = 0
  let complete!: () => void
  const pending = new Promise<void>((resolve) => (complete = resolve))
  await page.route('**/api/v1/projects/3/conversations/4', async (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    requests++
    await pending
    await route.fulfill({
      status: 409,
      json: { status: 'error', code: 409, info: '会话仍有运行中的任务', data: null },
    })
  })
  await page.goto('/projects')
  const sidebar = page.getByRole('region', { name: '工作区项目与会话', includeHidden: true })
  await expect(sidebar.getByRole('button', { name: /^项目操作/ })).toHaveCount(0)
  const trigger = sidebar.getByRole('button', { name: '会话操作：示例会话' })
  const conversationRow = sidebar.locator('.workspace-conversation-row')
  const actions = conversationRow.locator('.resource-actions-menu')
  await expect(actions).toHaveCSS('opacity', '0')
  await conversationRow.hover()
  await expect(actions).toHaveCSS('opacity', '1')
  await trigger.click()
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await page.mouse.move(1400, 900)
  await expect(actions).toHaveCSS('opacity', '1')
  await page.getByRole('menuitem', { name: '删除会话' }).click()
  const dialog = page.getByRole('alertdialog', { name: '删除会话' })
  await expect(dialog).toContainText('全部消息记录')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(trigger).toBeFocused()
  expect(requests).toBe(0)
  await conversationRow.hover()
  await trigger.click()
  await page.getByRole('menuitem', { name: '删除会话' }).click()
  await dialog.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  await expect(trigger).toBeDisabled()
  await page.keyboard.press('Enter')
  expect(requests).toBe(1)
  complete()
  await expect(page.locator('[data-sonner-toast][data-type="error"]').first()).toContainText(
    '会话仍有运行中的任务',
  )
  await expect(trigger).toBeEnabled()
  await expect(sidebar.getByRole('link', { name: '示例会话', exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})
