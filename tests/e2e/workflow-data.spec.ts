import { expect, test, type WebSocketRoute } from '@playwright/test'
import { sessionCredentials } from '../support/auth'
import type { Orchestration, CreateOrchestration } from '../../src/types/orchestration'

test('configure typed workflow inputs schemas and file references', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  let socket: WebSocketRoute | undefined
  let execution: Orchestration | null = null
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
        ],
      }
    else if (path === '/auth/socket-ticket') data = { ticket: 'test-ticket', expiresInSeconds: 60 }
    else if (path === '/auth/activity') {
      const s = sessionCredentials('orchestration-e2e')
      data = { idleExpiresAt: s.idleExpiresAt, sessionExpiresAt: s.sessionExpiresAt }
    } else if (path === '/projects') data = { items: [], total: 0, page: 1, size: 10 }
    else if (path === '/projects/2/experts')
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

  await page.route('**/projects/2/workspace-files?*', (route) =>
    route.fulfill({
      json: {
        status: 'success',
        code: 200,
        info: '',
        data: {
          path: '',
          generation: '1',
          scannedAt: Date.now(),
          entries: [
            {
              name: 'requirements.md',
              path: 'requirements.md',
              type: 'FILE',
              sizeBytes: 100,
              modifiedAt: Date.now(),
            },
          ],
          nextCursor: null,
          loaded: true,
          online: true,
          supported: true,
          operation: null,
          maxFileBytes: 10000,
        },
      },
    }),
  )
  await page.goto('/projects/2/orchestrations/new')
  await page.getByLabel('编排名称', { exact: true }).fill('结构化交接示例')
  await page.getByLabel('工作流目标', { exact: true }).fill('检查需求并整理报告')
  await page.getByRole('button', { name: '添加 Expert 节点', exact: true }).click()
  await page.getByLabel('节点名称', { exact: true }).fill('检查需求')
  await page.getByLabel('执行 Expert', { exact: true }).selectOption('8')
  await page
    .getByLabel('职责与目标', { exact: true })
    .fill('检查需求并按我指定的 Schema 返回 JSON。')
  await page.getByRole('button', { name: '配置输入 / 输出 / 文件', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '节点输入输出配置', exact: true })
  await dialog.getByRole('button', { name: '添加输入字段', exact: true }).click()
  await dialog.getByLabel('输入字段名 1', { exact: true }).fill('goal')
  await dialog.getByRole('button', { name: '插入全部输入', exact: true }).click()
  await dialog.getByRole('button', { name: '输出 Schema', exact: true }).click()
  await dialog.getByLabel('启用输出 Schema 校验').check()
  await dialog.getByRole('button', { name: '插入输出 Schema', exact: true }).click()
  await dialog.getByRole('button', { name: 'JSON 编辑', exact: true }).click()
  await dialog
    .getByLabel('输出 Schema JSON', { exact: true })
    .fill(
      '{"type":"object","properties":{"approved":{"type":"boolean"},"summary":{"type":"string"}},"required":["approved","summary"],"additionalProperties":false}',
    )
  await page.screenshot({ path: testInfo.outputPath('workflow-output-schema.png'), fullPage: true })
  await dialog.getByRole('button', { name: '输入输出文件', exact: true }).click()
  await dialog.getByRole('button', { name: '添加输入文件', exact: true }).click()
  await dialog.getByLabel('输入文件别名 1', { exact: true }).fill('requirements')
  await dialog.getByRole('button', { name: '选择文件', exact: true }).click()
  await page.getByRole('button', { name: '选择文件 requirements.md', exact: true }).click()
  await expect(dialog.getByLabel('输入文件路径 1', { exact: true })).toHaveValue('requirements.md')
  await dialog.getByRole('button', { name: '添加输出文件', exact: true }).click()
  await dialog.getByLabel('输出文件别名 1', { exact: true }).fill('report')
  await dialog.getByLabel('输出文件路径 1', { exact: true }).fill('docs/report.md')
  await dialog
    .getByLabel('配置中的职责与目标', { exact: true })
    .fill(
      '目标：{{inputs}}\n读取 {{file:requirements}}，生成 {{outputFile:report}}。\n最终回复只输出符合以下 Schema 的 JSON：{{outputSchema}}',
    )
  await dialog.getByRole('button', { name: '应用输入输出配置', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: '添加 Expert 节点', exact: true }).click()
  await page.getByLabel('节点名称', { exact: true }).fill('整理报告')
  await page.getByLabel('执行 Expert', { exact: true }).selectOption('9')
  await page.getByLabel('职责与目标', { exact: true }).fill('根据检查结论整理报告。')
  // Keyboard activation preserves the click-to-connect accessibility path.
  await page.getByRole('button', { name: '检查需求 下一步出口', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '整理报告 入口', exact: true }).click()
  await page.getByRole('button', { name: '选择节点 整理报告', exact: true }).click()
  await page.getByRole('button', { name: '配置输入 / 输出 / 文件', exact: true }).click()
  await dialog.getByRole('button', { name: '添加输入字段', exact: true }).click()
  await dialog.getByLabel('输入字段名 1', { exact: true }).fill('summary')
  await dialog.getByLabel('输入来源 1', { exact: true }).selectOption('RESULT_JSON')
  await dialog.getByLabel('输入上游 1', { exact: true }).selectOption({ label: '检查需求' })
  await dialog.getByLabel('输入 JSON Pointer 1', { exact: true }).fill('/summary')
  await dialog.getByRole('button', { name: '插入此字段', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('workflow-input-mapping.png'), fullPage: true })
  await dialog.getByRole('button', { name: '输入输出文件', exact: true }).click()
  await dialog.getByRole('button', { name: '添加输入文件', exact: true }).click()
  await dialog.getByLabel('输入文件别名 1', { exact: true }).fill('priorReport')
  await dialog.getByLabel('文件来源 1', { exact: true }).selectOption('UPSTREAM')
  await dialog.getByLabel('文件上游 1', { exact: true }).selectOption({ label: '检查需求' })
  await dialog.getByLabel('上游输出文件 1', { exact: true }).selectOption('report')
  await dialog.getByRole('button', { name: '插入文件路径', exact: true }).click()
  await page.screenshot({
    path: testInfo.outputPath('workflow-file-references.png'),
    fullPage: true,
  })
  await dialog.getByRole('button', { name: '应用输入输出配置', exact: true }).click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.reload()
  await expect(page.getByText('已恢复当前浏览器中的工作流草稿。')).toBeVisible()
  await page.getByRole('button', { name: '创建并执行', exact: true }).click()
  await expect(page).toHaveURL(/execution=1/)
  expect(creates).toHaveLength(1)
  const graph = creates[0]!.workflow
  expect(graph.schemaVersion).toBe(4)
  expect(graph.nodes[1]!.outputSchema?.required).toEqual(['approved', 'summary'])
  expect(graph.nodes[1]!.inputFiles?.[0]?.path).toBe('requirements.md')
  expect(graph.nodes[1]!.outputFiles?.[0]?.path).toBe('docs/report.md')
  expect(graph.nodes[2]!.inputs?.[0]).toMatchObject({
    source: 'RESULT_JSON',
    pointer: '/summary',
    sourceNodeId: graph.nodes[1]!.id,
  })
  expect(graph.nodes[2]!.inputFiles?.[0]).toMatchObject({
    sourceNodeId: graph.nodes[1]!.id,
    sourceFile: 'report',
  })
  if (!execution) throw new Error('Missing execution')
  const completed = execution as Orchestration
  completed.steps[0]!.status = 'SUCCEEDED'
  completed.steps[1]!.result = {
    schemaVersion: 2,
    summary: '{"approved":true,"summary":"演示结果"}',
    sourceTurnId: 7,
    expertVersionId: 1,
    sourceMessageIds: [1],
    truncated: false,
    output: { approved: true, summary: '演示结果' },
    files: graph.nodes[1]!.outputFiles,
  }
  await expect.poll(() => Boolean(socket)).toBe(true)
  socket!.send(
    JSON.stringify({ type: 'ORCHESTRATION_UPDATED', payload: { projectId: 2, executionId: 1 } }),
  )
  await expect(page.getByText('已通过 Schema 校验的输出')).toBeVisible()
  await expect(page.getByText('声明的输出文件（尚未核实存在性和内容）')).toBeVisible()
  await page.getByRole('link', { name: '复制到画布', exact: true }).click()
  await page.getByRole('button', { name: '选择节点 检查需求', exact: true }).click()
  await expect(page.getByText('1 个输入字段 · JSON 输出校验 · 2 个文件引用')).toBeVisible()
  expect(errors).toEqual([])
})
