import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'

test('creating an expert shows only confirmed bindings and saves selected version IDs', async ({
  page,
}) => {
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('expert-bindings'),
  )
  let saved: unknown
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        displayName: '管理员',
        email: 'expert@example.test',
        roles: ['SYS_ADMIN'],
        permissions: ['expert:manage', 'skill:manage', 'mcp:manage'],
        activated: true,
        mustChangePassword: false,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/skills/options')
      data = ['review', 'research'].map((name, index) => ({
        id: index + 1,
        skillName: name,
        tag: index === 0 ? '研发推荐' : '其他',
        status: 'ENABLED',
        versions: [{ id: index + 11, status: 'ACTIVE', version: '1.0' }],
      }))
    if (path === '/admin/mcp-configurations/selectable-versions')
      data = [
        {
          configurationId: 1,
          versionId: 21,
          versionNo: 1,
          name: 'GitHub',
          serverCode: 'github',
          transportType: 'STDIO',
        },
      ]
    if (path === '/admin/experts' && route.request().method() === 'POST') {
      saved = route.request().postDataJSON()
      data = { id: 1 }
    }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/experts')
  await page.getByRole('button', { name: '创建专家', exact: true }).click()
  const form = page.getByRole('dialog', { name: '创建专家', exact: true })
  await expect(form).toContainText('尚未绑定 Skills')
  await expect(form).not.toContainText('research')
  await form.getByLabel('名称', { exact: true }).fill('研发专家')
  await form.getByLabel('系统提示词', { exact: true }).fill('Review code')
  await form.getByRole('button', { name: '添加 Skills', exact: true }).click()
  const skills = page.getByRole('dialog', { name: '添加 Skills', exact: true })
  await skills.getByLabel('搜索 Skills', { exact: true }).fill('研发推荐')
  await skills.getByLabel('搜索 Skills', { exact: true }).press('Enter')
  await expect(skills.getByRole('checkbox')).toHaveCount(1)
  await skills.getByRole('checkbox').check()
  await skills.getByRole('button', { name: '确认添加' }).click()
  await expect(form.getByRole('list', { name: '已绑定的 Skills' })).toContainText('review · 1.0')
  await expect(form).not.toContainText('research')
  await form.getByRole('button', { name: '添加 MCP', exact: true }).click()
  const mcp = page.getByRole('dialog', { name: '添加 MCP', exact: true })
  await mcp.getByRole('checkbox').check()
  await mcp.getByRole('button', { name: '取消', exact: true }).click()
  await expect(form).toContainText('尚未绑定 MCP')
  await form.getByRole('button', { name: '添加 MCP', exact: true }).click()
  await mcp.getByRole('checkbox').check()
  await mcp.getByRole('button', { name: '确认添加' }).click()
  await expect(form.getByRole('list', { name: '已绑定的 MCP' })).toContainText('GitHub')
  await form.getByRole('button', { name: '保存草稿' }).click()
  await expect(form).not.toBeVisible()
  expect(saved).toMatchObject({ name: '研发专家', skillVersionIds: [11], mcpBindings: [21] })
})
