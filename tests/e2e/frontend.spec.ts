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

test('workspace tree creates folders, uploads into selection and downloads current files', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  type Entry = { name: string; path: string; type: string; sizeBytes: number; modifiedAt: number }
  const directories: Record<string, Entry[]> = { '': [] }
  const operations: Record<
    string,
    { id: string; kind: string; path: string; status: string; error: null }
  > = {}
  let sequence = 1
  const uploads: string[] = []
  await page.route('**/workspace-files**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/workspace-files')[1]
    if (endpoint?.endsWith('/content')) {
      await route.fulfill({
        body: 'downloaded workspace content',
        contentType: 'application/octet-stream',
      })
      return
    }
    if (endpoint?.startsWith('/operations/')) {
      await route.fulfill({ json: response(operations[endpoint.split('/')[2]]) })
      return
    }
    if (!endpoint) {
      const path = url.searchParams.get('path') || ''
      await route.fulfill({
        json: response({
          path,
          generation: String(sequence),
          scannedAt: Date.now(),
          entries: directories[path] || [],
          nextCursor: null,
          loaded: true,
          online: true,
          supported: true,
          operation: null,
          maxFileBytes: 20971520,
        }),
      })
      return
    }
    let path = ''
    if (endpoint === '/directories') {
      path = route.request().postDataJSON().path
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      directories[parent].push({
        name: path.split('/').pop()!,
        path,
        type: 'DIRECTORY',
        sizeBytes: 0,
        modifiedAt: Date.now(),
      })
      directories[path] = []
    } else if (endpoint === '/uploads') {
      const parent = url.searchParams.get('path') || ''
      uploads.push(parent)
      path = `${parent}/report.txt`
      directories[parent].push({
        name: 'report.txt',
        path,
        type: 'FILE',
        sizeBytes: 12,
        modifiedAt: Date.now(),
      })
    } else path = route.request().postDataJSON().path
    const id = String(++sequence)
    const operation = { id, kind: endpoint || '', path, status: 'SUCCEEDED', error: null }
    operations[id] = operation
    await route.fulfill({ json: response(operation) })
  })
  await page.goto('/projects/3?id=4')
  await page.getByRole('button', { name: '工作区文件', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '工作区文件' })
  await expect(panel.getByText('空目录', { exact: true })).toBeVisible()
  await panel.getByRole('button', { name: '新建文件夹' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('reports')
  await dialog.getByRole('textbox').press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(panel).toContainText('上传位置：reports')
  await panel.getByLabel('上传工作区文件').setInputFiles({
    name: 'report.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello workspace'),
  })
  await expect(panel.getByRole('button', { name: '下载 report.txt', exact: true })).toBeEnabled()
  expect(uploads).toEqual(['reports'])
  const pending = page.waitForEvent('download')
  await panel.getByRole('button', { name: '下载 report.txt', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('report.txt')
  await page.screenshot({ path: testInfo.outputPath('workspace-files.png'), fullPage: true })
  await panel.getByRole('button', { name: '收起工作区文件' }).click()
  await expect(panel).not.toBeVisible()
  expect(errors).toEqual([])
})

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

test('expert administration shows empty MCP choices and the reserved knowledge section', async ({
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
  await expect(dialog.getByRole('group', { name: 'MCP（绑定固定配置版本）' })).toContainText(
    '暂无可用 MCP 配置',
  )
  await expect(dialog.getByRole('group', { name: '知识库' })).toContainText('暂未接入，后续拓展')
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
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const expert = {
    id: 10,
    name: 'Java 专家',
    description: 'Java 开发',
    status: 'PUBLISHED',
    revision: 7,
    publishedVersionId: 100,
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
    workspacePath: 'requirements.txt',
    workspaceOperationId: '100',
    sizeBytes: 5,
    mediaType: 'application/octet-stream',
    sha256: 'a'.repeat(64),
  }
  let sent: { message: string; attachmentIds: string[]; clientRequestId: string } | null = null
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  await page.route('**/workspace-files/operations/100', (route) =>
    route.fulfill({
      json: response({
        id: '100',
        kind: 'UPLOAD_WORKSPACE_FILE',
        path: 'requirements.txt',
        status: 'SUCCEEDED',
        error: null,
      }),
    }),
  )
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
  await expect(page.getByText('已就绪：requirements.txt')).toBeVisible()
  await page.getByRole('button', { name: '发送任务' }).click()
  await expect.poll(() => sent).not.toBeNull()
  expect(sent!.message).toBe('')
  expect(sent!.attachmentIds).toEqual(['90'])
  expect(sent!.clientRequestId).toBeTruthy()
  await expect(page.getByRole('button', { name: /requirements.txt ·/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /requirements.txt ·/ })).toBeVisible()
  const downloadOperation = {
    id: '101',
    kind: 'PREPARE_WORKSPACE_DOWNLOAD',
    path: 'requirements.txt',
    status: 'SUCCEEDED',
    error: null,
  }
  await page.route('**/workspace-files/downloads', (route) => {
    expect(route.request().postDataJSON().path).toBe('requirements.txt')
    return route.fulfill({ json: response(downloadOperation) })
  })
  await page.route('**/workspace-files/operations/101', (route) =>
    route.fulfill({ json: response(downloadOperation) }),
  )
  await page.route('**/workspace-files/operations/101/content', (route) =>
    route.fulfill({ contentType: 'application/octet-stream', body: 'current workspace contents' }),
  )
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /requirements.txt ·/ }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('requirements.txt')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString()).toBe('current workspace contents')
  expect(errors).toEqual([])
})

