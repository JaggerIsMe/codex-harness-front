import { sessionCredentials } from '../support/auth'
import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
  type WebSocketRoute,
} from '@playwright/test'
import type { Message } from '../../src/types/domain'

function messages(start: number, count = 24): Message[] {
  return Array.from({ length: count }, (_, index) => {
    const id = start + index
    return {
      id,
      turnId: 1000 + Math.floor((id - 1) / 2),
      sequenceNo: id,
      role: id % 2 ? 'USER' : 'ASSISTANT',
      messageType: 'TEXT',
      messageKey: `message-${id}`,
      revision: 1,
      status: 'COMPLETED',
      content:
        id % 2
          ? `历史问题 ${id}\n请说明这个问题的处理方式。`
          : `回答 ${id}\n\n${'包含多段内容的历史回答，用于验证真实浏览器中的阅读位置。\n\n'.repeat(4)}`,
    }
  })
}

async function fixture(page: Page) {
  const project = {
    id: 3,
    projectName: '历史分页项目',
    provisioningStatus: 'READY',
    status: 'ACTIVE',
    deviceId: 1,
    deviceName: '测试设备',
    deviceStatus: 'ONLINE',
    workspaceId: 2,
    workspaceName: '测试工作区',
    workspaceStatus: 'ENABLED',
    rootPath: 'D:/workspace/history-test',
    isolationMode: 'WINDOWS_PROJECT_PROFILE',
    conversationCount: 2,
  }
  const conversations = [4, 5].map((id) => ({
    id,
    projectId: project.id,
    projectName: project.projectName,
    deviceId: project.deviceId,
    workspaceId: project.workspaceId,
    title: `历史会话 ${id}`,
    status: 'ACTIVE',
    codexThreadId: `thread-${id}`,
  }))
  const initial = messages(101)
  const other = messages(501)
  const latest = initial.at(-1)!
  const pending: { route: Route; conversationId: number; before: number }[] = []
  const errors: string[] = []
  const unexpectedWrites: string[] = []
  let socket: WebSocketRoute | undefined
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const snapshot = (rows: Message[], hasMore: boolean) => ({
    messages: rows,
    hasMore,
    turnId: rows.at(-1)?.turnId ?? null,
    cursor: latest.revision,
    degraded: false,
    resetRequired: false,
    updates: [],
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('test-token'),
  )
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    if (path === '/auth/activity' && route.request().method() === 'POST') {
      expect(route.request().headers()['x-harness-activity']).toBe('1')
      const session = sessionCredentials('test-token')
      await route.fulfill({
        json: response({
          idleExpiresAt: session.idleExpiresAt,
          sessionExpiresAt: session.sessionExpiresAt,
        }),
      })
      return
    }
    if (!['GET', 'HEAD'].includes(route.request().method()) && path !== '/auth/socket-ticket') {
      unexpectedWrites.push(`${route.request().method()} ${path}`)
      await route.fulfill({ status: 405, json: response(null) })
      return
    }
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'tester@example.com',
        displayName: '测试用户',
        roles: ['USER'],
        permissions: ['workspace:use', 'expert:use', 'expert:read'],
        mustChangePassword: false,
        activated: true,
      }
    else if (path === '/auth/socket-ticket') data = { ticket: 'test-ticket', expiresInSeconds: 60 }
    else if (path === '/projects') data = { items: [project], total: 1, page: 1, size: 20 }
    else if (path === '/projects/3') data = project
    else if (path === '/projects/3/conversations')
      data = { items: conversations, total: 2, page: 1, size: 10 }
    else if (/^\/projects\/3\/conversations\/[45]$/.test(path))
      data = conversations.find((item) => path.endsWith(`/${item.id}`))
    else if (path.endsWith('/message-state')) {
      const conversationId = Number(path.split('/')[4])
      const before = Number(url.searchParams.get('before'))
      if (before) {
        pending.push({ route, conversationId, before })
        return
      }
      data = snapshot(conversationId === 4 ? initial : other, conversationId === 4)
    } else if (path.endsWith('/active-turn'))
      data = path.includes('/conversations/4/') ? { id: latest.turnId, status: 'RUNNING' } : null
    else if (path.endsWith('/expert'))
      data = { expertId: 10, expertVersionId: 100, name: '测试专家', available: true }
    else if (path.endsWith('/turn-experts'))
      data = [...initial, ...other].map((item) => ({
        turnId: item.turnId,
        expertVersionId: 100,
        expertName: '测试专家',
      }))
    else if (path.endsWith('/experts')) data = { projectRevision: 1, experts: [] }
    else if (path.endsWith('/attachments/limits'))
      data = { maxFileBytes: 20971520, maxFiles: 5, maxTotalBytes: 52428800, agentSupported: true }
    await route.fulfill({ json: response(data) })
  })
  return {
    pending,
    errors,
    unexpectedWrites,
    panel: page.locator('.message-panel'),
    async resolve(index: number, rows: Message[], hasMore: boolean) {
      await pending[index]!.route.fulfill({ json: response(snapshot(rows, hasMore)) })
    },
    async appendTail() {
      await expect.poll(() => Boolean(socket)).toBe(true)
      const baseRevision = latest.revision!
      latest.revision = baseRevision + 1
      latest.status = 'STREAMING'
      latest.content += `\n\n${'分页请求期间继续生成的尾部内容。\n\n'.repeat(15)}`
      socket!.send(
        JSON.stringify({
          type: 'MESSAGE_UPDATED',
          payload: {
            conversationId: 4,
            turnId: latest.turnId,
            cursor: latest.revision,
            patches: [{ operation: 'REPLACE', baseRevision, message: latest }],
          },
        }),
      )
      await expect(page.locator('.message-row').last()).toContainText('分页请求期间继续生成')
    },
  }
}

