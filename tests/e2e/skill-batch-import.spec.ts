import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'
import type { SkillImportInput, SkillImportPreview } from '../../src/types/skill-import'

test('batch update previews affected experts and submits confirmed versions', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('batch-fixture'),
  )
  const skills = ['code-review', 'research'].map((name, index) => ({
    id: index + 1,
    skillName: name,
    description: '示例 Skill',
    status: 'ENABLED',
    versionCount: 1,
    versions: [
      { id: index + 10, version: '1.0', status: 'ACTIVE', fileSize: 123, sha256: 'a'.repeat(64) },
    ],
  }))
  let files = 0
  let preview: SkillImportPreview | null = null
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
        permissions: ['skill:manage'],
        mustChangePassword: false,
        activated: true,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/skills') data = { items: skills, total: skills.length, page: 1, size: 20 }
    if (path === '/skills/options' || path === '/skills/selected') data = skills
    if (path === '/skills/imports/files') {
      const skill = skills[files++]!
      data = {
        uploadId: `upload-${skill.id}`,
        filename: `${skill.skillName}.zip`,
        fileSize: 123,
        sha256: 'a'.repeat(64),
        skillName: skill.skillName,
        description: '',
        matchedSkillId: skill.id,
        expiresAt: '2099-01-01',
      }
    }
    if (path === '/skills/imports/preview') {
      const input = route.request().postDataJSON() as { items: SkillImportInput[] }
      preview = {
        previewId: 'preview',
        expiresAt: '2099-01-01',
        affectedExpertCount: 1,
        items: input.items.map((item) => ({
          ...item,
          currentVersion: '1.0',
          status: 'READY',
          message: '校验通过',
          fingerprint: 'snapshot',
          experts: [
            {
              expertId: 7,
              expertName: '研发专家',
              expertStatus: 'PUBLISHED',
              source: 'VERSION',
              expertVersionId: 20,
              expertVersionNo: 3,
              skillVersionId: 10,
            },
          ],
        })),
      }
      data = preview
    }
    if (path === '/skills/imports/commit') {
      commits++
      data = {
        submissionId: route.request().postDataJSON().submissionId,
        complete: true,
        successCount: 2,
        failedCount: 0,
        skippedCount: 0,
        items: preview!.items.map((item) => ({
          itemId: item.itemId,
          status: 'SUCCESS',
          message: '上传成功，新版本已启用',
          skillId: item.skillId,
          versionId: 30,
        })),
      }
    }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/skills')
  await page.getByRole('button', { name: '批量更新', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const chooserPromise = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: '选择多个 Skill ZIP', exact: true }).click()
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles(
    skills.map((skill) => ({
      name: `${skill.skillName}.zip`,
      mimeType: 'application/zip',
      buffer: Buffer.from('fixture'),
    })),
  )
  await expect(dialog.getByText('上传完成，请配置并预览')).toHaveCount(2)
  await expect(dialog.getByText('已添加 2 个文件', { exact: true })).toBeVisible()
  const replacementPromise = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: '替换 code-review.zip', exact: true }).click()
  const replacement = await replacementPromise
  expect(replacement.isMultiple()).toBe(false)
  await replacement.setFiles([])
  await expect(dialog.getByText('已添加 2 个文件', { exact: true })).toBeVisible()
  await expect(dialog).not.toContainText('未填写时保留原标签；应用空标签将清空全部行的标签。')
  const versionBox = await dialog.getByPlaceholder('例如 1.1.0').boundingBox()
  const tagBox = await dialog.getByRole('textbox', { name: '统一标签', exact: true }).boundingBox()
  expect(Math.abs(versionBox!.y - tagBox!.y)).toBeLessThan(2)
  await dialog.getByPlaceholder('例如 1.1.0').fill('2.0')
  await dialog.getByRole('button', { name: '将版本号应用到全部' }).click()
  await dialog.getByRole('textbox', { name: '统一标签', exact: true }).fill('研发推荐')
  await dialog.getByRole('button', { name: '将标签应用到全部' }).click()
  await expect(
    dialog.getByRole('textbox', { name: 'code-review.zip 标签', exact: true }),
  ).toHaveValue('研发推荐')
  await expect(dialog.getByRole('textbox', { name: 'research.zip 标签', exact: true })).toHaveValue(
    '研发推荐',
  )
  await dialog.getByRole('button', { name: '校验预览' }).click()
  await expect(dialog).toContainText('受影响专家共 1 个')
  await dialog.getByText('查看 code-review 的受影响专家').click()
  await expect(dialog).toContainText('专家版本 v3')
  const submit = dialog.getByRole('button', { name: '批量更新并启用' })
  await expect(submit).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('skill-batch-preview.png'), fullPage: true })
  await page.setViewportSize({ width: 900, height: 850 })
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await dialog.getByLabel('已核对受影响专家，确认停用对应旧版本').check()
  await submit.click()
  await expect(dialog).toContainText('成功 2 项，失败 0 项，跳过 0 项')
  expect(commits).toBe(1)
  expect(errors).toEqual([])
})