function previewPdfFixture() {
  const stream = (label: string) =>
    `0.1 0.3 0.7 rg 30 100 180 60 re f BT /F1 20 Tf 30 200 Td (${label}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream('First page').length} >>\nstream\n${stream('First page')}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${stream('Second page').length} >>\nstream\n${stream('Second page')}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n `)
    .join('\n')}\ntrailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}
async function previewFixtures(page: Page) {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  await page.route('**/active-turn', (route) => route.fulfill({ json: response(null) }))
  const files: Record<string, Buffer> = {
    'note.txt': Buffer.from('Original snapshot\n中文文件'),
    'README.md': Buffer.from(
      '# Workspace report\n\n| Name | Value |\n| --- | --- |\n| alpha | 42 |\n\n![secret](https://preview-external.invalid/image)\n\n<script>window.previewUnsafe=true</script>\n\n[example](https://example.com)',
    ),
    'table.csv': Buffer.from(
      'name,note\n"one,two","first\nsecond"\n"quoted \"\"text\"\"",=SUM(A1)',
    ),
    'picture.png': Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
    'document.pdf': previewPdfFixture(),
    'broken.pdf': Buffer.from('%PDF-broken'),
    'office.docx': Buffer.from('unsupported'),
    'empty.txt': Buffer.from(''),
  }
  const operations: Record<
    string,
    { id: string; kind: string; status: string; path: string; error: null; content: Buffer }
  > = {}
  const reads: string[] = []
  let sequence = 0,
    generation = 1
  await page.route('**/workspace-files**', async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer test-token')
    const url = new URL(route.request().url()),
      endpoint = url.pathname.split('/workspace-files')[1] || ''
    if (!endpoint)
      return route.fulfill({
        json: response({
          path: '',
          generation: String(generation),
          scannedAt: Date.now(),
          entries: Object.entries(files).map(([path, content]) => ({
            path,
            name: path,
            type: 'FILE',
            sizeBytes: content.length,
            modifiedAt: generation,
          })),
          nextCursor: null,
          loaded: true,
          online: true,
          supported: true,
          operation: null,
          maxFileBytes: 20971520,
        }),
      })
    if (endpoint === '/downloads') {
      const path = route.request().postDataJSON().path as string
      const id = String(++sequence)
      operations[id] = {
        id,
        kind: 'PREPARE_WORKSPACE_DOWNLOAD',
        path,
        status: 'SUCCEEDED',
        error: null,
        content: Buffer.from(files[path]),
      }
      return route.fulfill({ json: response(operations[id]) })
    }
    const id = endpoint.split('/')[2],
      op = operations[id]
    if (endpoint.endsWith('/content')) {
      reads.push(id)
      return route.fulfill({ contentType: 'application/octet-stream', body: op.content })
    }
    if (endpoint.endsWith('/preview')) {
      const kind = op.path.endsWith('.md')
        ? 'MARKDOWN'
        : op.path.endsWith('.csv')
          ? 'TABLE'
          : op.path.endsWith('.png')
            ? 'IMAGE'
            : op.path.endsWith('.pdf')
              ? 'PDF'
              : op.path.endsWith('.docx')
                ? 'UNSUPPORTED'
                : 'TEXT'
      return route.fulfill({
        json: response({
          operationId: id,
          path: op.path,
          fileName: op.path,
          kind,
          mediaType:
            kind === 'IMAGE' ? 'image/png' : kind === 'PDF' ? 'application/pdf' : 'text/plain',
          encoding: 'utf-8',
          sizeBytes: op.content.length,
          sha256: 'a'.repeat(64),
          readyAt: '2026-09-08T10:00:00',
          width: 1,
          height: 1,
          reason: kind === 'UNSUPPORTED' ? '暂不支持此文件格式，请下载查看。' : null,
          limits: {
            maxBytes: 20971520,
            maxLines: 20000,
            maxRows: 1000,
            maxColumns: 100,
            maxPixels: 4000000,
          },
        }),
      })
    }
    return route.fulfill({ json: response(op) })
  })
  await page.goto('/projects/3?id=4')
  await page.getByRole('button', { name: '工作区文件', exact: true }).click()
  return {
    errors,
    reads,
    change: () => {
      files['note.txt'] = Buffer.from('New workspace contents')
      generation++
    },
  }
}

