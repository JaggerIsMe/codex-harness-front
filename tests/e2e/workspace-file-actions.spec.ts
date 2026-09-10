import { expect, test, type Page } from '@playwright/test'
import type { WorkspaceFileEntry, WorkspaceFileOperation } from '../../src/types/workspace-file'

async function fixture(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const response = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
  const project = {
    id: 3,
    projectName: '文件操作项目',
    provisioningStatus: 'READY',
    status: 'ACTIVE',
    deviceId: 1,
    deviceName: '测试设备',
    deviceStatus: 'ONLINE',
    workspaceId: 2,
    workspaceName: '工作区',
    workspaceStatus: 'ENABLED',
    rootPath: 'D:/workspace',
    conversationCount: 1,
    isolationMode: 'WINDOWS_PROJECT_PROFILE',
  }
  const conversation = {
    id: 4,
    projectId: 3,
    projectName: project.projectName,
    deviceId: 1,
    workspaceId: 2,
    title: '文件操作会话',
    status: 'ACTIVE',
    codexThreadId: 'thread-4',
  }
  await page.addInitScript(() => localStorage.setItem('harness_access_token', 'test-token'))
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'tester@example.com',
        roles: ['USER'],
        permissions: ['workspace:use', 'conversation:read', 'turn:start'],
        mustChangePassword: false,
        activated: true,
      }
    else if (path === '/auth/socket-ticket') data = { ticket: 'ticket', expiresInSeconds: 60 }
    else if (path === '/projects') data = { items: [project], total: 1, page: 1, size: 20 }
    else if (path === '/projects/3') data = project
    else if (path === '/projects/3/conversations')
      data = { items: [conversation], total: 1, page: 1, size: 10 }
    else if (path === '/projects/3/conversations/4') data = conversation
    else if (path.endsWith('/active-turn')) data = null
    else if (path.endsWith('/message-state'))
      data = {
        turnId: null,
        cursor: 0,
        hasMore: false,
        degraded: false,
        resetRequired: false,
        updates: [],
        messages: [],
      }
    else if (path.endsWith('/attachments/limits'))
      data = { maxFileBytes: 20971520, maxFiles: 5, maxTotalBytes: 52428800, agentSupported: true }
    else if (path.endsWith('/expert'))
      data = {
        expertId: 10,
        expertVersionId: 100,
        name: '文件专家',
        selectionRevision: 1,
        projectRevision: 1,
        available: true,
      }
    else if (path.endsWith('/experts'))
      data = {
        projectRevision: 1,
        experts: [
          { expertId: 10, expertVersionId: 100, versionNo: 1, name: '文件专家', available: true },
        ],
      }
    await route.fulfill({ json: response(data) })
  })
  const entry = (path: string, type: WorkspaceFileEntry['type'] = 'FILE'): WorkspaceFileEntry => ({
    path,
    name: path.split('/').at(-1)!,
    type,
    sizeBytes: type === 'FILE' ? 5 : 0,
    modifiedAt: 1,
    entryRevision: `rev-${path}`,
  })
  const directories: Record<string, WorkspaceFileEntry[]> = {
    '': [entry('a.txt'), entry('docs', 'DIRECTORY'), entry('archive', 'DIRECTORY')],
    docs: [entry('docs/a.txt'), entry('docs/b.txt')],
    archive: [],
  }
  const operations: Record<string, WorkspaceFileOperation> = {}
  const requests: { endpoint: string; data: Record<string, unknown> }[] = []
  let sequence = 100,
    generation = 1,
    expirePlan = false,
    unknownRename = false,
    archiveRunning = false
  const parent = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
  await page.route('**/workspace-files**', async (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer test-token')
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/workspace-files')[1] || ''
    if (!endpoint)
      return route.fulfill({
        json: response({
          path: url.searchParams.get('path') || '',
          generation: String(generation),
          scannedAt: Date.now(),
          entries: directories[url.searchParams.get('path') || ''] || [],
          nextCursor: null,
          loaded: true,
          online: true,
          supported: true,
          operation: null,
          maxFileBytes: 20971520,
          capabilities: {
            mutations: { supported: true, enabled: true, reason: null },
            archive: { supported: true, enabled: true, reason: null },
          },
          limits: {
            maxArchiveFiles: 100,
            maxArchiveSourceBytes: 104857600,
            maxArchiveOutputBytes: 115343360,
            maxFileBytes: 20971520,
            maxRequestBytes: 524288,
          },
        }),
      })
    if (endpoint === '/operations')
      return route.fulfill({
        json: response({
          items: Object.values(operations)
            .filter((op) => op.kind !== 'PREPARE_WORKSPACE_DOWNLOAD')
            .reverse(),
          nextCursor: null,
        }),
      })
    if (endpoint.startsWith('/operations/')) {
      const operation = operations[endpoint.split('/')[2]!]!
      if (endpoint.endsWith('/content'))
        return route.fulfill({
          body: operation.kind === 'PREPARE_WORKSPACE_ARCHIVE' ? 'ZIP fixture' : 'hello',
          contentType: 'application/octet-stream',
        })
      if (endpoint.endsWith('/items'))
        return route.fulfill({
          json: response({ items: operation.result?.items || [], nextCursor: null }),
        })
      if (endpoint.endsWith('/preview'))
        return route.fulfill({
          json: response({
            operationId: operation.id,
            path: operation.path,
            fileName: operation.path.split('/').at(-1),
            kind: 'TEXT',
            mediaType: 'text/plain',
            encoding: 'utf-8',
            sizeBytes: 5,
            sha256: 'a'.repeat(64),
            readyAt: '',
            width: null,
            height: null,
            reason: null,
            limits: {
              maxBytes: 1048576,
              maxLines: 20000,
              maxRows: 1000,
              maxColumns: 100,
              maxPixels: 20000000,
            },
          }),
        })
      if (endpoint.endsWith('/reconcile')) {
        operation.status = 'SUCCEEDED'
        operation.error = null
        generation++
      }
      return route.fulfill({ json: response(operation) })
    }
    const data = route.request().postDataJSON() as Record<string, unknown>
    requests.push({ endpoint, data })
    const id = String(++sequence)
    const operation: WorkspaceFileOperation = {
      id,
      kind: '',
      path: String(data.path || ''),
      status: 'SUCCEEDED',
      error: null,
    }
    if (endpoint === '/renames' || endpoint === '/moves') {
      const path = String(data.path)
      const file = directories[parent(path)]!.find((file) => file.path === path)!
      const destination = endpoint === '/renames' ? parent(path) : String(data.targetDirectory)
      const target =
        (destination ? `${destination}/` : '') +
        (endpoint === '/renames' ? String(data.name) : file.name)
      expect(data.expectedRevision).toBe(file.entryRevision)
      directories[parent(path)] = directories[parent(path)]!.filter((file) => file.path !== path)
      directories[destination]!.push(entry(target, file.type))
      operation.kind = 'RELOCATE_WORKSPACE_ENTRY'
      operation.targetPath = target
      operation.result = {
        version: 1,
        status: 'SUCCEEDED',
        outcome: 'COMPLETE',
        sourcePath: path,
        targetPath: target,
        entryType: file.type,
        entryRevision: `rev-${target}`,
      }
      if (unknownRename) {
        operation.status = 'UNKNOWN'
        operation.error = '设备断线，结果未知'
      }
      generation++
    } else if (endpoint === '/delete-plans') {
      operation.kind = 'PREPARE_WORKSPACE_DELETE'
      operation.attachmentCount = 2
      operation.result = {
        version: 1,
        status: 'SUCCEEDED',
        outcome: 'NO_CHANGE',
        plan: {
          planId: id,
          planDigest: `digest-${id}`,
          path: operation.path,
          entryType: 'DIRECTORY',
          entryRevision: String(data.expectedRevision),
          fileCount: 2,
          directoryCount: 1,
          totalBytes: 10,
          expiresAt: Date.now() + (expirePlan ? -1000 : 120000),
        },
      }
    } else if (endpoint === '/deletions') {
      const plan = operations[String(data.planId)]!.result!.plan!
      expect(data.planDigest).toBe(plan.planDigest)
      operation.kind = 'DELETE_WORKSPACE_ENTRY'
      operation.path = plan.path
      operation.result = {
        version: 1,
        status: 'SUCCEEDED',
        outcome: 'COMPLETE',
        sourcePath: plan.path,
        entryType: 'DIRECTORY',
      }
      directories[parent(plan.path)] = directories[parent(plan.path)]!.filter(
        (file) => file.path !== plan.path,
      )
      delete directories[plan.path]
      generation++
    } else if (endpoint === '/archive-downloads') {
      operation.kind = 'PREPARE_WORKSPACE_ARCHIVE'
      operation.contentState = 'AVAILABLE'
      if (archiveRunning) operation.status = 'RUNNING'
    } else if (endpoint === '/downloads') operation.kind = 'PREPARE_WORKSPACE_DOWNLOAD'
    operations[id] = operation
    return route.fulfill({ json: response(operation) })
  })
  await page.goto('/projects/3?id=4')
  await page.getByRole('button', { name: '工作区文件', exact: true }).click()
  const panel = page.getByRole('complementary', { name: '工作区文件' })
  await expect(panel.getByRole('button', { name: '预览 a.txt' })).toBeVisible()
  return {
    panel,
    errors,
    operations,
    requests,
    expirePlan: (value: boolean) => (expirePlan = value),
    unknownRename: (value: boolean) => (unknownRename = value),
    archiveRunning: (value: boolean) => (archiveRunning = value),
  }
}

