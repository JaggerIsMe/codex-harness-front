import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'

test('Skill tags can be edited, searched and cleared without widening the list', async ({
  page,
}) => {
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('skill-tag'),
  )
  const skill = {
    id: 1,
    skillName: 'review',
    description: '',
    tag: '团队常用',
    status: 'ENABLED',
    versionCount: 0,
    versions: [],
    updatedAt: '2026-09-12',
  }
  let keyword = ''
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        displayName: '管理员',
        email: 'tag@example.test',
        roles: ['SYS_ADMIN'],
        permissions: ['skill:manage'],
        activated: true,
        mustChangePassword: false,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/skills') {
      keyword = url.searchParams.get('keyword') || ''
      const items = skill.tag.includes(keyword) || skill.skillName.includes(keyword) ? [skill] : []
      data = { items, total: items.length, page: 1, size: 20 }
    }
    if (path === '/skills/1' && route.request().method() === 'PUT') {
      Object.assign(skill, route.request().postDataJSON())
      data = skill
    }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/skills')
  await expect(page.getByRole('columnheader', { name: '标签', exact: true })).toBeVisible()
  await expect(page.getByLabel('标签：团队常用', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑 Skill', exact: true })
  const input = dialog.getByRole('textbox', { name: '标签', exact: true })
  await expect(input).toHaveValue('团队常用')
  const tag = '代码审查'.repeat(40)
  await input.fill(tag)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  const label = page.getByLabel(`标签：${tag}`, { exact: true })
  await expect(label).toHaveAttribute('title', tag)
  expect(await label.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByPlaceholder('搜索名称、描述或标签').fill('代码审查')
  await page.getByPlaceholder('搜索名称、描述或标签').press('Enter')
  await expect(label).toBeVisible()
  expect(keyword).toBe('代码审查')
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await input.fill('')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  expect(skill.tag).toBe('')
  await expect(label).toHaveCount(0)
})
