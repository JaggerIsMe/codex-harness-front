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
  isolationMode: 'WINDOWS_PROJECT_PROFILE',
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
  provisioningStatus: 'READY',
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
  isolationMode: 'WINDOWS_PROJECT_PROFILE',
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

test('conversation keeps its creation-time expert and turn requests cannot switch it', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const experts = [
    {
      expertId: 10,
      expertVersionId: 100,
      versionNo: 1,
      name: 'Java 开发专家',
      description: '负责 Java 开发与代码审查',
      available: true,
    },
    {
      expertId: 20,
      expertVersionId: 200,
      versionNo: 1,
      name: '数据库专家',
      description: '负责数据库设计与查询优化',
      available: true,
    },
  ]
  const turns: Record<string, unknown>[] = []
  await page.route('**/conversations/4/expert', (route) =>
    route.fulfill({
      json: response({
        expertId: 10,
        expertVersionId: 100,
        name: experts[0].name,
        selectionRevision: 1,
        projectRevision: 3,
        available: true,
      }),
    }),
  )
  await page.route('**/active-turn', (route) => route.fulfill({ json: response(null) }))
  await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
  await page.route('**/conversations/4/turns', async (route) => {
    turns.push(route.request().postDataJSON())
    await route.fulfill({ json: response({ id: 1000 + turns.length, status: 'COMPLETED' }) })
  })
  await page.goto('/projects/3?id=4')
  await expect(page.locator('.composer')).toContainText('Java 开发专家')
  await expect(page.locator('.composer')).toContainText('创建时固定，不可更改')
  for (const message of ['分析项目', '继续分析']) {
    await page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送').fill(message)
    await page.getByRole('button', { name: '发送任务', exact: true }).click()
    await expect(page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送')).toHaveValue('')
  }
  expect(turns.every((turn) => !('expertId' in turn))).toBe(true)
  await page.reload()
  await expect(page.locator('.composer')).toContainText('Java 开发专家')
  await expect(page.getByRole('button', { name: '选择会话专家' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('expert-conversation.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('expert market enables a published version in the selected project', async ({ page }) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const expert = { id: 10, name: 'Java 专家', description: 'Java 开发', publishedVersionId: 100 }
  let binding: Record<string, unknown> | null = null
  await page.route('**/api/v1/expert-market**', (route) =>
    route.fulfill({ json: response([expert]) }),
  )
  await page.route('**/projects/3/experts', async (route) => {
    if (route.request().method() === 'POST') binding = route.request().postDataJSON()
    await route.fulfill({
      json: response({
        projectRevision: binding ? 1 : 0,
        experts: binding
          ? [
              {
                expertId: 10,
                expertVersionId: 100,
                versionNo: 1,
                name: expert.name,
                description: expert.description,
                available: true,
              },
            ]
          : [],
      }),
    })
  })
  await page.goto('/expert-market')
  await page.getByRole('button', { name: '启用到项目', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').selectOption('3')
  await dialog.getByRole('button', { name: '启用 / 升级', exact: true }).click()
  await expect(page).toHaveURL(/projects\/3\/experts/)
  await expect(page.getByRole('cell', { name: 'v1', exact: true })).toBeVisible()
  expect(binding).toEqual({ expertVersionId: 100, projectRevision: 0 })
  expect(errors).toEqual([])
})

test('project expert button signals and directly applies an available upgrade', async ({
  page,
}) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  let upgraded = false
  let request: Record<string, unknown> | undefined
  await page.route('**/api/v1/projects/3/experts', async (route) => {
    if (route.request().method() === 'POST') {
      request = route.request().postDataJSON()
      upgraded = true
    }
    await route.fulfill({
      json: response({
        projectRevision: upgraded ? 2 : 1,
        experts: [
          {
            expertId: 10,
            expertVersionId: upgraded ? 101 : 100,
            versionNo: upgraded ? 2 : 1,
            latestVersionId: 101,
            latestVersionNo: 2,
            upgradeAvailable: !upgraded,
            name: 'Java 开发专家',
            description: 'Java 开发',
            available: true,
          },
        ],
      }),
    })
  })

  await page.goto('/projects/3?id=4')
  await expect(page.getByLabel('项目专家有新版本')).toBeVisible()
  await page.getByRole('link', { name: /项目专家/ }).click()
  await expect(page.getByText('可升级至 v2')).toBeVisible()
  await page.getByRole('button', { name: '升级到 v2', exact: true }).click()
  await expect.poll(() => request).toEqual({ expertVersionId: 101, projectRevision: 1 })
  await expect(page.getByRole('cell', { name: 'v2', exact: true })).toBeVisible()
  await expect(page.getByText('可升级至 v2')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('expert administration keeps MCP and knowledge as unavailable extension sections', async ({
  page,
}) => {
  await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  let draft: Record<string, unknown> | null = null
  await page.route('**/admin/experts**', async (route) => {
    if (route.request().method() === 'POST') draft = route.request().postDataJSON()
    await route.fulfill({
      json: response(route.request().method() === 'GET' ? [] : { id: 10, ...draft }),
    })
  })
  await page.goto('/experts')
  await page.getByRole('button', { name: '创建专家' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('暂未接入，后续拓展')).toHaveCount(2)
  await dialog.getByLabel('名称', { exact: true }).fill('Java 专家')
  await dialog.getByLabel('系统提示词', { exact: true }).fill('负责 Java 开发')
  await dialog.getByRole('button', { name: '保存草稿' }).click()
  await expect(dialog).toHaveCount(0)
  expect(draft).toMatchObject({
    name: 'Java 专家',
    systemPrompt: '负责 Java 开发',
    mcpBindings: [],
    knowledgeBindings: [],
  })
})

for (const action of [
  { name: '禁用', path: 'disable', status: 'DISABLED', label: '已禁用' },
  { name: '下架', path: 'unpublish', status: 'UNPUBLISHED', label: '已下架' },
]) {
  test(`expert confirmation submits ${action.path} exactly once and refreshes status`, async ({
    page,
  }) => {
    const errors = await fixtures(page)
    const expert = {
      id: 10,
      name: 'Java 专家',
      description: 'Java 开发',
      status: 'PUBLISHED',
      revision: 7,
    }
    const requests: { path: string; revision: number }[] = []
    await page.route('**/api/v1/admin/experts**', async (route) => {
      if (route.request().method() === 'POST') {
        requests.push({
          path: new URL(route.request().url()).pathname,
          ...route.request().postDataJSON(),
        })
        expert.status = action.status
        expert.revision++
      }
      await route.fulfill({
        json: {
          status: 'success',
          code: 200,
          info: '',
          data: route.request().method() === 'GET' ? [expert] : expert,
        },
      })
    })
    await page.goto('/experts')
    const button = page.getByRole('button', { name: action.name, exact: true })
    await button.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(requests).toEqual([])
    await button.click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(requests).toEqual([])
    await button.click()
    const confirm = page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true })
    if (action.path === 'disable') {
      await confirm.focus()
      await confirm.press('Enter')
    } else {
      await confirm.click()
    }
    await expect.poll(() => requests.length).toBe(1)
    expect(requests).toEqual([{ path: `/api/v1/admin/experts/10/${action.path}`, revision: 7 }])
    await expect(page.getByRole('cell', { name: action.label, exact: true })).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('expert publish records the compatible upgrade decision', async ({ page }) => {
  const errors = await fixtures(page)
  const expert = {
    id: 10,
    name: 'Java 专家',
    description: 'Java 开发',
    status: 'PUBLISHED',
    revision: 7,
  }
  let request: Record<string, unknown> | undefined
  await page.route('**/api/v1/admin/experts**', async (route) => {
    if (route.request().method() === 'POST') request = route.request().postDataJSON()
    await route.fulfill({ json: response(route.request().method() === 'GET' ? [expert] : expert) })
  })
  await page.goto('/experts')
  await page.getByRole('button', { name: '发布新版本', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('checkbox', { name: '兼容升级' }).check()
  await dialog.getByRole('button', { name: '发布', exact: true }).click()
  await expect.poll(() => request).toEqual({ revision: 7, compatibleUpgrade: true })
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})

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

test('Conversation artifacts recover on reload, retry publication, and download original filenames', async ({
  page,
}) => {
  const errors = await fixtures(page)
  let socket: WebSocketRoute | undefined
  let status = 'UPLOADING'
  let retryCount = 0
  let startedTurns = 0
  const artifact = () => ({
    id: '91',
    turnId: '7',
    fileName: '项目分析报告.txt',
    mediaType: 'application/octet-stream',
    sizeBytes: 8,
    sha256: 'a'.repeat(64),
    status,
    errorMessage: status === 'FAILED' ? '上传失败，请重试' : null,
  })
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '请求成功', data })
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/turns')) startedTurns++
  })
  await page.route('**/artifacts', (route) => route.fulfill({ json: response([artifact()]) }))
  await page.route('**/artifacts/91/retry', (route) => {
    retryCount++
    status = 'READY'
    return route.fulfill({ json: response(artifact()) })
  })
  await page.route('**/artifacts/91/download', (route) =>
    route.fulfill({
      contentType: 'application/octet-stream',
      body: 'original',
    }),
  )
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.goto('/projects/3?id=4')
  await expect(page.getByRole('list', { name: '交付文件' })).toContainText('正在准备下载')
  await expect.poll(() => Boolean(socket)).toBe(true)
  status = 'FAILED'
  socket!.send(
    JSON.stringify({ type: 'ARTIFACT_CHANGED', payload: { conversationId: '4', turnId: '7' } }),
  )
  await expect(page.getByRole('button', { name: '重试上传' })).toBeVisible()
  await page.getByRole('button', { name: '重试上传' }).click()
  await expect(page.getByRole('list', { name: '交付文件' })).toContainText('项目分析报告.txt')
  await expect(page.getByRole('button', { name: '下载', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('list', { name: '交付文件' })).toHaveCount(1)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('项目分析报告.txt')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString()).toBe('original')
  expect(retryCount).toBe(1)
  expect(startedTurns).toBe(0)
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/conversation-artifacts.png', fullPage: true })
})

async function fixtures(page: Page, authenticated = true) {
  const profile = {
    id: 1,
    username: '测试管理员',
    displayName: '测试管理员',
    roles: ['SYS_ADMIN'],
    permissions: [
      'system:user:manage',
      'device:manage',
      'skill:manage',
      'workspace:use',
      'expert:manage',
      'expert:read',
      'expert:use',
    ],
    mustChangePassword: false,
  }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  if (authenticated)
    await page.addInitScript(() => localStorage.setItem('harness_access_token', 'test-token'))
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile') data = profile
    else if (path === '/auth/socket-ticket')
      data = { ticket: 'one-time-test-ticket', expiresInSeconds: 30 }
    else if (path === '/auth/login') data = { accessToken: 'test-token', user: profile }
    else if (path === '/devices/available') data = [{ ...device, provisioningAvailable: true }]
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
    else if (/^\/projects\/\d+\/experts$/.test(path))
      data = {
        projectRevision: 1,
        experts: [
          {
            expertId: 10,
            expertVersionId: 100,
            versionNo: 1,
            name: 'Java 开发专家',
            description: 'Java 开发',
            available: true,
          },
        ],
      }
    else if (path.endsWith('/attachments/limits'))
      data = { maxFileBytes: 20971520, maxFiles: 5, maxTotalBytes: 52428800, agentSupported: true }
    else if (path.endsWith('/expert'))
      data = {
        expertId: 10,
        expertVersionId: 100,
        name: 'Java 开发专家',
        selectionRevision: 1,
        projectRevision: 1,
        available: true,
        unavailableReason: null,
      }
    else if (path.endsWith('/turn-experts'))
      data = [{ turnId: 7, expertVersionId: null, expertName: null }]
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
  await dialog.getByRole('combobox', { name: '可执行机器' }).selectOption('1')
  await expect(
    dialog.getByText('平台会自动准备项目独占目录，目录就绪后即可开始会话。'),
  ).toBeVisible()
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

test('conversation uploads and sends an attachment-only message and restores its download', async ({
  page,
}) => {
  const errors = await fixtures(page)
  const attachment = {
    id: '90',
    fileName: 'requirements.txt',
    sizeBytes: 5,
    mediaType: 'application/octet-stream',
    sha256: 'a'.repeat(64),
  }
  let sent: { message: string; attachmentIds: string[]; clientRequestId: string } | null = null
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  await page.route('**/active-turn', (route) => route.fulfill({ json: response(null) }))
  await page.route('**/attachments', (route) =>
    route.fulfill({ json: response(route.request().method() === 'POST' ? attachment : []) }),
  )
  await page.route('**/conversations/4/turns', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({
      json: response({ id: 8, status: 'CREATED', preparationPhase: 'DOWNLOADING' }),
    })
  })
  await page.route('**/message-state?*', (route) =>
    route.fulfill({
      json: response({
        turnId: sent ? 8 : null,
        cursor: 0,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
        messages: sent
          ? [
              {
                id: 80,
                turnId: 8,
                sequenceNo: 1,
                role: 'USER',
                messageType: 'TEXT',
                content: '',
                attachments: [attachment],
              },
            ]
          : [],
      }),
    }),
  )
  await page.goto('/projects/3?id=4')
  await expect(page.getByRole('button', { name: '添加附件' })).toBeEnabled()
  await page.getByLabel('选择会话附件').setInputFiles({
    name: 'requirements.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  })
  await expect(page.getByText('已上传，发送时传输到 Agent')).toBeVisible()
  await page.getByRole('button', { name: '发送任务' }).click()
  await expect.poll(() => sent).not.toBeNull()
  expect(sent!.message).toBe('')
  expect(sent!.attachmentIds).toEqual(['90'])
  expect(sent!.clientRequestId).toBeTruthy()
  await expect(page.getByRole('button', { name: /requirements.txt ·/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /requirements.txt ·/ })).toBeVisible()
  await page.route('**/attachments/90/download', (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: 'hello' }),
  )
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /requirements.txt ·/ }).click()
  expect((await downloaded).suggestedFilename()).toBe('requirements.txt')
  expect(errors).toEqual([])
})