test('renames with keyboard, closes the old preview and moves files without changing upload destination', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1900, height: 1000 })
  const state = await fixture(page)
  await state.panel.getByRole('button', { name: '预览 a.txt' }).click()
  const preview = page.getByRole('complementary', { name: '文件预览', exact: true })
  await expect(preview).toContainText('hello')
  await state.panel.getByRole('button', { name: 'a.txt 更多操作' }).focus()
  await page.keyboard.press('Enter')
  await page.screenshot({ path: '../.scratch/workspace-file-actions/preview.png', fullPage: true })
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('renamed.txt')
  await dialog.getByRole('textbox').press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(preview).not.toBeVisible()
  await expect(state.panel.getByRole('button', { name: '预览 renamed.txt' })).toBeVisible()
  await state.panel.getByRole('button', { name: 'renamed.txt 更多操作' }).click()
  await page.getByRole('menuitem', { name: '移动到' }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: '移动文件', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'archive', exact: true }).click()
  await dialog.getByRole('button', { name: '移动文件', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(state.panel).toContainText('上传位置：工作区根目录')
  await state.panel.getByRole('button', { name: 'archive', exact: true }).click()
  await expect(state.panel.getByRole('button', { name: '预览 renamed.txt' })).toBeVisible()
  expect(
    state.requests.filter((request) => request.endpoint === '/moves')[0]?.data.targetDirectory,
  ).toBe('archive')
  await page.screenshot({ path: testInfo.outputPath('workspace-actions.png'), fullPage: true })
  expect(state.errors).toEqual([])
})