test('workspace preview keeps the conversation mounted, isolates content and downloads its snapshot', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1900, height: 1000 })
  const { errors, reads, change } = await previewFixtures(page)
  const external: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('preview-external.invalid')) external.push(request.url())
  })
  const tree = page.getByRole('complementary', { name: '工作区文件' })
  const preview = page.getByRole('complementary', { name: '文件预览', exact: true })
  const draft = page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送')
  await draft.fill('保留这条草稿')
  await draft.evaluate((element) => element.setAttribute('data-original-composer', 'true'))
  await tree.getByRole('button', { name: '预览 note.txt', exact: true }).click()
  await expect(preview).toContainText('Original snapshot')
  await expect(page.locator('.workspace-workbench')).toHaveAttribute('data-mode', 'three')
  const separators = page.getByRole('separator')
  await expect(separators).toHaveCount(2)
  const chatWidth = await page
    .locator('[data-pane="chat"]')
    .evaluate((element) => element.clientWidth)
  await separators.first().focus()
  await page.keyboard.press('Shift+ArrowRight')
  expect(
    await page.locator('[data-pane="chat"]').evaluate((element) => element.clientWidth),
  ).toBeGreaterThan(chatWidth)
  const treeWidth = await tree.evaluate((element) => element.clientWidth)
  const handle = (await separators.nth(1).boundingBox())!
  await page.mouse.move(handle.x + 3, handle.y + 50)
  await page.mouse.down()
  await page.mouse.move(handle.x - 27, handle.y + 50)
  await page.mouse.up()
  expect(await tree.evaluate((element) => element.clientWidth)).toBeGreaterThan(treeWidth)
  change()
  await tree.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(preview).toContainText('目录已更新')
  const pending = page.waitForEvent('download')
  await preview.getByRole('button', { name: '下载副本' }).click()
  const download = await pending
  const { readFile } = await import('node:fs/promises')
  expect(await readFile((await download.path())!, 'utf8')).toBe('Original snapshot\n中文文件')
  expect(reads).toEqual(['1', '1'])
  await tree.getByRole('button', { name: '预览 README.md' }).click()
  await expect(preview.getByRole('heading', { name: 'Workspace report' })).toBeVisible()
  await expect(preview.getByRole('cell', { name: '42' })).toBeVisible()
  expect(await preview.locator('img,script,iframe').count()).toBe(0)
  expect(external).toEqual([])
  await preview.getByRole('button', { name: '查看源码' }).click()
  await expect(preview.locator('.file-text-preview__text')).toContainText('# Workspace report')
  await tree.getByRole('button', { name: '预览 table.csv' }).click()
  await expect(preview.getByRole('cell', { name: 'one,two', exact: true })).toBeVisible()
  await expect(preview.getByRole('cell', { name: 'first second' })).toBeVisible()
  await tree.getByRole('button', { name: '预览 picture.png' }).click()
  await expect(preview.getByRole('img')).toBeVisible()
  await expect
    .poll(() => preview.getByRole('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1)
  await tree.getByRole('button', { name: '预览 README.md' }).click()
  await expect(preview.getByRole('heading', { name: 'Workspace report' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('preview-three-columns.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.workspace-workbench')).toHaveAttribute('data-mode', 'single')
  await page
    .getByRole('navigation', { name: '工作区视图' })
    .getByRole('button', { name: '会话', exact: true })
    .click()
  await expect(draft).toHaveValue('保留这条草稿')
  await expect(draft).toHaveAttribute('data-original-composer', 'true')
  await page
    .getByRole('navigation', { name: '工作区视图' })
    .getByRole('button', { name: '预览', exact: true })
    .click()
  await expect(preview.getByRole('heading', { name: 'Workspace report' })).toBeVisible()
  expect(
    await page.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('preview-mobile.png'), fullPage: true })
  await preview.getByRole('button', { name: '关闭文件预览' }).click()
  await expect(draft).toBeVisible()
  await expect(page.getByRole('button', { name: '工作区文件', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

test('workspace PDF preview renders locally, preserves pages across layout and releases its worker', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1900, height: 1000 })
  const { errors } = await previewFixtures(page)
  const tree = page.getByRole('complementary', { name: '工作区文件' })
  const preview = page.getByRole('complementary', { name: '文件预览', exact: true })
  await tree.getByRole('button', { name: '预览 document.pdf' }).click()
  const rendered = async () => {
    await expect(preview.getByText('正在渲染 PDF…', { exact: true })).toBeHidden()
    await expect
      .poll(() =>
        preview
          .locator('canvas')
          .evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height),
      )
      .toBeGreaterThan(0)
  }
  await expect(preview.getByRole('spinbutton', { name: 'PDF 页码' })).toBeEnabled()
  await rendered()
  await preview.getByRole('button', { name: '下一页' }).click()
  await expect(preview.getByRole('spinbutton')).toHaveValue('2')
  await rendered()
  expect(
    await preview
      .locator('canvas')
      .evaluate((canvas: HTMLCanvasElement) => canvas.width * canvas.height),
  ).toBeLessThanOrEqual(4000000)
  await preview.getByRole('button', { name: '最大化预览' }).click()
  await page.setViewportSize({ width: 1400, height: 844 })
  await preview.getByRole('button', { name: '恢复布局' }).click()
  await expect(preview.getByRole('spinbutton')).toHaveValue('2')
  await rendered()
  await page.screenshot({ path: testInfo.outputPath('preview-pdf.png'), fullPage: true })
  await page
    .getByRole('navigation', { name: '工作区视图' })
    .getByRole('button', { name: '文件', exact: true })
    .click()
  await page
    .getByRole('navigation', { name: '工作区视图' })
    .getByRole('button', { name: '预览', exact: true })
    .click()
  await expect(preview.getByRole('spinbutton')).toHaveValue('2')
  await rendered()
  await preview.getByRole('button', { name: '关闭文件预览' }).click()
  await expect.poll(() => page.workers().length).toBe(0)
  await page.setViewportSize({ width: 1900, height: 1000 })
  await tree.getByRole('button', { name: '预览 broken.pdf' }).click()
  await expect(preview.getByRole('alert')).toContainText('PDF 文件损坏或无法读取')
  await tree.getByRole('button', { name: '预览 office.docx' }).click()
  await expect(preview).toContainText('暂不支持此文件格式')
  await tree.getByRole('button', { name: '预览 empty.txt' }).click()
  await expect(preview).toContainText('空文件')
  expect(errors).toEqual([])
})
