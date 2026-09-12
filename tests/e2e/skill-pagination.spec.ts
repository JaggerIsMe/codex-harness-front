import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'

test('Skill backend paging keeps cross-page batch selections and submits search on Enter', async ({
  page,
}) => {
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('skill-pagination'),
  )
  const skills = Array.from({ length: 45 }, (_, index) => ({
    id: index + 1,
    skillName: `skill-${index + 1}`,
    description: '分页测试',
    status: 'ENABLED',
    versionCount: 1,
    versions: [
      {
        id: index + 101,
        skillId: index + 1,
        version: '1.0',
        status: 'ACTIVE',
        fileSize: 123,
        sha256: 'a'.repeat(64),
      },
    ],
  }))
  let selectedIds: number[] = []
  const queries: URLSearchParams[] = []
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'paging@example.test',
        displayName: '管理员',
        roles: ['SYS_ADMIN'],
        permissions: ['skill:manage', 'expert:manage'],
        mustChangePassword: false,
        activated: true,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/skills') {
      queries.push(url.searchParams)
      const current = Number(url.searchParams.get('page')),
        size = Number(url.searchParams.get('size'))
      const keyword = url.searchParams.get('keyword') || ''
      const filtered = skills.filter((skill) => skill.skillName.includes(keyword))
      data = {
        items: filtered.slice((current - 1) * size, current * size),
        total: filtered.length,
        page: current,
        size,
      }
    }
    if (path === '/skills/selected') {
      selectedIds = url.searchParams.get('ids')!.split(',').map(Number)
      data = skills.filter((skill) => selectedIds.includes(skill.id))
    }
    if (path === '/skill-expert-assignments/batch/candidates')
      data = { items: [], total: 0, page: 1, size: 20 }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/skills')
  await expect(page.getByLabel('选择 skill-20', { exact: true })).toBeVisible()
  await expect(page.getByLabel('选择 skill-21', { exact: true })).toHaveCount(0)
  await page.getByLabel('选择 skill-1', { exact: true }).check()
  const paging = page.getByRole('navigation', { name: '分页', exact: true })
  await paging.getByRole('button', { name: '下一页' }).click()
  await page.getByLabel('选择 skill-21', { exact: true }).check()
  await expect(page.getByText('已跨页选择 2 个 Skill')).toBeVisible()
  await page.getByRole('button', { name: '批量分配（2）' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(selectedIds).toEqual([1, 21])
  const selectedSkills = dialog.getByRole('list', { name: '本次分配的 Skill' })
  await expect(selectedSkills.getByRole('listitem')).toHaveCount(2)
  await expect(selectedSkills).toContainText('skill-1')
  await expect(selectedSkills).toContainText('skill-21')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await page.getByPlaceholder('搜索名称、描述或标签').fill('skill-45')
  await page.getByPlaceholder('搜索名称、描述或标签').press('Enter')
  await expect(page.getByLabel('选择 skill-45', { exact: true })).toBeVisible()
  expect(queries.at(-1)!.get('page')).toBe('1')
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.getByLabel('选择 skill-1', { exact: true })).toBeChecked()
  await paging.getByLabel('每页条数').selectOption('50')
  await expect(page.getByLabel('选择 skill-45', { exact: true })).toBeVisible()
  expect(queries.at(-1)!.get('size')).toBe('50')
  await expect(paging.getByRole('button', { name: '下一页' })).toBeDisabled()
})
