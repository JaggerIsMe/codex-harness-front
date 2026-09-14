import { expect, test } from '@playwright/test'
import { sessionCredentials } from '../support/auth'

test('managed usage filters submit on Enter and budget dialog preserves zero versus unlimited', async ({
  page,
}) => {
  await page.addInitScript(
    (value) => localStorage.setItem('harness_auth_session', JSON.stringify(value)),
    sessionCredentials('usage-fixture'),
  )
  const queries: URLSearchParams[] = []
  let saved: unknown
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace('/api/v1', '')
    let data: unknown = []
    if (path === '/auth/profile')
      data = {
        id: 1,
        email: 'admin@example.test',
        displayName: '管理员',
        roles: ['SYS_ADMIN'],
        permissions: ['system:user:manage', 'model:manage'],
        mustChangePassword: false,
        activated: true,
      }
    if (path === '/auth/socket-ticket') data = { ticket: 'fixture', expiresInSeconds: 30 }
    if (path === '/users')
      data = {
        items: [{ id: 5, displayName: '测试用户', email: 'user@example.test' }],
        total: 1,
        page: 1,
        size: 20,
      }
    if (path === '/usage/records') {
      queries.push(url.searchParams)
      data = {
        records: [
          {
            requestId: 'fixture-request',
            userId: 5,
            displayName: '测试用户',
            turnId: 2,
            projectId: 4,
            conversationId: 3,
            expertVersionId: 1,
            deviceId: 6,
            modelVersionId: 1,
            modelName: 'DeepSeek 测试模型',
            state: 'SETTLED',
            inputTokens: 1000,
            cachedTokens: 500,
            outputTokens: 100,
            cost: '0.0075',
            reservedAmount: '0.03',
            createdAt: '2026-09-14T00:00:00',
            outcome: 'REPORTED',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 30,
        daily: [
          {
            dimension: '2026-09-14',
            requests: 1,
            inputTokens: 1000,
            cachedTokens: 500,
            outputTokens: 100,
            pending: 0,
            cost: '0.0075',
          },
        ],
      }
    }
    if (path === '/usage/summary')
      data = {
        policy: { userId: 5, dailyBudget: '0', monthlyBudget: null, maxConcurrentTurns: 2 },
        buckets: [
          {
            period: '2026-09-14',
            budget: '0',
            spent: '0',
            reserved: '0',
            remaining: '0',
            alert: 'EXHAUSTED',
          },
        ],
      }
    if (path === '/usage/users/5/policy') {
      data = { userId: 5, dailyBudget: '0', monthlyBudget: null, maxConcurrentTurns: 2 }
      if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
    }
    await route.fulfill({ json: { status: 'success', code: 200, info: '', data } })
  })
  await page.routeWebSocket('**/ws/client?*', () => {})
  await page.goto('/usage')
  await expect(page.getByRole('heading', { name: '模型用量与额度' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'DeepSeek 测试模型', exact: false })).toBeVisible()
  await page.getByPlaceholder('全部 Turn', { exact: true }).fill('2')
  await page.getByPlaceholder('全部 Turn', { exact: true }).press('Enter')
  await expect.poll(() => queries.at(-1)?.get('turnId')).toBe('2')
  await page.getByRole('combobox', { name: '全部用户' }).selectOption('5')
  await expect(page.getByText('预算已耗尽，新的模型请求将被阻止。')).toBeVisible()
  await page.getByRole('button', { name: '设置用户预算' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('每日预算（元）')).toHaveValue('0')
  await expect(dialog.getByLabel('每月预算（元）')).toHaveValue('')
  await dialog.getByRole('button', { name: '保存预算' }).click()
  await expect
    .poll(() => saved)
    .toEqual({ dailyBudget: '0', monthlyBudget: null, maxConcurrentTurns: 2 })
  await expect(dialog).not.toBeVisible()
  await expect
    .poll(() => page.locator('.table-area').evaluate((e) => e.getBoundingClientRect().height))
    .toBeGreaterThan(70)
  await page.setViewportSize({ width: 1440, height: 1400 })
  await page.screenshot({ path: 'test-results/usage-management.png', fullPage: true })
})