test('requires a fresh deletion inspection and exact folder confirmation before deleting unseen contents', async ({
  page,
}) => {
  const state = await fixture(page)
  state.expirePlan(true)
  await state.panel.getByRole('button', { name: 'docs 更多操作' }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText('检查结果已过期')
  await expect(dialog).toContainText('涉及 2 个附件关联')
  await expect(dialog.getByRole('button', { name: '永久删除', exact: true })).toBeDisabled()
  state.expirePlan(false)
  await dialog.getByRole('button', { name: '重新检查' }).click()
  await expect(dialog).toContainText('2 个文件、1 个文件夹')
  await dialog.getByRole('textbox').fill('doc')
  await expect(dialog.getByRole('button', { name: '永久删除', exact: true })).toBeDisabled()
  await dialog.getByRole('textbox').fill('docs')
  await dialog.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(state.panel.getByRole('button', { name: 'docs', exact: true })).toHaveCount(0)
  expect(state.requests.filter((request) => request.endpoint === '/deletions')).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('keeps folded multi-selections, freezes one ZIP job and restores its explicit download after closing the panel', async ({
  page,
}) => {
  const state = await fixture(page)
  await state.panel.getByRole('button', { name: '多选', exact: true }).click()
  await state.panel.getByRole('checkbox', { name: '选择 a.txt', exact: true }).check()
  await state.panel.getByRole('button', { name: 'docs', exact: true }).click()
  await state.panel.getByRole('checkbox', { name: '选择 docs/a.txt', exact: true }).check()
  await state.panel.getByRole('button', { name: 'docs', exact: true }).click()
  await expect(state.panel).toContainText('已选 2 个')
  state.archiveRunning(true)
  await state.panel.getByRole('button', { name: '下载 ZIP', exact: true }).click()
  await expect
    .poll(
      () => state.requests.filter((request) => request.endpoint === '/archive-downloads').length,
    )
    .toBe(1)
  await state.panel.getByRole('checkbox', { name: '选择 a.txt', exact: true }).uncheck()
  const input = state.requests.find((request) => request.endpoint === '/archive-downloads')!.data
  expect(input.items).toEqual([
    { path: 'a.txt', expectedRevision: 'rev-a.txt' },
    { path: 'docs/a.txt', expectedRevision: 'rev-docs/a.txt' },
  ])
  await state.panel.getByRole('button', { name: '收起工作区文件' }).click()
  const archive = Object.values(state.operations).find(
    (operation) => operation.kind === 'PREPARE_WORKSPACE_ARCHIVE',
  )!
  archive.status = 'SUCCEEDED'
  await page.getByRole('button', { name: '工作区文件', exact: true }).click()
  await state.panel.getByText('近期操作', { exact: true }).click()
  const download = page.waitForEvent('download')
  await state.panel.getByRole('button', { name: '下载 ZIP', exact: true }).click()
  expect((await download).suggestedFilename()).toBe(`workspace-${archive.id}.zip`)
  expect(
    state.requests.filter((request) => request.endpoint === '/archive-downloads'),
  ).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('unknown relocation offers state reconciliation and keeps mutations from being replayed', async ({
  page,
}) => {
  const state = await fixture(page)
  state.unknownRename(true)
  await state.panel.getByRole('button', { name: 'a.txt 更多操作' }).click()
  await page.getByRole('menuitem', { name: '重命名', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('b.txt')
  await dialog.getByRole('textbox').press('Enter')
  await expect(dialog.getByRole('alert')).toContainText('结果未知')
  await expect(dialog.getByRole('button', { name: '保存名称', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click()
  await state.panel.locator('summary').filter({ hasText: '近期操作' }).click()
  await state.panel.getByRole('button', { name: '核实状态' }).click()
  await expect(state.panel.getByRole('button', { name: '核实状态' })).toHaveCount(0)
  expect(state.requests.filter((request) => request.endpoint === '/renames')).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test.describe('workspace actions on touch screens', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('opens the row menu and selects an existing destination without requiring a right click', async ({
    page,
  }, testInfo) => {
    const state = await fixture(page)
    await state.panel.getByRole('button', { name: 'a.txt 更多操作' }).tap()
    await page.getByRole('menuitem', { name: '移动到' }).tap()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'archive', exact: true }).tap()
    await page.screenshot({ path: testInfo.outputPath('workspace-move-touch.png'), fullPage: true })
    await dialog.getByRole('button', { name: '移动文件', exact: true }).tap()
    await expect(dialog).not.toBeVisible()
    expect(state.requests.filter((request) => request.endpoint === '/moves')).toHaveLength(1)
    expect(state.errors).toEqual([])
  })
})
