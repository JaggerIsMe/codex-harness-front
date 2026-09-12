import { expect, test, type WebSocketRoute } from '@playwright/test'
import { sessionCredentials } from '../support/auth'
import type { Approval } from '../../src/types/domain'

// Real Vue UI and WebSocket consumer; HTTP and Agent events are controlled fixtures.
for (const [label, decision] of [
  ['批准本次', 'ACCEPT'],
  ['拒绝操作', 'DECLINE'],
  ['拒绝并中断', 'CANCEL'],
  ['提交选择', 'ANSWER'],
] as const) {
  test(`Approval Request: realtime display, reload recovery and ${decision}`, async ({
    page,
  }, testInfo) => {
    if (decision === 'CANCEL' || decision === 'ANSWER')
      await page.setViewportSize({ width: 390, height: 844 })
    let socket: WebSocketRoute | undefined
    let approvals: Approval[] = []
    let turnStatus = 'RUNNING'
    let blocked = false
    const blockedMessage = {
      id: 2,
      turnId: 7,
      sequenceNo: 2,
      role: 'SYSTEM',
      messageType: 'ERROR',
      messageKey: 'policy-blocked',
      revision: 1,
      status: 'COMPLETED',
      content: JSON.stringify({
        type: 'approvalBlocked',
        approvalType: 'COMMAND_EXECUTION',
        policyCode: 'STRICT_PROJECT_ISOLATION',
        message: '严格项目隔离已拦截扩权请求。此决定由平台作出，并非用户拒绝。',
        guidance: '使用执行前确认；批准后仍遵守原有项目权限。',
        operation: {
          command: 'Get-Content ConversationMessageStream.java',
          cwd: 'D:/workspace/approval-test',
        },
      }),
    }
    const decisions: unknown[] = []
    const errors: string[] = []
    const unexpected: string[] = []
    const response = (data: unknown) => ({ status: 'success', code: 200, info: '请求成功', data })
    const project = {
      id: 3,
      projectName: '审批链路验证（模拟事件）',
      provisioningStatus: 'READY',
      status: 'ACTIVE',
      deviceId: 1,
      deviceName: '测试设备',
      deviceStatus: 'ONLINE',
      workspaceId: 2,
      workspaceName: '测试工作区',
      workspaceStatus: 'ENABLED',
      rootPath: 'D:/workspace/approval-test',
      isolationMode: 'LINUX_PROJECT_PROFILE_V1',
      conversationCount: 1,
    }
    const conversation = {
      id: 4,
      projectId: 3,
      projectName: project.projectName,
      deviceId: 1,
      workspaceId: 2,
      title: '审批演示：读取测试数据',
      status: 'ACTIVE',
      codexThreadId: 'test-thread',
    }
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(
      (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
      sessionCredentials('approval-test-token'),
    )
    await page.routeWebSocket('**/ws/client?*', (connected) => {
      socket = connected
    })
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      const method = route.request().method()
      let data: unknown = []
      if (path === '/approvals/11/decision' && method === 'POST') {
        decisions.push(route.request().postDataJSON())
        approvals = approvals.map((item) => ({
          ...item,
          status:
            decision === 'ACCEPT' || decision === 'ANSWER'
              ? 'APPROVED'
              : decision === 'DECLINE'
                ? 'REJECTED'
                : 'CANCELLED',
        }))
        turnStatus = decision === 'CANCEL' ? 'INTERRUPTED' : 'RUNNING'
        if (decision === 'ANSWER' && decisions.length === 1) turnStatus = 'WAITING_APPROVAL'
        data = approvals[0]
        if (!(decision === 'ANSWER' && decisions.length === 1))
          socket!.send(
            JSON.stringify({
              type: 'APPROVAL_RESOLVED',
              deviceId: 1,
              payload: { requestId: 'mcp-approval', decision, conversationId: 4, turnId: 7 },
            }),
          )
      } else if (path === '/auth/activity') {
        const session = sessionCredentials('approval-test-token')
        data = { idleExpiresAt: session.idleExpiresAt, sessionExpiresAt: session.sessionExpiresAt }
      } else if (path === '/auth/socket-ticket')
        data = { ticket: 'test-ticket', expiresInSeconds: 60 }
      else if (method !== 'GET') unexpected.push(`${method} ${path}`)
      else if (path === '/auth/profile')
        data = {
          id: 9,
          email: 'tester@example.com',
          displayName: '测试用户',
          roles: ['USER'],
          permissions: ['workspace:use', 'expert:use', 'expert:read', 'approval:decide'],
          activated: true,
        }
      else if (path === '/projects') data = { items: [project], total: 1, page: 1, size: 20 }
      else if (path === '/projects/3') data = project
      else if (path === '/projects/3/conversations')
        data = { items: [conversation], total: 1, page: 1, size: 10 }
      else if (path === '/projects/3/conversations/4') data = conversation
      else if (path.endsWith('/approvals')) data = approvals
      else if (path.endsWith('/active-turn')) data = { id: 7, status: turnStatus }
      else if (path.endsWith('/message-state'))
        data = {
          messages: [
            {
              id: 1,
              turnId: 7,
              sequenceNo: 1,
              role: 'USER',
              messageType: 'TEXT',
              messageKey: 'input-1',
              revision: 1,
              status: 'COMPLETED',
              content: '请读取测试数据；执行前向我申请审批。',
            },
            ...(blocked ? [blockedMessage] : []),
          ],
          hasMore: false,
          turnId: 7,
          cursor: blocked ? 1 : 0,
          degraded: false,
          resetRequired: false,
          updates: [],
        }
      else if (path.endsWith('/expert'))
        data = { expertId: 10, expertVersionId: 100, name: '测试专家', available: true }
      else if (path.endsWith('/experts')) data = { projectRevision: 1, experts: [] }
      else if (path.endsWith('/attachments/limits'))
        data = {
          maxFileBytes: 20971520,
          maxFiles: 5,
          maxTotalBytes: 52428800,
          agentSupported: true,
        }
      await route.fulfill({ json: response(data) })
    })
    await page.goto('/projects/3?id=4')
    await expect(page.locator('.message-row')).toHaveCount(1)
    await expect.poll(() => Boolean(socket)).toBe(true)
    await expect(page.locator('.approval-card')).toHaveCount(0)
    approvals = [
      {
        id: 11,
        conversationId: 4,
        turnId: 7,
        approvalType: 'EXECUTION_CONFIRMATION',
        status: 'PENDING',
        details: {
          questions: [
            {
              id: 'harness-confirm-action',
              header: '读取测试数据',
              question:
                '允许读取测试数据吗？' +
                (decision === 'CANCEL' ? '\n请核对当前查询的工作区和范围。'.repeat(30) : ''),
              options: [
                { label: '批准本次', description: '仅执行本次读取' },
                { label: '拒绝操作', description: '跳过本次读取' },
                { label: '拒绝并中断', description: '停止本轮执行' },
              ],
            },
          ],
          tool: 'demo.read_records',
          scope: '仅本次操作',
          ...(decision === 'CANCEL' ? { cwd: 'D:/workspace/' + 'long-directory-'.repeat(30) } : {}),
          source: '自动化测试模拟审批事件',
        },
      },
    ]
    if (decision === 'ANSWER')
      approvals[0] = {
        ...approvals[0]!,
        approvalType: 'MCP_TOOL_CALL',
        details: {
          questions: [
            {
              id: 'ghibli_fallback_choice',
              header: '替代方案',
              question: '你希望采用哪种方式产出猫咪插画？',
              isOther: true,
              options: [
                {
                  label: '手绘矢量插画 (Recommended)',
                  description: '使用 SVG 绘制插画；' + '说明与范围。'.repeat(35),
                },
                { label: '只给绘图提示词', description: '输出可以复用的绘图提示词。' },
                { label: '两个都要', description: '同时提供 SVG 插画和绘图提示词。' },
              ],
            },
          ],
        },
      }
    turnStatus = 'WAITING_APPROVAL'
    socket!.send(
      JSON.stringify({
        type: 'APPROVAL_REQUIRED',
        deviceId: 1,
        payload: {
          conversationId: 4,
          turnId: 7,
          requestId: 'mcp-approval',
          approvalType: 'EXECUTION_CONFIRMATION',
          details: approvals[0]!.details,
        },
      }),
    )
    const card = page.locator('.approval-card')
    await expect(card).toBeVisible()
    if (decision === 'ANSWER') {
      await expect(card).toContainText('等待回答')
      await expect(card.getByRole('button', { name: '提交选择' })).toBeDisabled()
      await expect(card.locator('input:checked')).toHaveCount(0)
    } else {
      await expect(card).toContainText('等待审批 · 执行前确认')
      await expect(card).toContainText('批准不会增加文件、网络或系统权限')
      await expect(card).toContainText('允许读取测试数据吗？')
    }
    const detailsCoverActions = await card.evaluate((element) => {
      const details = element.querySelector('.approval-card__body')!
      const actions = element.querySelector('.approval-actions')!
      return details.getBoundingClientRect().bottom > actions.getBoundingClientRect().top
    })
    expect(detailsCoverActions, '审批详情不应溢出并覆盖操作按钮').toBe(false)
    await expect(card.getByRole('button', { name: label, exact: true })).toBeInViewport()
    await expect(card.locator('pre')).not.toBeVisible()
    if (decision === 'CANCEL') {
      expect(
        await card
          .locator('.approval-card__body')
          .evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true)
    }
    await expect(card.getByRole('button', { name: '本会话批准' })).toHaveCount(0)
    const pending = testInfo.outputPath('approval-pending.png')
    await page.screenshot({ path: pending, fullPage: true })
    await testInfo.attach('待审批页面（模拟事件）', { path: pending, contentType: 'image/png' })
    if (decision === 'CANCEL') {
      const body = card.getByRole('region', { name: 'Turn 7 审批详情' })
      await body.focus()
      await page.keyboard.press('End')
      await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
      await expect(card.getByRole('button', { name: label, exact: true })).toBeInViewport()
    }
    await card.getByText('查看原始请求', { exact: true }).click()
    await expect(card.locator('details')).toHaveAttribute('open', '')
    await expect(card.getByRole('button', { name: label, exact: true })).toBeInViewport()
    await page.reload()
    await expect(card).toBeVisible()
    if (decision === 'ANSWER')
      await card.getByRole('radio', { name: '只给绘图提示词', exact: false }).check()
    await card.getByRole('button', { name: label, exact: true }).click()
    const answerPayload = {
      decision: 'ACCEPT',
      answers: { ghibli_fallback_choice: { answers: ['只给绘图提示词'] } },
    }
    await expect
      .poll(() => decisions)
      .toEqual([decision === 'ANSWER' ? answerPayload : { decision }])
    await expect(card).toHaveCount(0)
    if (decision === 'ANSWER') {
      approvals = approvals.map((item) => ({ ...item, status: 'PENDING' }))
      socket!.send(
        JSON.stringify({
          type: 'ERROR',
          deviceId: 1,
          correlationId: '11',
          payload: {
            commandType: 'RESOLVE_APPROVAL',
            commandMessageId: 'attempt-1',
            errorCode: 'APPROVAL_INPUT_INVALID',
            message: '请选择具体方案',
            conversationId: 4,
            turnId: 7,
          },
        }),
      )
      await expect(card).toBeVisible()
      await expect(page.getByText(/回答未被接受/)).toBeVisible()
      await card.getByRole('radio', { name: '只给绘图提示词', exact: false }).check()
      await card.getByRole('button', { name: '提交选择' }).click()
      await expect.poll(() => decisions).toEqual([answerPayload, answerPayload])
      await expect(card).toHaveCount(0)
      await expect(page.getByText(/回答未被接受/)).toHaveCount(0)
    }
    await expect(page.getByText('审批决定已提交', { exact: true }).last()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('approval-resolved.png'), fullPage: true })
    if (decision === 'ACCEPT') {
      blocked = true
      socket!.send(
        JSON.stringify({
          type: 'MESSAGE_UPDATED',
          payload: {
            conversationId: 4,
            turnId: 7,
            cursor: 1,
            patches: [{ operation: 'REPLACE', baseRevision: 0, message: blockedMessage }],
          },
        }),
      )
      await expect(page.getByLabel('平台策略拦截', { exact: true })).toBeVisible()
      await expect(page.getByLabel('平台策略拦截', { exact: true })).toContainText('并非用户拒绝')
      await expect(
        page.getByLabel('平台策略拦截', { exact: true }).getByRole('button'),
      ).toHaveCount(0)
      await page.reload()
      await expect(page.getByLabel('平台策略拦截', { exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('policy-blocked.png'), fullPage: true })
    }
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0)
  })
}
