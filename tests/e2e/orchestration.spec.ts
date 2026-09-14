import { expect, test, type WebSocketRoute } from '@playwright/test'
import { sessionCredentials } from '../support/auth'
import type { Orchestration, CreateOrchestration } from '../../src/types/orchestration'

test('edit canvas branches, preserve draft, create custom graph and recover execution', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  let socket: WebSocketRoute | undefined
  let execution: Orchestration | null = null
  let approvalResolved = false
  const continuations: { expectedTurnId: number; message: string; requestKey: string }[] = []
  const rechecks: { expectedTurnId: number }[] = []
  const creates: CreateOrchestration[] = [],
    errors: string[] = [],
    searches: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('orchestration-e2e'),
  )
  await page.routeWebSocket('**/ws/client?*', (connected) => {
    socket = connected
  })
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 3,
        displayName: '编排测试',
        email: 'test@example.com',
        activated: true,
        roles: ['USER'],
        permissions: [
          'workspace:use',
          'expert:use',
          'expert:read',
          'conversation:read',
          'conversation:create',
          'turn:start',
          'turn:interrupt',
          'approval:decide',
        ],
      }
    else if (path === '/auth/socket-ticket') data = { ticket: 'test-ticket', expiresInSeconds: 60 }
    else if (path === '/auth/activity') {
      const s = sessionCredentials('orchestration-e2e')
      data = { idleExpiresAt: s.idleExpiresAt, sessionExpiresAt: s.sessionExpiresAt }
    } else if (path === '/projects') data = { items: [], total: 0, page: 1, size: 10 }
    else if (path === '/projects/2/conversations/6/message-state')
      data = {
        messages: [
          {
            id: 1,
            sequenceNo: 1,
            turnId: 7,
            role: 'USER',
            messageType: 'TEXT',
            content: '检查订单查询，返回 JSON。',
          },
          {
            id: 2,
            sequenceNo: 2,
            turnId: 7,
            role: 'ASSISTANT',
            messageType: 'TEXT',
            content: '已核对查询条件，等待确认。',
            phase: 'final_answer',
          },
        ],
        turnId: 7,
        cursor: 0,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
      }
    else if (path === '/projects/2/conversations/6/approvals')
      data = approvalResolved
        ? []
        : [
            {
              id: 12,
              conversationId: 6,
              turnId: 7,
              approvalType: 'EXECUTION_CONFIRMATION',
              status: 'PENDING',
              details: { summary: '确认本次订单查询检查' },
            },
          ]
    else if (path === '/approvals/12/decision') {
      expect(route.request().postDataJSON()).toEqual({ decision: 'ACCEPT' })
      approvalResolved = true
      data = { id: 12, status: 'ACCEPTED' }
    } else if (path === '/projects/2/experts')
      data = {
        projectRevision: 1,
        experts: [
          { expertId: 8, name: '工程专家', versionNo: 1, available: true },
          { expertId: 9, name: '文档专家', versionNo: 1, available: true },
        ],
      }
    else if (path.endsWith('/orchestrations/availability')) data = true
    else if (path === '/projects/2/orchestrations' && route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as CreateOrchestration
      creates.push(input)
      execution = {
        id: 1,
        projectId: 2,
        title: input.title,
        goal: input.goal,
        status: 'RUNNING',
        failureMessage: null,
        createdAt: '2026-09-13T08:00:00',
        workflow: input.workflow,
        steps: input.workflow.nodes.map((node, position) => ({
          id: position + 1,
          position,
          name: node.name,
          expertId: node.expertId,
          objective: node.objective,
          status: node.kind === 'START' ? 'SUCCEEDED' : position === 1 ? 'RUNNING' : 'PENDING',
          conversationId: position === 1 ? 6 : null,
          turnId: position === 1 ? 7 : null,
          failureMessage: null,
          result: null,
        })),
      }
      data = execution
    } else if (path === '/projects/2/orchestrations/1/steps/2/continue' && execution) {
      continuations.push(route.request().postDataJSON())
      execution.steps[1]!.status = 'RUNNING'
      execution.steps[1]!.turnId = 8
      data = execution
    } else if (path === '/projects/2/orchestrations/1/steps/2/recheck' && execution) {
      rechecks.push(route.request().postDataJSON())
      execution.status = 'RUNNING'
      execution.steps[1]!.status = 'SUCCEEDED'
      data = execution
    } else if (path === '/projects/2/orchestrations') {
      searches.push(url.searchParams.get('keyword') || '')
      data = execution ? [{ ...execution, steps: [] }] : []
    } else if (path === '/projects/2/orchestrations/1') data = execution
    else if (path === '/projects/2/orchestrations/1/cancel' && execution) {
      execution.status = 'CANCELING'
      data = execution
    }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.goto('/projects/2/orchestrations')
  await page.getByRole('link', { name: '创建编排', exact: true }).click()
  await expect(page.getByRole('heading', { name: '工作流画布' })).toBeVisible()
  await expect(page.getByRole('button', { name: '选择节点 开始', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '选择节点 开始', exact: true }).click()
  await expect(page.getByRole('button', { name: '删除节点', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '开始 入口', exact: true })).toHaveCount(0)
  await page.getByLabel('编排名称', { exact: true }).fill('订单查询协作')
  await page.getByLabel('工作流目标', { exact: true }).fill('按要求检查订单查询')
  const normalCanvas = await page.getByLabel('工作流画布', { exact: true }).boundingBox()
  const initialTransform = await page.locator('.workflow-canvas__surface').getAttribute('style')
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  const workspace = page.getByRole('region', { name: '工作流编辑区', exact: true })
  await expect(workspace).toHaveClass(/workflow-workspace--fullscreen/)
  expect(await workspace.boundingBox()).toEqual({ x: 0, y: 0, width: 1600, height: 1100 })
  expect(
    (await page.getByLabel('工作流画布', { exact: true }).boundingBox())!.height,
  ).toBeGreaterThan(normalCanvas!.height)
  await expect(page.locator('.workflow-canvas__surface')).toHaveAttribute(
    'style',
    initialTransform!,
  )
  const addExpert = async (name: string, message: string, expert = '8') => {
    await page.getByRole('button', { name: '添加 Expert 节点', exact: true }).click()
    await page.getByLabel('节点名称', { exact: true }).fill(name)
    await page.getByLabel('执行 Expert', { exact: true }).selectOption(expert)
    await page.getByLabel('职责与目标', { exact: true }).fill(message)
  }
  await addExpert('检查输入', '检查 。返回 JSON。')
  const panel = page.getByRole('complementary', { name: '节点配置', exact: true })
  const panelBox = (await panel.boundingBox())!
  const fullCanvasBox = (await page.getByLabel('工作流画布', { exact: true }).boundingBox())!
  expect(panelBox.x).toBeGreaterThan(fullCanvasBox.x)
  expect(panelBox.x + panelBox.width).toBeLessThan(fullCanvasBox.x + fullCanvasBox.width)
  await page.getByRole('button', { name: '配置输入 / 输出 / 文件', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(workspace).toHaveClass(/workflow-workspace--fullscreen/)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(workspace.getByText('草稿已保存到当前浏览器。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect(panel).toBeVisible()
  await expect(page.getByLabel('节点名称', { exact: true })).toHaveValue('检查输入')
  const objective = page.getByLabel('职责与目标', { exact: true })
  await objective.press('Control+Home')
  await objective.press('ArrowRight')
  await objective.press('ArrowRight')
  await objective.press('ArrowRight')
  await page.getByRole('button', { name: '插入工作流目标', exact: true }).click()
  await expect(objective).toHaveValue('检查 {{goal}}。返回 JSON。')
  await expect(objective).toBeFocused()
  // Continued typing stays immediately after the inserted field.
  await objective.press('x')
  await expect(objective).toHaveValue('检查 {{goal}}x。返回 JSON。')
  await objective.press('Backspace')
  await page.getByRole('button', { name: '添加条件节点', exact: true }).click()
  await page.getByLabel('节点名称', { exact: true }).fill('是否通过')
  await addExpert('发布结果', '发布已经确认的结果。')
  await addExpert('报告问题', '说明遗留问题。', '9')
  await page.getByRole('button', { name: '添加结束节点', exact: true }).click()
  await page.getByLabel('节点名称', { exact: true }).fill('完成')
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  const canvas = page.getByLabel('工作流画布', { exact: true })
  const canvasBox = await canvas.boundingBox()
  const beforePan = await page
    .getByRole('button', { name: '选择节点 检查输入', exact: true })
    .boundingBox()
  if (!canvasBox || !beforePan) throw new Error('Canvas missing')
  await page.mouse.move(canvasBox.x + 15, canvasBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(canvasBox.x + 95, canvasBox.y - 25, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () =>
      Math.round(
        (await page.getByRole('button', { name: '选择节点 检查输入', exact: true }).boundingBox())!
          .x - beforePan.x,
      ),
    )
    .toBe(80)
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  const zoomAnchor = await page
    .getByRole('button', { name: '选择节点 检查输入', exact: true })
    .boundingBox()
  if (!zoomAnchor) throw new Error('Zoom anchor missing')
  const anchorX = zoomAnchor.x + zoomAnchor.width / 2,
    anchorY = zoomAnchor.y + zoomAnchor.height / 2
  const zoomBefore = parseInt((await page.getByRole('button', { name: '重置缩放' }).textContent())!)
  await page.mouse.move(anchorX, anchorY)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -30)
  await page.keyboard.up('Control')
  await expect
    .poll(async () =>
      parseInt((await page.getByRole('button', { name: '重置缩放' }).textContent())!),
    )
    .toBeGreaterThan(zoomBefore)
  const zoomed = (await page
    .getByRole('button', { name: '选择节点 检查输入', exact: true })
    .boundingBox())!
  expect(Math.abs(zoomed.x + zoomed.width / 2 - anchorX)).toBeLessThan(2)
  expect(Math.abs(zoomed.y + zoomed.height / 2 - anchorY)).toBeLessThan(2)
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  const dragTo = async (from: string, to: string) => {
    const source = await page.getByRole('button', { name: from, exact: true }).boundingBox()
    const target = await page.getByRole('button', { name: to, exact: true }).boundingBox()
    if (!source || !target) throw new Error('Connection handle missing')
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
    await expect(page.locator('.workflow-canvas__connection-preview')).toHaveCount(1)
    await page.mouse.up()
    await expect(page.locator('.workflow-canvas__connection-preview')).toHaveCount(0)
  }
  const link = async (from: string, port: string, to: string) => {
    await dragTo(`${from} ${port}出口`, `${to} 入口`)
    await page.getByRole('button', { name: `选择节点 ${to}`, exact: true }).click()
  }
  await link('检查输入', '下一步', '是否通过')
  await page.getByLabel('判断来源', { exact: true }).selectOption({ label: '检查输入' })
  await page.getByLabel('判断方式', { exact: true }).selectOption('JSON_EQUALS')
  await page.getByLabel('JSON Pointer', { exact: true }).fill('/approved')
  await page.getByLabel('条件值', { exact: true }).fill('true')
  await link('是否通过', '满足', '发布结果')
  await link('是否通过', '不满足', '报告问题')
  await link('发布结果', '下一步', '完成')
  await link('报告问题', '下一步', '完成')
  // Entry output can be disconnected and restored without deleting the start node.
  await page.getByRole('button', { name: '选择连线 开始 下一步 到 检查输入', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '断开连线 开始 下一步 到 检查输入', exact: true }).click()
  await link('开始', '下一步', '检查输入')
  // Reconnect an existing endpoint, then return it to the intended join.
  await dragTo('重新连接 发布结果 下一步', '报告问题 入口')
  await page.getByRole('button', { name: '选择节点 发布结果', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择连线 发布结果 下一步 到 报告问题', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('节点配置').getByText('出口连接', { exact: true })).toHaveCount(0)
  await dragTo('重新连接 发布结果 下一步', '完成 入口')
  // Click the actual curve after pan/zoom and disconnect in place, then restore it.
  const edge = page.getByRole('button', { name: '选择连线 发布结果 下一步 到 完成', exact: true })
  const edgePoint = await edge.evaluate((element) => {
    const path = element as SVGPathElement
    const local = path.getPointAtLength(path.getTotalLength() / 2)
    const point = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM()!)
    return { x: point.x, y: point.y }
  })
  await page.mouse.click(edgePoint.x, edgePoint.y)
  await page.getByRole('button', { name: '断开连线 发布结果 下一步 到 完成', exact: true }).click()
  await expect(edge).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '选择连线 报告问题 下一步 到 完成', exact: true }),
  ).toBeVisible()
  await link('发布结果', '下一步', '完成')
  // Cancel an in-progress connection without changing the saved graph.
  const cancelPort = await page
    .getByRole('button', { name: '检查输入 下一步出口', exact: true })
    .boundingBox()
  if (!cancelPort) throw new Error('Port missing')
  await page.mouse.move(cancelPort.x + 8, cancelPort.y + 8)
  await page.mouse.down()
  await page.mouse.move(cancelPort.x + 80, cancelPort.y + 30, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(page.locator('.workflow-canvas__connection-preview')).toHaveCount(0)
  const heading = page.getByRole('button', { name: '选择节点 检查输入', exact: true })
  await heading.scrollIntoViewIfNeeded()
  const box = await heading.boundingBox()
  if (!box) throw new Error('Node missing')
  await page.mouse.move(box.x + 70, box.y + 25)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 65, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.reload()
  await expect(page.getByText('已恢复当前浏览器中的工作流草稿。')).toBeVisible()
  await expect(page.getByRole('button', { name: '创建并执行', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '选择节点 是否通过', exact: true }).click()
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await page.screenshot({
    path: testInfo.outputPath('workflow-canvas.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '全屏编辑', exact: true }).click()
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  await page.screenshot({
    path: testInfo.outputPath('workflow-fullscreen.png'),
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '收起节点配置', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: '选择节点 是否通过', exact: true }).click()
  await expect(page.getByLabel('条件值', { exact: true })).toHaveValue('true')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '适应画布', exact: true }).click()
  const mobilePanel = (await panel.boundingBox())!
  expect(mobilePanel.x).toBeGreaterThanOrEqual(0)
  expect(mobilePanel.x + mobilePanel.width).toBeLessThanOrEqual(390)
  await page.screenshot({
    path: testInfo.outputPath('workflow-editor-mobile.png'),
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 1600, height: 1100 })
  await page.getByLabel('条件值', { exact: true }).press('Escape')
  await expect(workspace).not.toHaveClass(/workflow-workspace--fullscreen/)
  await expect(page.getByRole('button', { name: '全屏编辑', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '创建并执行', exact: true }).click()
  await expect(page).toHaveURL(/execution=1/)
  await expect(page.getByRole('heading', { name: '订单查询协作' })).toBeVisible()
  expect(creates).toHaveLength(1)
  expect(creates[0]!.workflow.nodes).toHaveLength(6)
  expect(creates[0]!.workflow.nodes[0]!.kind).toBe('START')
  expect(creates[0]!.workflow.startNodeId).toBe(creates[0]!.workflow.nodes[0]!.id)
  expect(creates[0]!.workflow.nodes[0]!.next).toBe(creates[0]!.workflow.nodes[1]!.id)
  expect(creates[0]!.workflow.nodes[1]!.objective).toBe('检查 {{goal}}。返回 JSON。')
  expect(creates[0]!.workflow.nodes[1]!.x).toBeGreaterThan(40)
  expect(creates[0]!.workflow.nodes[2]!.condition).toMatchObject({
    operator: 'JSON_EQUALS',
    pointer: '/approved',
    value: 'true',
  })
  expect(creates[0]).not.toHaveProperty('expertIds')
  if (!execution) throw new Error('Execution not created')
  ;(execution as Orchestration).steps[1]!.status = 'WAITING_APPROVAL'
  await expect.poll(() => Boolean(socket)).toBe(true)
  socket!.send(
    JSON.stringify({ type: 'ORCHESTRATION_UPDATED', payload: { projectId: 2, executionId: 1 } }),
  )
  await page.getByRole('button', { name: '处理审批 / 回答问题' }).click()
  const viewer = page.getByRole('dialog', { name: '检查输入 · 步骤会话' })
  await expect(viewer.getByText('检查订单查询，返回 JSON。', { exact: true })).toBeVisible()
  await expect(viewer.getByText('已核对查询条件，等待确认。')).toBeVisible()
  await expect(viewer.locator('textarea, [contenteditable="true"]')).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: '发送', exact: true })).toHaveCount(0)
  await expect(page).toHaveURL(/\/projects\/2\/orchestrations\?execution=1/)
  await expect(viewer.getByText('确认本次订单查询检查', { exact: true })).toBeVisible()
  await expect(viewer).toHaveCSS('opacity', '1')
  await page.screenshot({
    path: testInfo.outputPath('step-conversation.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await viewer.getByRole('button', { name: '批准本次', exact: true }).click()
  await expect(viewer.getByLabel('步骤待处理审批')).toHaveCount(0)
  expect(approvalResolved).toBe(true)
  await viewer.getByRole('button', { name: '关闭会话' }).click()
  await expect(viewer).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '处理审批 / 回答问题' })).toBeVisible()
  ;(execution as Orchestration).steps[1]!.status = 'WAITING_USER'
  await page.reload()
  await expect(page.getByText('等待补充信息 · #1', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '回答节点问题' }).click()
  await viewer.getByLabel('你的回答', { exact: true }).fill('只查询美国 Vantrue 主店')
  await expect(viewer.getByPlaceholder('请输入你的回答或补充说明')).toBeVisible()
  await viewer.getByRole('button', { name: '发送并继续当前节点', exact: true }).click()
  await expect(viewer.getByLabel('节点补充信息')).toHaveCount(0)
  expect(continuations).toHaveLength(1)
  expect(continuations[0]).toMatchObject({ expectedTurnId: 7, message: '只查询美国 Vantrue 主店' })
  expect((execution as Orchestration).steps[2]!.status).toBe('PENDING')
  await expect(page).toHaveURL(/\/projects\/2\/orchestrations\?execution=1/)
  await viewer.getByRole('button', { name: '关闭会话' }).click()
  ;(execution as Orchestration).status = 'NEEDS_ATTENTION'
  ;(execution as Orchestration).steps[1]!.status = 'NEEDS_ATTENTION'
  await page.reload()
  await page.getByRole('button', { name: '查看步骤会话', exact: true }).click()
  await expect(viewer.locator('textarea')).toHaveCount(0)
  await viewer.getByRole('button', { name: '关闭会话' }).click()
  await page.getByRole('button', { name: '重新校验并推进', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新校验并推进', exact: true })).toHaveCount(0)
  expect(rechecks).toEqual([{ expectedTurnId: 8 }])
  expect(continuations).toHaveLength(1)
  await page.getByPlaceholder('搜索编排名称').fill('订单')
  await page.getByPlaceholder('搜索编排名称').press('Enter')
  await expect.poll(() => searches.includes('订单')).toBe(true)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('workflow-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '停止编排', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByText('正在停止 · #1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止编排', exact: true })).toHaveCount(0)
  ;(execution as Orchestration).status = 'CANCELLED'
  for (const step of (execution as Orchestration).steps) step.status = 'CANCELLED'
  socket!.send(
    JSON.stringify({ type: 'ORCHESTRATION_UPDATED', payload: { projectId: 2, executionId: 1 } }),
  )
  await expect(page.getByText('已停止 · #1', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '复制到画布' }).click()
  await expect(page.getByText('已复制工作流，修改后创建新的执行。')).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(6)
  await expect(page.getByRole('button', { name: '选择节点 开始', exact: true })).toHaveCount(1)
  // Restore a pre-entry draft; keep its original first Expert and add only one start.
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.evaluate(() => {
    const key = 'harness-workflow-draft:3:2'
    const draft = JSON.parse(localStorage.getItem(key)!)
    const start = draft.workflow.nodes.find((node: { kind: string }) => node.kind === 'START')
    draft.workflow.startNodeId = start.next
    draft.workflow.schemaVersion = 2
    draft.workflow.nodes = draft.workflow.nodes.filter(
      (node: { kind: string }) => node.kind !== 'START',
    )
    localStorage.setItem(key, JSON.stringify(draft))
  })
  const editor = new URL(page.url())
  editor.search = ''
  await page.goto(editor.toString())
  await expect(page.getByText('已恢复当前浏览器中的工作流草稿。')).toBeVisible()
  await expect(page.locator('[data-node-id]')).toHaveCount(6)
  await expect(
    page.getByRole('button', { name: '选择连线 开始 下一步 到 检查输入', exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '选择节点 开始', exact: true })).toHaveCount(1)
  expect(errors).toEqual([])
})
