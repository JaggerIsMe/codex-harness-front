import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'
import type {
  AssignmentCandidate,
  AssignmentSubmission,
  AssignmentTargetInput,
} from '../../src/types/skill-assignment'

test('selected Skills are assigned together with replacement preview and history', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('batch-assignment-fixture'),
  )
  const skills = ['code-review', 'research'].map((name, index) => ({
    id: index + 1,
    skillName: name,
    description: '示例 Skill',
    status: 'ENABLED',
    versionCount: 1,
    versions: [
      {
        id: index + 10,
        skillId: index + 1,
        version: '2.0',
        status: 'ACTIVE',
        fileSize: 123,
        sha256: 'a'.repeat(64),
      },
    ],
  }))
  const targets = skills.map((s) => ({
    skillId: s.id,
    versionId: s.versions[0]!.id,
    skillName: s.skillName,
    version: '2.0',
  }))
  const candidate: AssignmentCandidate = {
    expertId: 7,
    name: '研发专家',
    status: 'PUBLISHED',
    revision: 3,
    draftVersionId: 9,
    draftVersion: '1.0',
    publishedVersion: '1.0',
    action: 'REPLACE',
    reason: '',
    changes: [
      {
        ...targets[0]!,
        draftVersionId: 9,
        draftVersion: '1.0',
        publishedVersion: '1.0',
        action: 'REPLACE',
      },
      {
        ...targets[1]!,
        draftVersionId: null,
        draftVersion: null,
        publishedVersion: null,
        action: 'ADD',
      },
    ],
  }
  const result: AssignmentSubmission = {
    batchId: 'batch-many',
    skillName: 'code-review',
    version: '2.0',
    targets,
    started: false,
    complete: false,
    items: [],
    ownerId: 1,
    ownerName: '管理员',
  }
  const otherResult: AssignmentSubmission = {
    ...result,
    batchId: 'other-admin-batch',
    ownerId: 902,
    ownerName: '审核管理员',
    started: true,
    canResume: false,
    expertResults: { total: 3, successCount: 1, failedCount: 1, skippedCount: 0, pendingCount: 1 },
    bindingResults: { total: 6, successCount: 1, failedCount: 2, skippedCount: 1, pendingCount: 2 },
  }
  let input: { targets: AssignmentTargetInput[]; expertIds: number[] } | undefined
  let commits = 0
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'batch@example.test',
        displayName: '管理员',
        roles: ['SYS_ADMIN'],
        permissions: ['skill:manage', 'expert:manage'],
        mustChangePassword: false,
        activated: true,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/skills') data = { items: skills, total: skills.length, page: 1, size: 20 }
    if (path === '/skills/options' || path === '/skills/selected') data = skills
    if (path === '/skill-expert-assignments/batch/candidates')
      data = { items: [candidate], total: 1, page: 1, size: 20 }
    if (path === '/skill-expert-assignments/batch/preview') {
      input = route.request().postDataJSON()
      data = {
        batchId: result.batchId,
        skillName: result.skillName,
        version: result.version,
        targets,
        items: [candidate],
        expiresAt: '2099-01-01',
      }
    }
    if (path === '/skill-expert-assignments/batch-many/commit') {
      commits++
      result.started = true
      result.complete = true
      result.expertResults = {
        total: 1,
        successCount: 1,
        failedCount: 0,
        skippedCount: 0,
        pendingCount: 0,
      }
      result.bindingResults = {
        total: 2,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        pendingCount: 0,
      }
      result.items = [
        {
          expertId: 7,
          name: candidate.name,
          action: 'REPLACE',
          previousVersionId: 9,
          versionId: 10,
          status: 'SUCCESS',
          message: '已更新草稿，发布后生效',
          revision: 4,
          changes: candidate.changes,
        },
      ]
      data = result
    }
    if (path === '/skill-expert-assignments/batch-many') data = result
    if (path === '/skill-expert-assignments/other-admin-batch') data = otherResult
    if (path === '/skill-expert-assignments' && result.complete)
      data = [
        {
          ...result,
          batchId: result.batchId,
          skillName: result.skillName,
          version: result.version,
          targets,
          createdAt: '2026-09-12',
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
        },
        {
          ...otherResult,
          createdAt: '2026-09-12',
          successCount: 1,
          failedCount: 1,
          skippedCount: 0,
        },
      ]
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/skills')
  await expect(page.getByRole('button', { name: '批量分配', exact: true })).toBeDisabled()
  await page.getByLabel('选择 code-review', { exact: true }).check()
  await page.getByLabel('选择 research', { exact: true }).check()
  await page.getByRole('button', { name: '批量分配（2）', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('已选 2 个 Skill')
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await expect(
    dialog.getByRole('list', { name: '本次分配的 Skill' }).getByRole('listitem'),
  ).toHaveCount(2)
  await dialog.getByLabel('选择 研发专家', { exact: true }).check()
  await dialog.getByRole('button', { name: '预览分配', exact: true }).click()
  const preview = dialog.locator('.skill-import__notice')
  await expect(preview).toContainText('code-review：1.0 → 2.0（替换版本）')
  await expect(preview).toContainText('research：未绑定 → 2.0（新增绑定）')
  await expect(dialog.getByRole('button', { name: '确认分配', exact: true })).toBeDisabled()
  await page.screenshot({
    path: testInfo.outputPath('batch-assignment-preview.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 900, height: 850 })
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await dialog.getByLabel('已核对新增与替换内容，确认更新专家草稿').check()
  await dialog.getByRole('button', { name: '确认分配', exact: true }).click()
  await expect(dialog).toContainText('2 个 Skill 批量分配结果')
  await expect(dialog).toContainText('研发专家：已更新草稿，发布后生效')
  expect(input).toEqual({
    targets: targets.map(({ skillId, versionId }) => ({ skillId, versionId })),
    expertIds: [7],
  })
  expect(commits).toBe(1)
  await dialog.getByRole('button', { name: '关闭', exact: true }).first().click()
  await page.getByRole('tab', { name: '分配记录' }).click()
  await expect(page.getByRole('tabpanel')).toContainText('code-review')
  await expect(page.getByRole('tabpanel')).toContainText('research')
  await expect(page.getByRole('tabpanel')).toContainText('全部管理员')
  const otherRow = page.getByRole('row').filter({ hasText: '审核管理员' })
  await expect(otherRow).toContainText('专家（3 位）：成功 1 / 失败 1 / 跳过 0 / 待处理 1')
  await expect(otherRow).toContainText('Skill 绑定（6 项）：成功 1 / 失败 2 / 跳过 1 / 待处理 2')
  await expect(otherRow).toContainText('未完成')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('assignment-history.png'), fullPage: true })
  await otherRow.getByRole('button', { name: '查看结果' }).click()
  await expect(page.getByRole('dialog')).toContainText('尚未处理完成，请由原操作人恢复提交')
  await expect(page.getByRole('dialog')).toContainText('操作人：审核管理员')
  expect(errors).toEqual([])
})
