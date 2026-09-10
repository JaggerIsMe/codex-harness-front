import { test, expect, type Page, type Route } from '@playwright/test'
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
    if (endpoint === '/operations') {
      await route.fulfill({ json: response({ items: [], nextCursor: null }) })
      return
    }
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
  await expect(page.locator('.composer-shell')).toContainText('当前专家：Java 开发专家')
  await expect(page.locator('.composer-shell')).not.toContainText('创建时固定，不可更改')
  for (const message of ['分析项目', '继续分析']) {
    await page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送').fill(message)
    await page.getByRole('button', { name: '发送任务', exact: true }).click()
    await expect(page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送')).toHaveValue('')
  }
  expect(turns.every((turn) => !('expertId' in turn))).toBe(true)
  await page.reload()
  await expect(page.locator('.composer-shell')).toContainText('当前专家：Java 开发专家')
  await expect(page.getByRole('button', { name: '选择会话专家' })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('expert-conversation.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('minimal composer preserves expanded drafts and replaces send with stop', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  let active = false
  let sent = ''
  let interrupts = 0
  await page.route('**/active-turn', (route) =>
    route.fulfill({ json: response(active ? { id: 70, status: 'RUNNING' } : null) }),
  )
  await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
  await page.route('**/conversations/4/turns', async (route) => {
    sent = route.request().postDataJSON().message
    active = true
    await route.fulfill({ json: response({ id: 70, status: 'RUNNING' }) })
  })
  await page.route('**/turns/70/interrupt', async (route) => {
    interrupts++
    active = false
    await route.fulfill({ json: response(null) })
  })
  await page.goto('/projects/3?id=4')
  const composer = page.locator('.composer-shell')
  const input = composer.getByRole('textbox')
  const send = composer.getByRole('button', { name: '发送任务', exact: true })
  await expect(composer).not.toContainText('模型由管理员')
  for (const name of ['添加附件', '刷新专家状态', '发送任务']) {
    const button = composer.getByRole('button', { name, exact: true })
    await expect(button).toHaveText('')
    await expect(button).toHaveCSS('border-radius', '50%')
  }
  await expect(send).toBeDisabled()
  const message = '逐项检查实现并说明变更。\n'.repeat(100)
  await input.fill(message)
  const collapsed = (await input.boundingBox())!.height
  await composer.getByRole('button', { name: '展开输入框' }).click()
  await expect(input).toBeFocused()
  await expect(composer.getByRole('button', { name: '收起输入框' })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  expect((await input.boundingBox())!.height).toBeGreaterThan(collapsed * 2)
  await expect(input).toHaveValue(message)
  await page.screenshot({
    path: testInfo.outputPath('composer-expanded-light.png'),
    fullPage: true,
  })
  await input.press('Escape')
  expect((await input.boundingBox())!.height).toBe(collapsed)
  await expect(input).toHaveValue(message)
  await input.press('Control+Enter')
  await expect.poll(() => sent).toBe(message.trim())
  await expect(input).toHaveValue('')
  await expect(send).toHaveCount(0)
  const stop = composer.getByRole('button', { name: '停止生成' })
  await expect(stop).toBeVisible()
  await expect(stop).toHaveCSS('border-radius', '50%')
  await expect(page.locator('.conversation-title [role="status"]')).toContainText('Codex 正在执行')
  await expect(page.locator('.conversation-header__actions')).not.toContainText('Codex 正在执行')
  await page.screenshot({ path: testInfo.outputPath('composer-running-light.png'), fullPage: true })
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await expect(page.locator('.composer')).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await expect(stop).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  await expect(page.locator('.message-markdown').first()).toHaveCSS('color', 'rgb(236, 236, 236)')
  await page.screenshot({ path: testInfo.outputPath('composer-running-dark.png'), fullPage: true })
  await stop.click()
  await expect.poll(() => interrupts).toBe(1)
  await expect(stop).toHaveCount(0)
  await expect(send).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await input.fill(message)
  await composer.getByRole('button', { name: '展开输入框' }).click()
  await expect(send).toBeInViewport()
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('composer-expanded-mobile.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('expanded composer keeps actions reachable with restored attachments in short viewports', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  await page.route('**/active-turn', (route) => route.fulfill({ json: response(null) }))
  await page.route('**/attachments', (route) =>
    route.fulfill({
      json: response(
        Array.from({ length: 5 }, (_, index) => ({
          id: String(90 + index),
          fileName: `requirements-${index}.txt`,
          workspacePath: `requirements-${index}.txt`,
          sizeBytes: 1024,
          mediaType: 'text/plain',
          sha256: 'a'.repeat(64),
        })),
      ),
    }),
  )
  await page.goto('/projects/3?id=4')
  const input = page.locator('.composer textarea')
  const message = '请结合附件检查需求。\n'.repeat(100)
  await input.fill(message)
  await page.getByRole('button', { name: '展开输入框' }).click()
  for (const viewport of [
    { width: 900, height: 600 },
    { width: 390, height: 700 },
    { width: 320, height: 700 },
  ]) {
    await page.setViewportSize(viewport)
    const cards = page.locator('.attachment-queue__file')
    await expect(cards).toHaveCount(5)
    const boxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, right: box.right }
      }),
    )
    const queueBox = (await page.locator('.attachment-queue__files').boundingBox())!
    for (const [index, box] of boxes.entries()) {
      expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(1)
      expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThan(1)
      expect(box.right).toBeLessThanOrEqual(queueBox.x + queueBox.width)
      if (index) expect(box.x).toBeGreaterThan(boxes[index - 1]!.right)
      await expect(
        cards
          .nth(index)
          .getByRole('button', { name: `移除 requirements-${index}.txt`, exact: true }),
      ).toBeInViewport()
    }
    await expect(page.getByRole('button', { name: '发送任务', exact: true })).toBeInViewport()
    await expect(page.getByRole('button', { name: '收起输入框' })).toBeInViewport()
    const composerBox = (await page.locator('.composer').boundingBox())!
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewport.height - 8)
    const hintBox = (await page
      .locator('.composer')
      .getByText(/移除附件只取消消息关联/)
      .boundingBox())!
    expect(hintBox.y + hintBox.height).toBeLessThanOrEqual((await input.boundingBox())!.y)
    expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(56)
    await expect(input).toHaveValue(message)
    await input.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    expect(
      await input.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
      ),
    ).toBe(true)
    expect(await page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`composer-attachments-${viewport.width}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.getByRole('button', { name: '移除 requirements-0.txt', exact: true }).click()
  await expect(page.locator('.attachment-queue__file')).toHaveCount(4)
  await expect(page.locator('.attachment-queue__placeholder')).toHaveCount(1)
  await expect(page.locator('.attachment-queue__file').first()).toContainText('requirements-1.txt')
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
          messages: revision
            ? [
                {
                  ...finalMessage,
                  revision,
                  status: revision === 1 ? 'STREAMING' : 'COMPLETED',
                  content: revision === 1 ? '你好' : finalMessage.content,
                },
              ]
            : [],
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
  revision = 1
  socket!.send(frame(1, '你好', 'STREAMING'))
  socket!.send(frame(1, '你好', 'STREAMING'))
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好')
  revision = 2
  socket!.send(frame(2, '你好，完整回答', 'COMPLETED'))
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好，完整回答')
  await page.reload()
  await expect(page.locator('.agent-answer .message-markdown')).toHaveCount(1)
  await expect(page.locator('.agent-answer .message-markdown')).toHaveText('你好，完整回答')
  expect(errors).toEqual([])
})

test('message bottom control follows replies without interrupting history reading', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  let socket: WebSocketRoute | undefined
  let running = true
  const message = {
    id: 20,
    turnId: 7,
    sequenceNo: 2,
    role: 'ASSISTANT',
    messageType: 'TEXT',
    messageKey: 'scroll-answer',
    revision: 1,
    status: 'STREAMING',
    content: Array.from({ length: 60 }, (_, index) => `历史段落 ${index + 1}`).join('\n\n'),
  }
  await page.route('**/active-turn', (route) =>
    route.fulfill({ json: response(running ? { id: 7, status: 'RUNNING' } : null) }),
  )
  await page.route('**/message-state?*', (route) =>
    route.fulfill({
      json: response({
        messages: [message],
        turnId: 7,
        cursor: message.revision,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
      }),
    }),
  )
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.goto('/projects/3?id=4')
  const panel = page.locator('.message-panel')
  const button = page.getByRole('button', { name: '回到消息底部', exact: true })
  const distance = () =>
    panel.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
  await expect.poll(() => Boolean(socket)).toBe(true)
  await expect.poll(distance).toBeLessThanOrEqual(1)
  const latestMessage = page.locator('.agent-answer .message-markdown p').last()
  const assertLatestIsUncovered = async () => {
    const lastBox = (await latestMessage.boundingBox())!
    const dockBox = (await page.locator('.conversation-dock').boundingBox())!
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(dockBox.y)
  }
  await assertLatestIsUncovered()
  const sharedPanelBox = (await panel.boundingBox())!
  const initialComposerBox = (await page.locator('.composer').boundingBox())!
  expect(sharedPanelBox.y + sharedPanelBox.height).toBeGreaterThan(
    initialComposerBox.y + initialComposerBox.height,
  )
  await page.getByRole('button', { name: '展开输入框' }).click()
  await expect.poll(distance).toBeLessThanOrEqual(1)
  await assertLatestIsUncovered()
  await page.getByRole('button', { name: '收起输入框' }).click()
  await expect.poll(distance).toBeLessThanOrEqual(1)
  await expect(button.locator('svg.lucide-ellipsis')).toBeVisible()
  await expect(button).toHaveCSS('border-radius', '50%')
  await panel.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBe(0)
  const append = async (text: string) => {
    const baseRevision = message.revision++
    message.content += `\n\n${text}`
    socket!.send(
      JSON.stringify({
        type: 'MESSAGE_UPDATED',
        payload: {
          conversationId: 4,
          turnId: 7,
          cursor: message.revision,
          patches: [{ operation: 'REPLACE', baseRevision, message }],
        },
      }),
    )
    await expect(page.locator('.agent-answer .message-markdown')).toContainText(text)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
  }
  await append('用户阅读历史时追加的回复')
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0)
  const panelBox = (await panel.boundingBox())!
  const buttonBox = (await button.boundingBox())!
  expect(
    Math.abs(buttonBox.x + buttonBox.width / 2 - panelBox.x - panelBox.width / 2),
  ).toBeLessThan(1)
  await expect(button).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('message-bottom-replying.png'),
    fullPage: true,
  })
  await button.click()
  await expect.poll(distance).toBeLessThanOrEqual(1)
  await append('回到底部后继续自动跟随')
  await expect.poll(distance).toBeLessThanOrEqual(1)
  await assertLatestIsUncovered()
  running = false
  message.status = 'COMPLETED'
  socket!.send(
    JSON.stringify({ type: 'TURN_COMPLETED', payload: { conversationId: 4, turnId: 7 } }),
  )
  await expect(button).toHaveCount(0)
  await panel.evaluate((element) => element.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(button.locator('svg.lucide-arrow-down')).toBeVisible()
  await page.getByRole('button', { name: '切换到深色主题' }).click()
  await expect(button).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await page.setViewportSize({ width: 390, height: 700 })
  await expect(button).toBeInViewport()
  const mobileButton = (await button.boundingBox())!
  expect(mobileButton.y + mobileButton.height).toBeLessThanOrEqual(
    (await page.locator('.composer').boundingBox())!.y,
  )
  await page.screenshot({
    path: testInfo.outputPath('message-bottom-mobile-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await button.focus()
  await button.press('Enter')
  await expect.poll(distance).toBeLessThanOrEqual(1)
  await expect(button).toHaveCount(0)
  expect(errors).toEqual([])
})

test.describe('Conversation message outline', () => {
  type OutlineMessage = {
    id: number
    turnId: number
    sequenceNo: number
    role: string
    messageType: string
    messageKey: string
    revision: number
    status: string
    content: string
  }

  async function outlineFixtures(page: Page) {
    const errors = await fixtures(page)
    const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
    const makeMessages = (startTurn: number, count: number): OutlineMessage[] =>
      Array.from({ length: count }, (_, index) => {
        const turnId = startTurn + index
        const common = { turnId, revision: 1, status: 'COMPLETED' }
        return [
          {
            ...common,
            id: turnId * 10,
            sequenceNo: index * 3 + 1,
            role: 'USER',
            messageType: 'TEXT',
            messageKey: `outline-user-${turnId}`,
            content: `第${index + 1}次请求：请检查项目中的第${index + 1}个模块，并说明实现和验证结果。`,
          },
          {
            ...common,
            id: turnId * 10 + 1,
            sequenceNo: index * 3 + 2,
            role: 'ASSISTANT',
            messageType: 'ACTIVITY',
            messageKey: `outline-process-${turnId}`,
            content: JSON.stringify({
              id: `command-${turnId}`,
              type: 'commandExecution',
              command: `echo module-${index + 1}`,
              status: 'completed',
              aggregatedOutput: '检查完成',
            }),
          },
          {
            ...common,
            id: turnId * 10 + 2,
            sequenceNo: index * 3 + 3,
            role: 'ASSISTANT',
            messageType: 'TEXT',
            messageKey: `outline-answer-${turnId}`,
            content: `### 第${index + 1}轮回复\n\n${Array.from(
              { length: 8 },
              (_, paragraph) =>
                `检查记录 ${paragraph + 1}：模块 ${index + 1} 的页面交互、消息状态与资源释放均已逐项核对。`,
            ).join('\n\n')}`,
          },
        ]
      }).flat()
    const messages = makeMessages(100, 16)
    const shortMessages = makeMessages(200, 2)
    const latest = messages.at(-1)!
    latest.status = 'STREAMING'
    const snapshots = [
      {
        ...conversation,
        title: '长会话',
        latestTurnId: 115,
        latestTurnStatus: 'RUNNING',
      },
      {
        ...conversation,
        id: 5,
        title: '短会话',
        latestTurnId: 201,
        latestTurnStatus: 'COMPLETED',
      },
    ]
    const conversationId = (url: string) =>
      Number(new URL(url).pathname.match(/\/conversations\/(\d+)/)?.[1])
    await page.route(/\/api\/v1\/projects\/3\/conversations(?:\?.*)?$/, (route) =>
      route.fulfill({ json: response(snapshots) }),
    )
    await page.route(/\/api\/v1\/projects\/3\/conversations\/\d+$/, (route) =>
      route.fulfill({
        json: response(
          snapshots.find((snapshot) => snapshot.id === conversationId(route.request().url())),
        ),
      }),
    )
    await page.route('**/active-turn', (route) =>
      route.fulfill({
        json: response(
          conversationId(route.request().url()) === 4 ? { id: 115, status: 'RUNNING' } : null,
        ),
      }),
    )
    await page.route('**/message-state?*', (route) => {
      const longConversation = conversationId(route.request().url()) === 4
      return route.fulfill({
        json: response({
          messages: longConversation ? messages : shortMessages,
          turnId: longConversation ? 115 : 201,
          cursor: longConversation ? latest.revision : 1,
          hasMore: false,
          degraded: false,
          resetRequired: false,
          updates: [],
        }),
      })
    })
    await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
    let socket: WebSocketRoute | undefined
    await page.routeWebSocket('**/ws/client?*', (connected) => {
      socket = connected
    })
    const append = async (text: string) => {
      const baseRevision = latest.revision++
      latest.content += `\n\n${text}`
      await expect.poll(() => Boolean(socket)).toBe(true)
      socket!.send(
        JSON.stringify({
          type: 'MESSAGE_UPDATED',
          payload: {
            conversationId: 4,
            turnId: 115,
            cursor: latest.revision,
            patches: [{ operation: 'REPLACE', baseRevision, message: latest }],
          },
        }),
      )
      await expect(page.locator('.agent-answer').last()).toContainText(text)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      )
    }
    return {
      errors,
      append,
      panel: page.locator('.message-panel'),
      outline: page.getByRole('navigation', { name: '会话消息导航' }),
    }
  }

  test('previews each Turn and jumps to its user message without interrupting history reading', async ({
    page,
  }, testInfo) => {
    const state = await outlineFixtures(page)
    await page.goto('/projects/3?id=4')
    const items = state.outline.getByRole('button', { name: /^跳转到/ })
    await expect(items).toHaveCount(16)
    await expect(page.locator('.message-row[data-message-id]')).toHaveCount(32)
    await expect
      .poll(() =>
        state.panel.evaluate(
          (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
        ),
      )
      .toBeLessThanOrEqual(1)
    const beforeHover = await state.panel.evaluate((element) => element.scrollTop)
    const targetButton = items.nth(4)
    await targetButton.hover()
    await expect(page.getByRole('tooltip')).toContainText('第5次请求')
    await expect(page.getByRole('tooltip')).toContainText('第5轮回复')
    expect(await state.panel.evaluate((element) => element.scrollTop)).toBe(beforeHover)
    await page.screenshot({
      path: testInfo.outputPath('conversation-outline-preview-light.png'),
      fullPage: true,
      animations: 'disabled',
    })
    const buttonBox = (await targetButton.boundingBox())!
    const previewBox = (await page.getByRole('tooltip').boundingBox())!
    await page.mouse.move(previewBox.x + 12, buttonBox.y + buttonBox.height / 2, { steps: 12 })
    await expect(page.getByRole('tooltip')).toContainText('第5次请求')
    expect(await state.panel.evaluate((element) => element.scrollTop)).toBe(beforeHover)

    await targetButton.click()
    const target = page.locator('.message-row[data-message-id="user-1040"]')
    await expect(targetButton).toHaveAttribute('aria-current', 'location')
    await expect
      .poll(async () => (await target.boundingBox())!.y - (await state.panel.boundingBox())!.y)
      .toBeGreaterThanOrEqual(0)
    expect((await target.boundingBox())!.y - (await state.panel.boundingBox())!.y).toBeLessThan(80)
    await expect(target).toBeInViewport()
    await state.panel.evaluate((element) => {
      const row = element.querySelector<HTMLElement>('[data-message-id="assistant-104"]')!
      element.scrollTop +=
        row.getBoundingClientRect().top - element.getBoundingClientRect().top - 16
    })
    await expect(targetButton).toHaveAttribute('aria-current', 'location')
    const historyPosition = await state.panel.evaluate((element) => element.scrollTop)
    await state.append('跳到历史消息后仍在后台生成的新段落')
    expect(
      Math.abs((await state.panel.evaluate((element) => element.scrollTop)) - historyPosition),
    ).toBeLessThanOrEqual(1)
    await expect(targetButton).toHaveAttribute('aria-current', 'location')
    await page.locator('.composer textarea').focus()
    await page.getByRole('heading', { name: '长会话', exact: true }).hover()
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('conversation-outline-history-light.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await state.panel.evaluate((element) => {
      const row = element.querySelector<HTMLElement>('[data-message-id="assistant-107"]')!
      element.scrollTop +=
        row.getBoundingClientRect().top - element.getBoundingClientRect().top - 16
    })
    await expect(items.nth(7)).toHaveAttribute('aria-current', 'location')
    await expect(targetButton).not.toHaveAttribute('aria-current', 'location')
    expect(state.errors).toEqual([])
  })

  test('replaces the outline and target locations when switching Conversations', async ({
    page,
  }) => {
    const state = await outlineFixtures(page)
    await page.goto('/projects/3?id=4')
    const items = state.outline.getByRole('button', { name: /^跳转到/ })
    await expect(items).toHaveCount(16)
    await items.nth(4).click()
    await page
      .getByRole('region', { name: '工作区项目与会话' })
      .getByRole('link', { name: '短会话', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: '短会话', exact: true })).toBeVisible()
    await expect(items).toHaveCount(2)
    await expect(page.locator('.message-row[data-message-id="user-1040"]')).toHaveCount(0)
    await items.first().focus()
    const beforeKeyboardPreview = await state.panel.evaluate((element) => element.scrollTop)
    await items.first().press('ArrowDown')
    await expect(items.nth(1)).toBeFocused()
    await expect(page.getByRole('tooltip')).toContainText('第2次请求')
    await expect(page.getByRole('tooltip')).toContainText('第2轮回复')
    expect(await state.panel.evaluate((element) => element.scrollTop)).toBe(beforeKeyboardPreview)
    await items.nth(1).press('Enter')
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('.message-row[data-message-id="user-2010"]')).toBeInViewport()
    await items.nth(1).press('Home')
    await expect(items.first()).toBeFocused()
    await items.first().press('Enter')
    await expect(items.first()).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('.message-row[data-message-id="user-2000"]')).toBeInViewport()
    await expect(page.getByRole('tooltip')).toContainText('第1次请求')
    await items.nth(1).click()
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'location')
    await expect(page.locator('.message-row[data-message-id="user-2010"]')).toBeInViewport()
    await page.setViewportSize({ width: 1440, height: 2400 })
    await expect
      .poll(() => state.panel.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBe(0)
    await items.first().click()
    await expect(items.first()).toHaveAttribute('aria-current', 'location')
    expect(state.errors).toEqual([])
  })

  test('hides the outline and its gutter when a viewport, split pane or composer leaves too little room', async ({
    page,
  }, testInfo) => {
    const state = await outlineFixtures(page)
    await page.route('**/workspace-files**', (route) =>
      route.fulfill({
        json: {
          status: 'success',
          code: 200,
          info: '',
          data: {
            path: '',
            generation: '1',
            entries: [],
            nextCursor: null,
            loaded: true,
            online: true,
            supported: true,
            operation: null,
            maxFileBytes: 20971520,
          },
        },
      }),
    )
    await page.goto('/projects/3?id=4')
    const items = state.outline.getByRole('button', { name: /^跳转到/ })
    await expect(items).toHaveCount(16)
    await page.getByRole('button', { name: '切换到深色主题' }).click()
    const expectNoGutter = async () => {
      await expect(state.outline).toBeHidden()
      await expect(page.locator('.message-viewport')).not.toHaveClass(/message-viewport--outlined/)
      await expect
        .poll(() =>
          state.panel.evaluate((element) => {
            const styles = getComputedStyle(element)
            return parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)
          }),
        )
        .toBe(0)
    }
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 700 })
      await expectNoGutter()
      expect(await page.locator('body').evaluate((body) => body.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.screenshot({
        path: testInfo.outputPath(`conversation-outline-hidden-${width}-dark.png`),
        fullPage: true,
        animations: 'disabled',
      })
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await expect(items).toHaveCount(16)
    await page.getByRole('button', { name: '工作区文件', exact: true }).click()
    const separator = page.getByRole('separator', { name: '调整会话宽度' })
    await separator.press('Home')
    await expect
      .poll(() => page.locator('.message-viewport').evaluate((element) => element.clientWidth))
      .toBeLessThan(640)
    await expectNoGutter()
    await separator.press('End')
    await expect(state.outline).toBeVisible()
    await page
      .getByRole('complementary', { name: '工作区文件' })
      .getByRole('button', { name: '收起工作区文件' })
      .click()

    await page.setViewportSize({ width: 1440, height: 600 })
    await expect(state.outline).toBeVisible()
    await page.getByRole('button', { name: '展开输入框' }).click()
    await expect
      .poll(() =>
        page.locator('.message-viewport').evaluate((element) => {
          const dock = element.querySelector('.conversation-dock')!
          return element.clientHeight - dock.getBoundingClientRect().height - 40
        }),
      )
      .toBeLessThan(180)
    await expectNoGutter()
    await page.screenshot({
      path: testInfo.outputPath('conversation-outline-hidden-expanded-dark.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('button', { name: '收起输入框' }).click()
    await expect(items).toHaveCount(16)
    await expect(state.outline).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 500 })
    await expect(state.outline).toBeVisible()
    await items.first().hover()
    const beforeEndPreview = await state.panel.evaluate((element) => element.scrollTop)
    await items.first().press('End')
    await expect(items.last()).toBeFocused()
    await expect
      .poll(() =>
        state.outline
          .locator('.conversation-outline__track')
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await expect(page.getByRole('tooltip')).toContainText('第16次请求')
    await expect(page.getByRole('tooltip')).toContainText('第16轮回复')
    expect(await state.panel.evaluate((element) => element.scrollTop)).toBe(beforeEndPreview)
    expect(state.errors).toEqual([])
  })

  test('magnifies nearby Turn lines symmetrically from a fixed left edge without moving content', async ({
    page,
  }, testInfo) => {
    const state = await outlineFixtures(page)
    await page.goto('/projects/3?id=4')
    const items = state.outline.getByRole('button', { name: /^跳转到/ })
    const lines = state.outline.locator('.conversation-outline__line')
    await expect(items).toHaveCount(16)
    const scales = () =>
      lines.evaluateAll((elements) =>
        elements.map((element) => {
          const transform = getComputedStyle(element).transform
          return transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a
        }),
      )
    await expect.poll(scales).toEqual(Array(16).fill(1))
    const before = await items.evaluateAll((elements) =>
      elements.map((element) => {
        const button = element.getBoundingClientRect()
        const line = element.querySelector('.conversation-outline__line')!.getBoundingClientRect()
        return {
          x: button.x,
          y: button.y,
          width: button.width,
          height: button.height,
          lineX: line.x,
          lineY: line.y,
        }
      }),
    )
    const messageBox = (await page.locator('.message-row').last().boundingBox())!
    const center = before[7]!
    await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2)
    await expect.poll(async () => (await scales())[7]).toBeCloseTo(2.6, 2)
    const magnified = await scales()
    for (const offset of [1, 2, 3]) {
      expect(magnified[7 - offset]).toBeCloseTo(magnified[7 + offset]!, 2)
      expect(magnified[7 + offset]).toBeGreaterThan(1)
      expect(magnified[7 + offset - 1]).toBeGreaterThan(magnified[7 + offset]!)
      const distance = before[7 + offset]!.y - center.y
      expect(magnified[7 + offset]).toBeCloseTo(
        1 + 0.8 * (1 + Math.cos((Math.PI * distance) / 90)),
        2,
      )
    }
    expect(magnified[0]).toBeCloseTo(1, 2)
    expect(magnified[15]).toBeCloseTo(1, 2)
    const widths = await lines.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().width),
    )
    expect(widths[7]).toBe(Math.max(...widths))
    const after = await items.evaluateAll((elements) =>
      elements.map((element) => {
        const button = element.getBoundingClientRect()
        const line = element.querySelector('.conversation-outline__line')!.getBoundingClientRect()
        return {
          x: button.x,
          y: button.y,
          width: button.width,
          height: button.height,
          lineX: line.x,
          lineY: line.y,
        }
      }),
    )
    expect(after).toEqual(before)
    expect(await page.locator('.message-row').last().boundingBox()).toEqual(messageBox)
    await expect(page.getByRole('tooltip')).toContainText('第8次请求')
    await expect(page.getByRole('tooltip')).toContainText('第8轮回复')
    await page.screenshot({
      path: testInfo.outputPath('conversation-outline-fisheye-light.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('button', { name: '切换到深色主题' }).click()
    await items.nth(7).hover()
    await expect.poll(async () => (await scales())[7]).toBeCloseTo(2.6, 2)
    await page.screenshot({
      path: testInfo.outputPath('conversation-outline-fisheye-dark.png'),
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByRole('heading', { name: '长会话', exact: true }).hover()
    await expect.poll(scales).toEqual(Array(16).fill(1))
    expect(state.errors).toEqual([])
  })
})

async function fixtures(page: Page, authenticated = true) {
  const profile = {
    id: 1,
    email: 'tester@example.com',
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
    activated: true,
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
  await expect(page.getByRole('alert')).toContainText('请输入邮箱')
  await page.getByPlaceholder('请输入邮箱').fill('admin@example.com')
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
  const content = await page.locator('.message-panel__content').boundingBox()
  expect(Math.abs(row!.x + row!.width / 2 - (content!.x + content!.width / 2))).toBeLessThan(1)
  await page.screenshot({ path: 'test-results/workspace-chat.png', fullPage: true })
  expect(errors).toEqual([])
})

test('sidebar search and mobile drawer keep conversations accessible', async ({ page }) => {
  const errors = await fixtures(page)
  await page.route(/\/api\/v1\/projects(?:\?.*)?$/, (route) => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword') || ''
    return route.fulfill({
      json: {
        status: 'success',
        code: 200,
        info: '',
        data: [project].filter(
          (item) => item.projectName.includes(keyword) || conversation.title.includes(keyword),
        ),
      },
    })
  })
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

test('Conversation displays an active writer error and retains failure after legacy refresh', async ({
  page,
}, testInfo) => {
  const errors = await fixtures(page)
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const failure =
    'Codex method failed: thread/resume: thread 01a0846c-f650-7291-ab2f-48c61a1bb4f4 already has an active writer'
  let socket: WebSocketRoute | undefined
  let failed = false
  let activeTurnReads = 0
  let messageStateReads = 0
  // Reproduce the older server response: neither list nor detail contains latest Turn fields.
  await page.route(/\/api\/v1\/projects\/3\/conversations(?:\?.*)?$/, (route) =>
    route.fulfill({ json: response([conversation]) }),
  )
  await page.route('**/api/v1/projects/3/conversations/4', (route) =>
    route.fulfill({ json: response(conversation) }),
  )
  await page.route('**/active-turn', (route) => {
    activeTurnReads++
    return route.fulfill({
      json: response(
        failed ? null : { id: 18, status: 'CREATED', preparationPhase: 'EXPERT_SKILLS' },
      ),
    })
  })
  await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
  await page.route('**/message-state?*', (route) => {
    messageStateReads++
    return route.fulfill({
      json: response({
        turnId: 18,
        cursor: 0,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
        messages: [
          {
            id: 180,
            turnId: 18,
            sequenceNo: 1,
            role: 'USER',
            messageType: 'TEXT',
            status: 'COMPLETED',
            content: '请继续检查项目。',
          },
        ],
      }),
    })
  })
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.goto('/projects/3?id=4')
  const workbench = page.locator('.conversation-workbench')
  const titleStatus = workbench.locator('.conversation-title [role="status"]')
  const stop = workbench.getByRole('button', { name: '停止生成', exact: true })
  const input = workbench.getByRole('textbox')
  await expect(titleStatus).toHaveText('正在准备专家 Skills')
  await expect(stop).toBeVisible()
  await expect(input).toBeDisabled()
  await expect.poll(() => Boolean(socket)).toBe(true)

  const previousActiveReads = activeTurnReads
  const previousMessageReads = messageStateReads
  failed = true
  socket!.send(
    JSON.stringify({
      type: 'ERROR',
      deviceId: 1,
      correlationId: '18',
      payload: { commandType: 'START_TURN', errorCode: 'COMMAND_FAILED', message: failure },
    }),
  )
  const failureAlert = workbench.getByRole('alert').filter({ hasText: failure })
  await expect(titleStatus).toHaveText('回复失败')
  await expect(failureAlert).toHaveText(failure)
  await expect(failureAlert).toBeVisible()
  await expect.poll(() => activeTurnReads).toBeGreaterThan(previousActiveReads)
  await expect.poll(() => messageStateReads).toBeGreaterThan(previousMessageReads)
  await expect(stop).toHaveCount(0)
  await expect(workbench.locator('.agent-message')).toHaveCount(0)
  await expect(workbench.locator('.message-row--user')).toContainText('请继续检查项目。')

  // A further manual refresh returns active-turn=null again without erasing the received failure.
  const beforeManualRefresh = activeTurnReads
  await workbench.getByRole('button', { name: '刷新', exact: true }).click()
  await expect.poll(() => activeTurnReads).toBeGreaterThan(beforeManualRefresh)
  await expect(titleStatus).toHaveText('回复失败')
  await expect(failureAlert).toBeVisible()
  await expect(stop).toHaveCount(0)
  await expect(input).toBeEnabled()
  await input.fill('释放占用后重试原会话')
  await expect(workbench.getByRole('button', { name: '发送任务', exact: true })).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath('conversation-active-writer-error.png'),
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test.describe('sidebar Conversation activity', () => {
  type Snapshot = typeof conversation & {
    latestTurnId: number | null
    latestTurnStatus: string | null
    latestTurnFailureMessage?: string | null
    latestTurnHasIncompleteMessage?: boolean
  }

  async function activityFixtures(page: Page) {
    const errors = await fixtures(page)
    const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
    const snapshots: Snapshot[] = [
      { ...conversation, latestTurnId: 7, latestTurnStatus: 'COMPLETED' },
      {
        ...conversation,
        id: 5,
        title: '后台会话',
        latestTurnId: 20,
        latestTurnStatus: 'COMPLETED',
      },
      {
        ...conversation,
        id: 6,
        title: '失败会话',
        latestTurnId: 30,
        latestTurnStatus: 'FAILED',
        latestTurnFailureMessage: '模型请求失败',
      },
      {
        ...conversation,
        id: 7,
        title: '空会话',
        latestTurnId: null,
        latestTurnStatus: null,
      },
      {
        ...conversation,
        id: 8,
        title: '不完整会话',
        latestTurnId: 40,
        latestTurnStatus: 'COMPLETED',
        latestTurnHasIncompleteMessage: true,
      },
    ]
    const sockets: WebSocketRoute[] = []
    let snapshotRequests = 0
    await page.route(/\/api\/v1\/projects\/3\/conversations(?:\?.*)?$/, (route) => {
      snapshotRequests++
      return route.fulfill({ json: response(snapshots) })
    })
    await page.route(/\/api\/v1\/projects\/3\/conversations\/status\?.*/, (route) => {
      snapshotRequests++
      const ids = new URL(route.request().url()).searchParams.get('ids')!.split(',').map(Number)
      return route.fulfill({ json: response(snapshots.filter((item) => ids.includes(item.id))) })
    })
    const snapshotFor = (url: string) => {
      const id = Number(new URL(url).pathname.match(/\/conversations\/(\d+)/)?.[1])
      return snapshots.find((item) => item.id === id)!
    }
    await page.route(/\/api\/v1\/projects\/3\/conversations\/\d+$/, (route) =>
      route.fulfill({ json: response(snapshotFor(route.request().url())) }),
    )
    await page.route('**/active-turn', (route) => {
      const snapshot = snapshotFor(route.request().url())
      return route.fulfill({
        json: response(
          ['CREATED', 'RUNNING', 'WAITING_APPROVAL'].includes(snapshot.latestTurnStatus || '')
            ? { id: snapshot.latestTurnId, status: snapshot.latestTurnStatus }
            : null,
        ),
      })
    })
    await page.route('**/message-state?*', (route) => {
      const snapshot = snapshotFor(route.request().url())
      const turnId = snapshot.latestTurnId
      const userMessage = {
        id: (turnId || 0) * 10,
        turnId,
        sequenceNo: 1,
        role: 'USER',
        messageType: 'TEXT',
        status: 'COMPLETED',
        content: `${snapshot.title}的请求`,
      }
      return route.fulfill({
        json: response({
          turnId,
          cursor: 0,
          hasMore: false,
          degraded: false,
          resetRequired: false,
          updates: [],
          messages:
            turnId == null
              ? []
              : snapshot.latestTurnStatus === 'FAILED'
                ? [userMessage]
                : [
                    userMessage,
                    {
                      id: turnId * 10 + 1,
                      turnId,
                      sequenceNo: 2,
                      role: 'ASSISTANT',
                      messageType: 'TEXT',
                      status: snapshot.latestTurnHasIncompleteMessage
                        ? 'INCOMPLETE'
                        : snapshot.latestTurnStatus === 'COMPLETED'
                          ? 'COMPLETED'
                          : 'STREAMING',
                      content: `${snapshot.title}的回复`,
                    },
                  ],
        }),
      })
    })
    await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
    await page.routeWebSocket('**/ws/client?*', (socket) => sockets.push(socket))
    const link = (title: string) =>
      page
        .getByRole('region', { name: '工作区项目与会话' })
        .getByRole('link', { name: title, exact: true })
    const indicator = (title: string) => link(title).locator('.workspace-conversation__activity')
    return { errors, snapshots, sockets, link, indicator, snapshotRequests: () => snapshotRequests }
  }

  test('restores latest Turn snapshots, incomplete messages and accessible status after reload', async ({
    page,
  }, testInfo) => {
    const state = await activityFixtures(page)
    await page.goto('/devices')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCSS(
      'background-color',
      'rgb(37, 99, 235)',
    )
    await expect(state.link('后台会话')).toHaveAccessibleName('后台会话')
    await expect(state.link('后台会话')).toHaveAccessibleDescription('回复已完成')
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'error')
    await expect(state.indicator('失败会话').locator('.workspace-conversation__dot')).toHaveCSS(
      'background-color',
      'rgb(220, 38, 38)',
    )
    await expect(state.link('失败会话')).toHaveAccessibleDescription('模型请求失败')
    await expect(state.indicator('空会话')).toHaveAttribute('data-state', 'idle')
    await expect(
      state.indicator('空会话').locator('svg, .workspace-conversation__dot'),
    ).toHaveCount(0)
    await expect(state.indicator('不完整会话')).toHaveAttribute('data-state', 'error')
    await expect(state.link('不完整会话')).toHaveAccessibleDescription('消息接收不完整')

    await page.getByRole('button', { name: '切换到深色主题' }).click()
    await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCSS(
      'background-color',
      'rgb(96, 165, 250)',
    )
    await expect(state.indicator('失败会话').locator('.workspace-conversation__dot')).toHaveCSS(
      'background-color',
      'rgb(248, 113, 113)',
    )
    const requestsBeforeReload = state.snapshotRequests()
    await page.reload()
    await expect.poll(state.snapshotRequests).toBeGreaterThan(requestsBeforeReload)
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'error')
    await expect(state.indicator('不完整会话')).toHaveAttribute('data-state', 'error')
    await expect(
      state.indicator('空会话').locator('svg, .workspace-conversation__dot'),
    ).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('sidebar-activity-dark.png'),
      fullPage: true,
    })
    expect(state.errors).toEqual([])
  })

  test('updates non-current Conversations over the same socket after leaving the workspace', async ({
    page,
  }) => {
    const state = await activityFixtures(page)
    const background = state.snapshots.find((item) => item.id === 5)!
    await page.goto('/projects/3?id=4')
    await expect(page.getByRole('heading', { name: '测试会话', exact: true })).toBeVisible()
    await expect(state.indicator('测试会话')).toHaveAttribute('data-state', 'idle')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect.poll(() => state.sockets.length).toBe(1)
    const publish = (type: string, turnId: number, status: string) => {
      background.latestTurnId = turnId
      background.latestTurnStatus = status
      state.sockets[0]!.send(
        JSON.stringify({ type, payload: { projectId: 3, conversationId: 5, turnId } }),
      )
    }

    publish('TURN_STARTED', 21, 'RUNNING')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    const spinner = state.indicator('后台会话').locator('.workspace-conversation__spinner')
    await expect(spinner).toBeVisible()
    await expect(spinner).toHaveCSS('animation-name', 'conversation-activity-spin')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(spinner).toHaveCSS('animation-name', 'none')
    await expect(state.link('后台会话')).toHaveAccessibleDescription('Agent 正在回复')
    await expect(page.getByRole('heading', { name: '测试会话', exact: true })).toBeVisible()

    await page.getByRole('link', { name: '设备管理', exact: true }).click()
    await expect(page).toHaveURL(/\/devices$/)
    await expect(page.locator('.conversation-workbench')).toHaveCount(0)
    expect(state.sockets).toHaveLength(1)
    publish('TURN_COMPLETED', 21, 'COMPLETED')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toBeVisible()
    publish('TURN_STARTED', 22, 'RUNNING')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    publish('TURN_FAILED', 22, 'FAILED')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'error')
    await expect(state.link('后台会话')).toHaveAccessibleDescription('回复异常')
    await expect(state.indicator('空会话')).toHaveAttribute('data-state', 'idle')
    await page.reload()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'error')
    expect(state.errors).toEqual([])
  })

  test('marks a disconnected running Conversation red and reconciles missed completion on reconnect', async ({
    page,
  }) => {
    const state = await activityFixtures(page)
    const background = state.snapshots.find((item) => item.id === 5)!
    background.latestTurnStatus = 'RUNNING'
    await page.goto('/devices')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    await expect.poll(() => state.sockets.length).toBe(1)
    await state.sockets[0]!.close({ code: 1001, reason: 'Test connection interrupted' })
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'error')
    await expect(state.link('后台会话')).toHaveAccessibleDescription('连接已断开，暂时无法接收消息')
    await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCSS(
      'background-color',
      'rgb(220, 38, 38)',
    )
    await expect(state.indicator('测试会话')).toHaveAttribute('data-state', 'completed')

    // No terminal socket frame is sent: the restored connection must consult the server snapshot.
    background.latestTurnStatus = 'COMPLETED'
    const beforeReconnect = state.snapshotRequests()
    await expect.poll(() => state.sockets.length, { timeout: 10000 }).toBe(2)
    await expect.poll(state.snapshotRequests).toBeGreaterThan(beforeReconnect)
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect(state.link('后台会话')).toHaveAccessibleDescription('回复已完成')
    await expect(
      state.indicator('后台会话').locator('.workspace-conversation__spinner'),
    ).toHaveCount(0)
    expect(state.errors).toEqual([])
  })

  test('clears blue and red markers after reading and keeps them cleared after reload', async ({
    page,
  }) => {
    const state = await activityFixtures(page)
    await page.goto('/devices')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'error')

    await state.link('后台会话').click()
    await expect(page.locator('.agent-answer')).toContainText('后台会话的回复')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')
    await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCount(0)
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'error')

    await state.link('失败会话').click()
    const workbench = page.locator('.conversation-workbench')
    await expect(workbench.getByRole('alert').filter({ hasText: '模型请求失败' })).toBeVisible()
    await expect(workbench.locator('.conversation-title [role="status"]')).toHaveText('回复失败')
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'idle')
    await expect(state.indicator('失败会话').locator('.workspace-conversation__dot')).toHaveCount(0)

    await page.getByRole('link', { name: '设备管理', exact: true }).click()
    await page.reload()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')
    await expect(state.indicator('失败会话')).toHaveAttribute('data-state', 'idle')
    await expect(state.indicator('不完整会话')).toHaveAttribute('data-state', 'error')
    expect(state.errors).toEqual([])
  })

  test('shows new terminal markers for later Turns of a previously read Conversation on a management page', async ({
    page,
  }) => {
    const state = await activityFixtures(page)
    const background = state.snapshots.find((item) => item.id === 5)!
    await page.goto('/projects/3?id=5')
    await expect(page.locator('.agent-answer')).toContainText('后台会话的回复')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')
    await expect.poll(() => state.sockets.length).toBe(1)
    const publish = (type: string, turnId: number, status: string) => {
      background.latestTurnId = turnId
      background.latestTurnStatus = status
      background.latestTurnHasIncompleteMessage = false
      background.latestTurnFailureMessage = status === 'FAILED' ? '后续执行失败' : null
      state.sockets.at(-1)!.send(
        JSON.stringify({
          type,
          payload: {
            projectId: 3,
            conversationId: 5,
            turnId,
            reason: background.latestTurnFailureMessage,
          },
        }),
      )
    }

    await page.getByRole('link', { name: '设备管理', exact: true }).click()
    publish('TURN_STARTED', 21, 'RUNNING')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    publish('TURN_COMPLETED', 21, 'COMPLETED')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await page.reload()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
    await expect.poll(() => state.sockets.length).toBe(2)
    await state.link('后台会话').click()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')

    await page.getByRole('link', { name: '设备管理', exact: true }).click()
    publish('TURN_STARTED', 22, 'RUNNING')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    publish('TURN_FAILED', 22, 'FAILED')
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'error')
    await state.link('后台会话').click()
    await expect(
      page
        .locator('.conversation-workbench')
        .getByRole('alert')
        .filter({ hasText: '后续执行失败' }),
    ).toBeVisible()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')
    expect(state.errors).toEqual([])
  })

  test('keeps completion unread while its Conversation is in a background tab', async ({
    page,
  }) => {
    const state = await activityFixtures(page)
    const background = state.snapshots.find((item) => item.id === 5)!
    background.latestTurnStatus = 'RUNNING'
    await page.goto('/projects/3?id=5')
    await page.bringToFront()
    await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'running')
    await expect.poll(() => state.sockets.length).toBe(1)
    // Headless Chrome keeps multiple pages focused. Simulate the browser signals instead.
    const setForeground = (foreground: boolean) =>
      page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: value ? 'visible' : 'hidden',
        })
        Object.defineProperty(document, 'hasFocus', {
          configurable: true,
          value: () => value,
        })
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event(value ? 'focus' : 'blur'))
      }, foreground)
    try {
      await setForeground(false)
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false)
      expect(await page.evaluate(() => document.visibilityState)).toBe('hidden')
      background.latestTurnStatus = 'COMPLETED'
      state.sockets[0]!.send(
        JSON.stringify({
          type: 'TURN_COMPLETED',
          payload: { projectId: 3, conversationId: 5, turnId: 20 },
        }),
      )
      await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'completed')
      await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCount(
        1,
      )
      await setForeground(true)
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
      await expect(state.indicator('后台会话')).toHaveAttribute('data-state', 'idle')
      await expect(state.indicator('后台会话').locator('.workspace-conversation__dot')).toHaveCount(
        0,
      )
    } finally {
      await page.evaluate(() => {
        Reflect.deleteProperty(document, 'visibilityState')
        Reflect.deleteProperty(document, 'hasFocus')
        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('focus'))
      })
    }
    expect(state.errors).toEqual([])
  })
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
  const queue = page.getByRole('list', { name: '待发送附件' })
  await expect(queue.locator('.attachment-queue__file')).toHaveCount(1)
  await expect(queue.locator('.attachment-queue__placeholder')).toHaveCount(4)
  const queueBox = (await queue.boundingBox())!
  const hintBox = (await page
    .locator('.composer')
    .getByText(/上传到工作区根目录 · 最多/)
    .boundingBox())!
  const expertBox = (await page.locator('.composer__expert').boundingBox())!
  const retention = page.locator('.composer').getByText(/移除附件只取消消息关联/)
  await expect(retention).toBeVisible()
  const retentionBox = (await retention.boundingBox())!
  const inputBox = (await page.locator('.composer textarea').boundingBox())!
  const composerBox = (await page.locator('.composer').boundingBox())!
  expect(Math.abs(composerBox.y - queueBox.y - queueBox.height)).toBeLessThanOrEqual(2)
  expect(hintBox.y).toBeGreaterThanOrEqual(composerBox.y)
  expect(
    hintBox.x >= expertBox.x + expertBox.width || hintBox.y >= expertBox.y + expertBox.height,
  ).toBe(true)
  expect(retentionBox.y).toBeGreaterThanOrEqual(hintBox.y + hintBox.height)
  expect(retentionBox.y + retentionBox.height).toBeLessThanOrEqual(inputBox.y)
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
  await page.route('**/attachments/90/downloads', (route) => {
    expect(route.request().postDataJSON().requestKey).toBeTruthy()
    expect(route.request().postDataJSON()).not.toHaveProperty('path')
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
    if (endpoint === '/operations')
      return route.fulfill({ json: response({ items: [], nextCursor: null }) })
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

test.describe('workspace sidebar pagination', () => {
  type PagedConversation = typeof conversation & {
    lastActivityAt: string
    latestTurnId: number | null
    latestTurnStatus: string | null
    latestTurnHasIncompleteMessage: boolean
  }
  type PageRead = {
    kind: 'projects' | 'conversations'
    projectId: number | null
    page: number
    size: number
    keyword: string
    settled: boolean
  }

  async function paginationFixtures(page: Page) {
    const errors = await fixtures(page)
    const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
    const projects = Array.from({ length: 25 }, (_, index) => ({
      ...project,
      id: index + 3,
      projectName: index === 24 ? '后页项目25' : `分页项目${String(index + 1).padStart(2, '0')}`,
      conversationCount: index === 0 ? 121 : index === 24 ? 41 : 0,
      lastActivityAt: new Date(Date.UTC(2026, 8, 9, 12) - index * 60000).toISOString(),
    }))
    const makeConversations = (projectId: number, startId: number, count: number) =>
      Array.from({ length: count }, (_, index): PagedConversation => ({
        ...conversation,
        id: startId + index,
        projectId,
        projectName: projects.find((item) => item.id === projectId)!.projectName,
        title:
          projectId === 3
            ? index === 120
              ? '未加载会话目标'
              : `分页会话${String(index + 1).padStart(3, '0')}`
            : index === 40
              ? '后页直达会话'
              : `后页会话${String(index + 1).padStart(3, '0')}`,
        codexThreadId: `thread-${startId + index}`,
        lastActivityAt: new Date(
          Date.parse(projects.find((item) => item.id === projectId)!.lastActivityAt) - index * 1000,
        ).toISOString(),
        latestTurnId: startId + index + 10000,
        latestTurnStatus: projectId === 3 && index === 10 ? 'RUNNING' : 'COMPLETED',
        latestTurnHasIncompleteMessage: false,
      }))
    const conversations: Record<number, PagedConversation[]> = Object.fromEntries(
      projects.map((item) => [item.id, []]),
    )
    conversations[3] = makeConversations(3, 3001, 121)
    conversations[27] = makeConversations(27, 270001, 41)
    const projectMatches = (item: (typeof projects)[number], keyword: string) =>
      [
        item.projectName,
        item.deviceName,
        device.deviceCode,
        item.workspaceName,
        item.rootPath,
      ].some((value) => value.includes(keyword))
    const reads: PageRead[] = []
    const statusReads: { projectId: number; ids: number[] }[] = []
    const sockets: WebSocketRoute[] = []
    const failures = new Set<string>()
    const holds = new Map<string, Promise<void>>()
    const readKey = (kind: PageRead['kind'], projectId: number | null, keyword: string) =>
      `${kind}:${projectId || 0}:${keyword}`
    const hold = (kind: PageRead['kind'], projectId: number | null, keyword: string) => {
      let release!: () => void
      const key = readKey(kind, projectId, keyword)
      holds.set(key, new Promise<void>((resolve) => (release = resolve)))
      return () => {
        holds.delete(key)
        release()
      }
    }
    async function fulfillPage<T>(
      route: Route,
      kind: PageRead['kind'],
      projectId: number | null,
      source: T[],
    ) {
      const params = new URL(route.request().url()).searchParams
      const pageNumber = Number(params.get('page') || 1)
      const size = Number(params.get('size') || (kind === 'projects' ? 20 : 10))
      const keyword = params.get('keyword') || ''
      const read: PageRead = { kind, projectId, page: pageNumber, size, keyword, settled: false }
      reads.push(read)
      const key = readKey(kind, projectId, keyword)
      await holds.get(key)
      try {
        if (failures.delete(`${key}:${pageNumber}`)) {
          await route.fulfill({
            status: 503,
            json: { status: 'error', code: 503, info: '分页暂时不可用', data: null },
          })
        } else {
          await route.fulfill({
            json: response({
              items: source.slice((pageNumber - 1) * size, pageNumber * size),
              total: source.length,
              page: pageNumber,
              size,
            }),
          })
        }
      } finally {
        read.settled = true
      }
    }
    await page.route(/\/api\/v1\/projects(?:\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        const created = {
          ...project,
          id: 900,
          projectName: route.request().postDataJSON().projectName,
          conversationCount: 0,
          lastActivityAt: new Date().toISOString(),
        }
        projects.push(created)
        conversations[created.id] = []
        await route.fulfill({ json: response(created) })
        return
      }
      const keyword = new URL(route.request().url()).searchParams.get('keyword') || ''
      const filtered = projects
        .filter(
          (item) =>
            projectMatches(item, keyword) ||
            conversations[item.id]?.some((value) => value.title.includes(keyword)),
        )
        .sort((left, right) => Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt))
      await fulfillPage(route, 'projects', null, filtered)
    })
    await page.route(/\/api\/v1\/projects\/\d+$/, (route) => {
      const id = Number(new URL(route.request().url()).pathname.split('/').at(-1))
      return route.fulfill({ json: response(projects.find((item) => item.id === id)) })
    })
    await page.route(/\/api\/v1\/projects\/\d+\/conversations(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url())
      const projectId = Number(url.pathname.match(/\/projects\/(\d+)/)![1])
      if (route.request().method() === 'POST') {
        const created: PagedConversation = {
          ...conversation,
          id: 900001,
          projectId,
          projectName: projects.find((item) => item.id === projectId)!.projectName,
          title: route.request().postDataJSON().title,
          lastActivityAt: new Date().toISOString(),
          latestTurnId: null,
          latestTurnStatus: null,
          latestTurnHasIncompleteMessage: false,
        }
        conversations[projectId]!.push(created)
        await route.fulfill({ json: response(created) })
        return
      }
      const keyword = url.searchParams.get('keyword') || ''
      await fulfillPage(
        route,
        'conversations',
        projectId,
        (conversations[projectId] || []).filter(
          (item) =>
            projectMatches(
              projects.find((value) => value.id === projectId)!,
              keyword,
            ) || item.title.includes(keyword),
        ),
      )
    })
    await page.route(/\/api\/v1\/projects\/\d+\/conversations\/status\?ids=.*/, (route) => {
      const url = new URL(route.request().url())
      const projectId = Number(url.pathname.match(/\/projects\/(\d+)/)![1])
      const ids = url.searchParams
        .getAll('ids')
        .flatMap((value) => value.split(','))
        .map(Number)
      statusReads.push({ projectId, ids })
      return route.fulfill({
        json: response((conversations[projectId] || []).filter((item) => ids.includes(item.id))),
      })
    })
    const snapshotFor = (url: string) => {
      const match = new URL(url).pathname.match(/\/projects\/(\d+)\/conversations\/(\d+)/)!
      return conversations[Number(match[1])]!.find((item) => item.id === Number(match[2]))!
    }
    await page.route(/\/api\/v1\/projects\/\d+\/conversations\/\d+$/, (route) =>
      route.fulfill({ json: response(snapshotFor(route.request().url())) }),
    )
    await page.route('**/active-turn', (route) => {
      const snapshot = snapshotFor(route.request().url())
      return route.fulfill({
        json: response(
          snapshot.latestTurnStatus === 'RUNNING'
            ? { id: snapshot.latestTurnId, status: 'RUNNING' }
            : null,
        ),
      })
    })
    await page.route('**/message-state?*', (route) => {
      const snapshot = snapshotFor(route.request().url())
      const turnId = snapshot.latestTurnId
      return route.fulfill({
        json: response({
          turnId,
          cursor: 0,
          hasMore: false,
          degraded: false,
          resetRequired: false,
          updates: [],
          messages:
            turnId == null
              ? []
              : [
                  {
                    id: turnId * 10,
                    turnId,
                    sequenceNo: 1,
                    role: 'USER',
                    messageType: 'TEXT',
                    status: 'COMPLETED',
                    content: `${snapshot.title}的请求`,
                  },
                  {
                    id: turnId * 10 + 1,
                    turnId,
                    sequenceNo: 2,
                    role: 'ASSISTANT',
                    messageType: 'TEXT',
                    status: snapshot.latestTurnStatus === 'RUNNING' ? 'STREAMING' : 'COMPLETED',
                    content: `${snapshot.title}的完整回复`,
                  },
                ],
        }),
      })
    })
    await page.route('**/approvals', (route) => route.fulfill({ json: response([]) }))
    await page.routeWebSocket('**/ws/client?*', (socket) => sockets.push(socket))
    const sidebar = page.getByRole('region', { name: '工作区项目与会话' })
    const projectNode = (name: string) =>
      sidebar.locator('.workspace-project').filter({
        has: page.getByRole('link', { name, exact: true }),
      })
    const link = (title: string) => sidebar.getByRole('link', { name: title, exact: true })
    return {
      errors,
      projects,
      conversations,
      reads,
      statusReads,
      sockets,
      sidebar,
      projectNode,
      link,
      hold,
      failNext: (kind: PageRead['kind'], projectId: number | null, pageNumber: number) =>
        failures.add(`${readKey(kind, projectId, '')}:${pageNumber}`),
    }
  }

  test('loads projects and more than one hundred Conversations only on demand while preserving the draft', async ({
    page,
  }) => {
    await page.clock.install()
    const state = await paginationFixtures(page)
    await page.goto('/projects/3?id=3001')
    const current = state.projectNode('分页项目01')
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(20)
    await expect(current.locator('a.workspace-conversation')).toHaveCount(10)
    await expect(page.locator('.agent-answer')).toContainText('分页会话001的完整回复')
    const draft = page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送')
    await draft.fill('加载更多目录时保留这条草稿')
    await page.clock.fastForward(16000)
    expect(
      state.reads.every(
        (read) => read.page === 1 && read.size === (read.kind === 'projects' ? 20 : 10),
      ),
    ).toBe(true)
    expect(state.reads.filter((read) => read.kind === 'conversations').length).toBeLessThanOrEqual(
      21,
    )
    await expect(current.locator('a.workspace-conversation')).toHaveCount(10)

    for (const count of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 121]) {
      await current.getByRole('button', { name: '加载更多会话', exact: true }).click()
      await expect(current.locator('a.workspace-conversation')).toHaveCount(count)
    }
    await state.link('未加载会话目标').scrollIntoViewIfNeeded()
    await expect(state.link('未加载会话目标')).toBeInViewport()
    await expect(current.getByRole('button', { name: '加载更多会话', exact: true })).toHaveCount(0)
    expect(
      state.reads
        .filter((read) => read.kind === 'conversations' && read.projectId === 3 && read.page > 1)
        .map((read) => read.page),
    ).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(25)
    await expect(state.link('后页项目25')).toBeVisible()
    await expect(
      state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }),
    ).toHaveCount(0)
    expect(state.reads.filter((read) => read.kind === 'projects').map((read) => read.page)).toEqual(
      [1, 2],
    )
    const listCount = state.reads.length
    const statusCount = state.statusReads.length
    await page.clock.fastForward(16000)
    await expect
      .poll(() =>
        state.statusReads
          .slice(statusCount)
          .flatMap((read) => read.ids)
          .includes(3121),
      )
      .toBe(true)
    expect(state.statusReads.every((read) => read.ids.length <= 100)).toBe(true)
    expect(state.reads).toHaveLength(listCount)
    await expect(current.locator('a.workspace-conversation')).toHaveCount(121)
    await expect(draft).toHaveValue('加载更多目录时保留这条草稿')
    await expect(page.getByRole('heading', { name: '分页会话001', exact: true })).toBeVisible()
    expect(state.errors).toEqual([])
  })

  test('searches beyond unloaded pages and ignores obsolete project and Conversation responses', async ({
    page,
  }) => {
    const state = await paginationFixtures(page)
    await page.goto('/devices')
    const search = state.sidebar.getByRole('textbox', { name: '搜索项目或会话' })
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(20)
    const beforeTyping = state.reads.length
    await search.fill('未')
    await search.fill('未加载')
    await search.fill('未加载会话目标')
    await expect(state.link('未加载会话目标')).toBeVisible()
    expect(
      state.reads
        .slice(beforeTyping)
        .filter((read) => read.kind === 'projects')
        .map((read) => read.keyword),
    ).toEqual(['未加载会话目标'])
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(1)
    expect(
      state.reads.every(
        (read) => read.page === 1 && read.size === (read.kind === 'projects' ? 20 : 10),
      ),
    ).toBe(true)

    const releaseProject = state.hold('projects', null, '不存在的旧查询')
    await search.fill('不存在的旧查询')
    await search.press('Enter')
    await expect
      .poll(() => state.reads.some((read) => read.keyword === '不存在的旧查询'))
      .toBe(true)
    await search.fill('后页项目25')
    await search.press('Enter')
    await expect(state.link('后页项目25')).toBeVisible()
    await expect(state.projectNode('后页项目25').locator('a.workspace-conversation')).toHaveCount(
      10,
    )
    releaseProject()
    await expect
      .poll(() => state.reads.find((read) => read.keyword === '不存在的旧查询')?.settled)
      .toBe(true)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await expect(state.link('后页项目25')).toBeVisible()
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(1)

    const releaseConversations = state.hold('conversations', 3, '分页会话')
    await search.fill('分页会话')
    await search.press('Enter')
    await expect
      .poll(() =>
        state.reads.some((read) => read.kind === 'conversations' && read.keyword === '分页会话'),
      )
      .toBe(true)
    await search.fill('未加载会话目标')
    await search.press('Enter')
    await expect(state.link('未加载会话目标')).toBeVisible()
    releaseConversations()
    await expect
      .poll(
        () =>
          state.reads.find((read) => read.kind === 'conversations' && read.keyword === '分页会话')
            ?.settled,
      )
      .toBe(true)
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    await expect(state.link('未加载会话目标')).toBeVisible()
    await expect(state.link('分页会话001')).toHaveCount(0)
    await expect(state.projectNode('分页项目01').locator('a.workspace-conversation')).toHaveCount(1)
    state.conversations[3]!.push({
      ...state.conversations[3]![0]!,
      id: 3999,
      title: '未加载会话目标的新结果',
    })
    await search.press('Enter')
    await expect(state.link('未加载会话目标的新结果')).toBeVisible()
    await expect(state.projectNode('分页项目01').locator('a.workspace-conversation')).toHaveCount(2)
    expect(state.errors).toEqual([])
  })

  test('retries failed second pages without skipping projects or Conversations', async ({
    page,
  }) => {
    await page.clock.install()
    const state = await paginationFixtures(page)
    await page.goto('/devices')
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(20)
    state.failNext('projects', null, 2)
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(state.sidebar.getByRole('alert')).toBeVisible()
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(20)
    await page.clock.fastForward(6000)
    await state.sidebar.getByRole('button', { name: /重试/ }).click()
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(25)
    expect(state.reads.filter((read) => read.kind === 'projects').map((read) => read.page)).toEqual(
      [1, 2, 2],
    )

    const current = state.projectNode('分页项目01')
    state.failNext('conversations', 3, 2)
    await current.getByRole('button', { name: '加载更多会话', exact: true }).click()
    await expect(current.getByRole('alert')).toBeVisible()
    await expect(current.locator('a.workspace-conversation')).toHaveCount(10)
    await page.clock.fastForward(6000)
    await current.getByRole('button', { name: /重试/ }).click()
    await expect(current.locator('a.workspace-conversation')).toHaveCount(20)
    expect(
      state.reads
        .filter((read) => read.kind === 'conversations' && read.projectId === 3)
        .map((read) => read.page),
    ).toEqual([1, 2, 2])
    expect(state.errors).toEqual([])
  })

  test('keeps second-page activity live on a management page and clears it only after reading', async ({
    page,
  }) => {
    await page.clock.install()
    const state = await paginationFixtures(page)
    await page.goto('/projects/3?id=3001')
    const current = state.projectNode('分页项目01')
    await current.getByRole('button', { name: '加载更多会话', exact: true }).click()
    await expect(current.locator('a.workspace-conversation')).toHaveCount(20)
    const marker = state.link('分页会话011').locator('.workspace-conversation__activity')
    await expect(marker).toHaveAttribute('data-state', 'running')
    await page.getByRole('link', { name: '设备管理', exact: true }).click()
    const background = state.conversations[3]!.find((item) => item.id === 3011)!
    background.latestTurnStatus = 'COMPLETED'
    await expect.poll(() => state.sockets.length).toBe(1)
    state.sockets[0]!.send(
      JSON.stringify({
        type: 'TURN_COMPLETED',
        payload: { projectId: 3, conversationId: background.id, turnId: background.latestTurnId },
      }),
    )
    await expect(marker).toHaveAttribute('data-state', 'completed')
    const beforeRefresh = state.reads.length
    await page.clock.fastForward(16000)
    await expect.poll(() => state.statusReads.some((read) => read.ids.includes(3011))).toBe(true)
    expect(state.reads).toHaveLength(beforeRefresh)
    await expect(current.locator('a.workspace-conversation')).toHaveCount(20)
    await expect(marker).toHaveAttribute('data-state', 'completed')
    await state.link('分页会话011').click()
    await expect(page.locator('.agent-answer')).toContainText('分页会话011的完整回复')
    await expect(marker).toHaveAttribute('data-state', 'idle')
    await page.reload()
    await expect(state.link('分页会话011')).toBeVisible()
    await expect(marker).toHaveAttribute('data-state', 'idle')
    expect(state.errors).toEqual([])
  })

  test('reveals directly opened later-page items and newly created items without fetching every page', async ({
    page,
  }) => {
    const state = await paginationFixtures(page)
    await page.goto('/projects/27?id=270041')
    await expect(page.getByRole('heading', { name: '后页直达会话', exact: true })).toBeVisible()
    await expect(state.link('后页项目25')).toBeVisible()
    await expect(state.link('后页直达会话')).toBeVisible()
    await expect(page.locator('.agent-answer')).toContainText('后页直达会话的完整回复')
    expect(
      state.reads.every(
        (read) => read.page === 1 && read.size === (read.kind === 'projects' ? 20 : 10),
      ),
    ).toBe(true)
    await state.sidebar.getByRole('button', { name: '在 后页项目25 新建会话', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByPlaceholder('例如：修复订单导出问题')
      .fill('分页中新建的会话')
    await page.getByRole('button', { name: '创建并连接', exact: true }).click()
    await expect(page).toHaveURL(/\/projects\/27\?id=900001$/)
    await expect(state.link('分页中新建的会话')).toBeVisible()
    await expect(page.getByRole('heading', { name: '分页中新建的会话', exact: true })).toBeVisible()
    await page.reload()
    await expect(state.link('后页项目25')).toBeVisible()
    await expect(state.link('分页中新建的会话')).toBeVisible()

    await state.sidebar.getByRole('button', { name: '新建项目', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('例如：订单服务').fill('分页中新建的项目')
    await dialog.getByRole('combobox', { name: '可执行机器' }).selectOption('1')
    await dialog.getByRole('button', { name: '创建项目', exact: true }).click()
    await expect(state.link('分页中新建的项目')).toBeVisible()
    expect(
      state.reads.every(
        (read) => read.page === 1 && read.size === (read.kind === 'projects' ? 20 : 10),
      ),
    ).toBe(true)
    expect(state.errors).toEqual([])
  })

  test('project activity promotes a later-page Project without losing loaded items or the draft', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-10T04:00:00Z') })
    const state = await paginationFixtures(page)
    const tokenSource = state.conversations[3]![1]!
    tokenSource.latestTurnStatus = 'RUNNING'
    await page.goto('/projects/3?id=3001')
    const projectNames = state.sidebar.locator('.workspace-project__name')
    await expect(projectNames).toHaveCount(20)
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(projectNames).toHaveCount(25)
    await expect(state.link('后页会话001')).toBeVisible()
    const loadedNames = await projectNames.allTextContents()
    const draft = page.getByPlaceholder('向 Codex 描述任务，Ctrl + Enter 发送')
    await draft.fill('后台项目排序变化时仍保留我的草稿')
    await page.clock.fastForward(1000)
    const background = state.conversations[27]![0]!
    background.latestTurnId = 400001
    background.latestTurnStatus = 'RUNNING'
    background.lastActivityAt = '2026-09-10T04:00:01Z'
    state.projects.find((item) => item.id === 27)!.lastActivityAt = background.lastActivityAt
    await expect.poll(() => state.sockets.length).toBe(1)
    state.sockets[0]!.send(
      JSON.stringify({
        type: 'TURN_STARTED',
        payload: { projectId: 27, conversationId: background.id, turnId: background.latestTurnId },
      }),
    )
    await expect(projectNames.first()).toHaveText('后页项目25')
    await expect(
      state.link('后页会话001').locator('.workspace-conversation__activity'),
    ).toHaveAttribute('data-state', 'running')
    await page.clock.fastForward(1000)
    for (const sequence of [1, 2]) {
      state.sockets[0]!.send(
        JSON.stringify({
          type: 'MESSAGE_UPDATED',
          payload: {
            projectId: 3,
            conversationId: tokenSource.id,
            turnId: tokenSource.latestTurnId,
            sequence,
          },
        }),
      )
    }
    const statusCount = state.statusReads.length
    await page.clock.fastForward(16000)
    await expect.poll(() => state.statusReads.length).toBeGreaterThan(statusCount)
    await expect(projectNames.first()).toHaveText('后页项目25')
    expect((await projectNames.allTextContents()).sort()).toEqual(loadedNames.sort())
    await expect(state.projectNode('分页项目01').locator('a.workspace-conversation')).toHaveCount(
      10,
    )
    await expect(draft).toHaveValue('后台项目排序变化时仍保留我的草稿')
    await expect(page.getByRole('heading', { name: '分页会话001', exact: true })).toBeVisible()
    expect(state.reads.filter((read) => read.kind === 'projects').map((read) => read.page)).toEqual(
      [1, 2],
    )
    expect(state.errors).toEqual([])
  })

  test('project activity follows background status timestamps and restores server order after reload', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-10T04:00:00Z') })
    const state = await paginationFixtures(page)
    await page.goto('/devices')
    const projectNames = state.sidebar.locator('.workspace-project__name')
    await expect(projectNames).toHaveCount(20)
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(projectNames).toHaveCount(25)
    await expect(state.link('后页会话001')).toBeVisible()
    await expect(projectNames.first()).toHaveText('分页项目01')
    const background = state.conversations[27]![0]!
    background.latestTurnId = 400002
    background.latestTurnStatus = 'COMPLETED'
    background.lastActivityAt = '2026-09-10T04:00:01Z'
    state.projects.find((item) => item.id === 27)!.lastActivityAt = background.lastActivityAt
    const statusCount = state.statusReads.length
    const listCount = state.reads.length
    await page.clock.fastForward(16000)
    await expect
      .poll(() =>
        state.statusReads.slice(statusCount).some((read) => read.ids.includes(background.id)),
      )
      .toBe(true)
    await expect(projectNames.first()).toHaveText('后页项目25')
    await expect(projectNames).toHaveCount(25)
    await expect(
      state.link('后页会话001').locator('.workspace-conversation__activity'),
    ).toHaveAttribute('data-state', 'completed')
    expect(state.reads).toHaveLength(listCount)
    await page.reload()
    await expect(projectNames.first()).toHaveText('后页项目25')
    await expect(projectNames).toHaveCount(20)
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(projectNames).toHaveCount(25)
    expect(new Set(await projectNames.allTextContents()).size).toBe(25)
    await expect(projectNames.first()).toHaveText('后页项目25')
    expect(state.errors).toEqual([])
  })

  test('project activity keeps search membership isolated when a hidden Project becomes active', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-09-10T04:00:00Z') })
    const state = await paginationFixtures(page)
    await page.goto('/devices')
    const projectNames = state.sidebar.locator('.workspace-project__name')
    await expect(projectNames).toHaveCount(20)
    await state.sidebar.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(state.link('后页会话001')).toBeVisible()
    const search = state.sidebar.getByRole('textbox', { name: '搜索项目或会话' })
    await search.fill('分页项目01')
    await search.press('Enter')
    await expect(projectNames).toHaveCount(1)
    await expect(projectNames.first()).toHaveText('分页项目01')
    const background = state.conversations[27]![0]!
    background.latestTurnId = 400003
    background.latestTurnStatus = 'RUNNING'
    background.lastActivityAt = '2026-09-10T04:00:01Z'
    state.projects.find((item) => item.id === 27)!.lastActivityAt = background.lastActivityAt
    await page.clock.fastForward(1000)
    await expect.poll(() => state.sockets.length).toBe(1)
    state.sockets[0]!.send(
      JSON.stringify({
        type: 'TURN_STARTED',
        payload: { projectId: 27, conversationId: background.id, turnId: background.latestTurnId },
      }),
    )
    await page.clock.fastForward(16000)
    await expect(projectNames).toHaveCount(1)
    await expect(projectNames.first()).toHaveText('分页项目01')
    const beforeSearch = state.reads.length
    await search.press('Enter')
    await expect
      .poll(() =>
        state.reads
          .slice(beforeSearch)
          .some(
            (read) => read.kind === 'projects' && read.keyword === '分页项目01' && read.settled,
          ),
      )
      .toBe(true)
    await expect(projectNames).toHaveCount(1)
    await expect(projectNames.first()).toHaveText('分页项目01')
    await search.fill('')
    await search.press('Enter')
    await expect(projectNames.first()).toHaveText('后页项目25')
    await expect(projectNames).toHaveCount(20)
    expect(state.errors).toEqual([])
  })

  test('project list searches and loads later pages independently of the sidebar', async ({
    page,
  }) => {
    const state = await paginationFixtures(page)
    await page.goto('/projects')
    const projectList = page.locator('.project-page')
    await expect(projectList.locator('.project-link')).toHaveCount(20)
    await projectList.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(projectList.locator('.project-link')).toHaveCount(25)
    await expect(projectList.getByRole('button', { name: '后页项目25', exact: true })).toBeVisible()
    await projectList.getByPlaceholder('搜索项目、设备或目录').fill('后页项目25')
    await projectList.getByPlaceholder('搜索项目、设备或目录').press('Enter')
    await expect(projectList.locator('.project-link')).toHaveCount(1)
    await expect(projectList.getByRole('button', { name: '后页项目25', exact: true })).toBeVisible()
    await expect(state.sidebar.locator('.workspace-project')).toHaveCount(20)
    expect(state.reads.every((read) => read.size === (read.kind === 'projects' ? 20 : 10))).toBe(
      true,
    )
    expect(state.errors).toEqual([])
  })

  test('expert project picker searches and enables a project beyond its first page', async ({
    page,
  }) => {
    const state = await paginationFixtures(page)
    const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
    const expert = {
      id: 10,
      name: '分页专家',
      description: '分页选择器验证',
      publishedVersionId: 100,
    }
    let binding: Record<string, unknown> | null = null
    await page.route('**/api/v1/expert-market**', (route) =>
      route.fulfill({ json: response([expert]) }),
    )
    await page.route('**/projects/27/experts', (route) => {
      if (route.request().method() === 'POST') binding = route.request().postDataJSON()
      return route.fulfill({
        json: response({
          projectRevision: binding ? 1 : 0,
          experts: binding
            ? [
                {
                  expertId: 10,
                  expertVersionId: 100,
                  versionNo: 1,
                  name: expert.name,
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
    const selection = dialog.getByRole('combobox')
    await expect(selection.locator('option:not([disabled])')).toHaveCount(20)
    await dialog.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(selection.locator('option:not([disabled])')).toHaveCount(25)
    await dialog.getByPlaceholder('搜索项目', { exact: true }).fill('后页项目25')
    await dialog.getByPlaceholder('搜索项目', { exact: true }).press('Enter')
    await expect(selection.locator('option:not([disabled])')).toHaveCount(1)
    await selection.selectOption('27')
    await dialog.getByRole('button', { name: '启用 / 升级', exact: true }).click()
    await expect(page).toHaveURL(/\/projects\/27\/experts$/)
    expect(binding).toEqual({ expertVersionId: 100, projectRevision: 0 })
    expect(state.reads.every((read) => read.size === (read.kind === 'projects' ? 20 : 10))).toBe(
      true,
    )
    expect(state.errors).toEqual([])
  })

  test('Skill project picker searches and deploys to a project beyond its first page', async ({
    page,
  }) => {
    const state = await paginationFixtures(page)
    let deployment: Record<string, unknown> | null = null
    await page.route('**/api/v1/skill-deployments', (route) => {
      if (route.request().method() === 'POST') deployment = route.request().postDataJSON()
      const result = {
        id: 99,
        skillName: 'code-review',
        version: '1.0',
        deviceName: '测试设备',
        projectName: '后页项目25',
        scopeType: 'PROJECT',
        installStatus: 'INSTALLED',
      }
      return route.fulfill({
        json: {
          status: 'success',
          code: 200,
          info: '',
          data: route.request().method() === 'POST' ? result : deployment ? [result] : [],
        },
      })
    })
    await page.goto('/skills')
    await page.getByRole('button', { name: '下发 Skill', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox', { name: '作用域', exact: true }).selectOption('PROJECT')
    const selection = dialog.getByRole('combobox', {
      name: '选择工作区已就绪且 Agent 在线的项目',
      exact: true,
    })
    await expect(selection.locator('option:not([disabled])')).toHaveCount(20)
    await dialog.getByRole('button', { name: '加载更多项目', exact: true }).click()
    await expect(selection.locator('option:not([disabled])')).toHaveCount(25)
    await dialog.getByPlaceholder('搜索目标项目').fill('后页项目25')
    await dialog.getByPlaceholder('搜索目标项目').press('Enter')
    await expect(selection.locator('option:not([disabled])')).toHaveCount(1)
    await selection.selectOption('27')
    await dialog.getByRole('combobox', { name: '选择已激活版本', exact: true }).selectOption('6')
    await dialog.getByRole('button', { name: '下发到项目', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(deployment).toEqual({ scopeType: 'PROJECT', targetId: 27, versionId: 6 })
    expect(state.reads.every((read) => read.size === (read.kind === 'projects' ? 20 : 10))).toBe(
      true,
    )
    expect(state.errors).toEqual([])
  })
})