async function settleLayout(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

function bottomDistance(panel: Locator) {
  return panel.evaluate(
    (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
  )
}

async function scrollTo(panel: Locator, top: number) {
  await panel.evaluate(
    (element, value) => element.scrollTo({ top: value, behavior: 'instant' }),
    top,
  )
}

test('Conversation loads older Messages on top entry, preserving the reading anchor during tail growth', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.goto('/projects/3?id=4')
  await expect(state.panel.locator('.message-row')).toHaveCount(24)
  await expect.poll(() => bottomDistance(state.panel)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: '加载更早消息', exact: true })).toHaveCount(0)
  await settleLayout(page)
  expect(state.pending).toHaveLength(0)
  const lastBox = (await state.panel.locator('.message-row').last().boundingBox())!
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
    (await page.locator('.conversation-dock').boundingBox())!.y,
  )

  await scrollTo(state.panel, 32)
  await expect.poll(() => state.pending.length).toBe(1)
  expect(state.pending[0]).toMatchObject({ conversationId: 4, before: 101 })
  await expect(state.panel).toHaveAttribute('aria-busy', 'true')
  for (let index = 0; index < 3; index++) {
    await scrollTo(state.panel, 240)
    await settleLayout(page)
    await scrollTo(state.panel, 32)
    await settleLayout(page)
  }
  expect(state.pending).toHaveLength(1)
  const anchor = state.panel.locator('[data-message-id="user-101"]')
  const anchorTop = (await anchor.boundingBox())!.y
  const heightBefore = await state.panel.evaluate((element) => element.scrollHeight)
  await state.appendTail()
  await expect
    .poll(() => state.panel.evaluate((element) => element.scrollHeight))
    .toBeGreaterThan(heightBefore)
  await settleLayout(page)
  expect(Math.abs((await anchor.boundingBox())!.y - anchorTop)).toBeLessThanOrEqual(1)
  await state.resolve(0, messages(77), true)
  await expect(state.panel.locator('.message-row')).toHaveCount(48)
  await expect(state.panel).toHaveAttribute('aria-busy', 'false')
  await settleLayout(page)
  expect(Math.abs((await anchor.boundingBox())!.y - anchorTop)).toBeLessThanOrEqual(1)
  expect(state.pending).toHaveLength(1)

  await scrollTo(state.panel, 0)
  await expect.poll(() => state.pending.length).toBe(2)
  expect(state.pending[1]).toMatchObject({ conversationId: 4, before: 77 })
  await state.resolve(1, messages(53), false)
  await expect(state.panel.locator('.message-row')).toHaveCount(72)
  await expect(state.panel).toHaveAttribute('aria-busy', 'false')
  await scrollTo(state.panel, 0)
  await settleLayout(page)
  await scrollTo(state.panel, 240)
  await settleLayout(page)
  await scrollTo(state.panel, 0)
  await settleLayout(page)
  expect(state.pending).toHaveLength(2)
  expect(state.errors).toEqual([])
  expect(state.unexpectedWrites).toEqual([])
})

test('switching Conversation discards pending history and opens the next Conversation at its latest Message', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.goto('/projects/3?id=4')
  await expect(state.panel.locator('.message-row')).toHaveCount(24)
  await expect.poll(() => bottomDistance(state.panel)).toBeLessThanOrEqual(1)
  await scrollTo(state.panel, 0)
  await expect.poll(() => state.pending.length).toBe(1)
  await page.getByRole('link', { name: '历史会话 5', exact: true }).click()
  await expect(page.getByRole('heading', { name: '历史会话 5' })).toBeVisible()
  await expect(state.panel.locator('[data-message-id="user-501"]')).toHaveCount(1)
  await expect.poll(() => bottomDistance(state.panel)).toBeLessThanOrEqual(1)
  // An aborted response must not prepend into, or restore an old anchor inside, the new Conversation.
  await state.resolve(0, messages(77), true)
  await settleLayout(page)
  await expect(state.panel.locator('.message-row')).toHaveCount(24)
  await expect(state.panel.locator('[data-message-id="user-77"]')).toHaveCount(0)
  await expect.poll(() => bottomDistance(state.panel)).toBeLessThanOrEqual(1)
  await page.getByRole('link', { name: '历史会话 4', exact: true }).click()
  await expect(page.getByRole('heading', { name: '历史会话 4' })).toBeVisible()
  await expect(state.panel.locator('[data-message-id="user-101"]')).toHaveCount(1)
  await expect.poll(() => bottomDistance(state.panel)).toBeLessThanOrEqual(1)
  await settleLayout(page)
  expect(state.pending).toHaveLength(1)
  expect(state.errors).toEqual([])
  expect(state.unexpectedWrites).toEqual([])
})
