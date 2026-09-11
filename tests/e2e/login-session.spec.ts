import { sessionCredentials } from '../support/auth'
import { expect, test, type BrowserContext, type WebSocketRoute } from '@playwright/test'

const envelope = (data: unknown) => ({ status: 'success', code: 200, info: '', data })
const user = {
  id: 1,
  email: 'member@example.com',
  displayName: '原登录用户',
  activated: true,
  mustChangePassword: false,
  roles: [],
  permissions: ['workspace:use'],
}
async function sessions(context: BrowserContext, initial = sessionCredentials('first-token')) {
  const state = {
    unavailable: false,
    logoutCount: 0,
    refreshCount: 0,
    refreshGate: null as Promise<void> | null,
    activityCount: 0,
    credentials: initial,
    sockets: [] as WebSocketRoute[],
  }
  await context.addInitScript((value) => {
    if (!localStorage.getItem('harness_auth_session'))
      localStorage.setItem('harness_auth_session', JSON.stringify(value))
  }, initial)
  await context.routeWebSocket('**/ws/client?ticket=*', (socket) => {
    state.sockets.push(socket)
  })
  await context.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const token = route.request().headers().authorization
    if (path.endsWith('/auth/refresh')) {
      state.refreshCount += 1
      await state.refreshGate
      const generation = state.credentials.credentialGeneration + 1
      state.credentials = {
        ...state.credentials,
        accessToken: `renewed-${generation}`,
        credentialGeneration: generation,
        expiresAt: Math.floor(Date.now() / 1000) + 7200,
      }
      await route.fulfill({ json: envelope(state.credentials) })
    } else if (path.endsWith('/auth/activity')) {
      state.activityCount += 1
      expect(route.request().headers()['x-harness-activity']).toBe('1')
      await route.fulfill({
        json: envelope({
          idleExpiresAt: Math.floor(Date.now() / 1000) + 7200,
          sessionExpiresAt: state.credentials.sessionExpiresAt,
        }),
      })
    } else if (path.endsWith('/auth/profile')) {
      if (state.unavailable) {
        await route.fulfill({
          status: 503,
          json: { status: 'error', code: 50322, info: '登录状态暂时不可用', data: null },
        })
        return
      }
      await route.fulfill({
        json: envelope(
          token === 'Bearer second-token' ? { ...user, displayName: '更新后用户' } : user,
        ),
      })
    } else if (path.endsWith('/auth/login')) {
      await route.fulfill({
        json: envelope({
          ...sessionCredentials('second-token'),
          tokenType: 'Bearer',
          expiresInSeconds: 7200,
          user: { ...user, displayName: '更新后用户' },
        }),
      })
    } else if (path.endsWith('/auth/logout')) {
      state.logoutCount += 1
      await route.fulfill({ json: envelope(null) })
    } else if (path.endsWith('/auth/socket-ticket')) {
      await route.fulfill({
        json: envelope({ ticket: `ticket-${state.sockets.length}`, expiresInSeconds: 30 }),
      })
    } else {
      await route.fulfill({
        json: envelope({
          items: [],
          total: 0,
          page: 1,
          size: 20,
          hasMore: false,
          nextCursor: null,
        }),
      })
    }
  })
  return state
}

test('browser tabs share logout and the next login, resetting protected page state', async ({
  context,
  page,
}) => {
  const state = await sessions(context)
  const sibling = await context.newPage()
  await page.goto('/account/password')
  await sibling.goto('/account/password')
  await expect(page.getByText('原登录用户', { exact: true })).toBeVisible()
  await expect(sibling.getByText('原登录用户', { exact: true })).toBeVisible()
  await expect.poll(() => state.sockets.length).toBe(2)
  await page.getByLabel('当前密码', { exact: true }).fill('discard-this-value')
  await sibling.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await expect(sibling).toHaveURL(/\/login/)
  expect(state.logoutCount).toBe(1)
  await sibling.getByPlaceholder('请输入邮箱', { exact: true }).fill(user.email)
  await sibling.getByPlaceholder('请输入密码', { exact: true }).fill('test-password')
  await sibling.getByPlaceholder('请输入密码', { exact: true }).press('Enter')
  await expect(page.getByText('更新后用户', { exact: true })).toBeVisible()
  await expect(sibling.getByText('更新后用户', { exact: true })).toBeVisible()
  await expect.poll(() => state.sockets.length).toBe(4)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('harness_auth_session') || 'null')?.accessToken ?? null,
    ),
  ).toBe('second-token')
  await page.getByRole('link', { name: '修改密码', exact: true }).click()
  await expect(page.getByLabel('当前密码', { exact: true })).toHaveValue('')
})

test('a replaced socket ends the old session and retains its login explanation', async ({
  context,
  page,
}) => {
  const state = await sessions(context)
  await page.goto('/account/password')
  await expect.poll(() => state.sockets.length).toBe(1)
  await state.sockets[0]!.close({ code: 4001, reason: 'SESSION_REPLACED' })
  await expect(page).toHaveURL(/reason=session-replaced/)
  await expect(page.getByRole('status')).toContainText('账号已在其他位置登录')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('harness_auth_session') || 'null')?.accessToken ?? null,
    ),
  ).toBeNull()
  expect(state.logoutCount).toBe(0)
})

test('temporary authentication unavailability keeps the login and offers retry', async ({
  context,
  page,
}) => {
  const state = await sessions(context)
  state.unavailable = true
  await page.goto('/account/password')
  await expect(page.getByRole('status')).toContainText('暂时无法验证登录')
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('harness_auth_session') || 'null')?.accessToken ?? null,
    ),
  ).toBe('first-token')
  state.unavailable = false
  await page.getByRole('button', { name: '重新验证' }).click()
  await expect(page.getByText('原登录用户', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/account\/password$/)
})

test('two active tabs share one renewal and keep their current forms and realtime connections', async ({
  context,
  page,
}) => {
  const state = await sessions(context)
  const sibling = await context.newPage()
  await page.goto('/account/password')
  await sibling.goto('/account/password')
  await expect.poll(() => state.sockets.length).toBe(2)
  await page.getByLabel('当前密码', { exact: true }).fill('keep-first-draft')
  await sibling.getByLabel('当前密码', { exact: true }).fill('keep-second-draft')
  await page.getByLabel('当前密码', { exact: true }).click()
  await sibling.getByLabel('当前密码', { exact: true }).click()
  await expect.poll(() => state.activityCount).toBeGreaterThan(0)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const locks = await navigator.locks.query()
        return (locks.held?.length ?? 0) + (locks.pending?.length ?? 0)
      }),
    )
    .toBe(0)
  let releaseRefresh!: () => void
  state.refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve
  })
  await page.evaluate(() =>
    navigator.locks.request('harness-auth-session', () => {
      const value = JSON.parse(localStorage.getItem('harness_auth_session')!)
      value.expiresAt = Math.floor(Date.now() / 1000) + 300
      localStorage.setItem('harness_auth_session', JSON.stringify(value))
      window.dispatchEvent(new Event('harness:credentials-changed'))
    }),
  )
  await expect.poll(() => state.refreshCount).toBe(1)
  await sibling.getByLabel('当前密码', { exact: true }).click()
  // The first response remains blocked while the other tab waits on the same lock.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.length ?? 0))
    .toBeGreaterThan(0)
  expect(state.refreshCount).toBe(1)
  releaseRefresh()
  await expect.poll(() => state.sockets.length).toBe(4)
  await expect(page.getByLabel('当前密码', { exact: true })).toHaveValue('keep-first-draft')
  await expect(sibling.getByLabel('当前密码', { exact: true })).toHaveValue('keep-second-draft')
  await expect(page).toHaveURL(/\/account\/password$/)
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('harness_auth_session')!).credentialGeneration,
    ),
  ).toBe(2)
  await expect
    .poll(() =>
      sibling.evaluate(
        () => JSON.parse(localStorage.getItem('harness_auth_session')!).credentialGeneration,
      ),
    )
    .toBe(2)
  expect(state.refreshCount).toBe(1)
})

test('shows a safe capability requirement when Web Locks are unavailable', async ({
  context,
  page,
}) => {
  const state = await sessions(context)
  await context.addInitScript(() =>
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }),
  )
  await page.goto('/account/password')
  await expect(page.getByRole('alert')).toContainText('HTTPS 或 localhost')
  await page.getByLabel('当前密码', { exact: true }).click()
  expect(state.refreshCount).toBe(0)
  expect(state.activityCount).toBe(0)
})

test('requires login after upgrading a legacy token without refresh metadata', async ({ page }) => {
  let requests = 0
  await page.addInitScript(() => localStorage.setItem('harness_access_token', 'legacy-jwt'))
  await page.route('**/api/v1/**', async (route) => {
    requests += 1
    await route.abort()
  })
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login/)
  expect(await page.evaluate(() => localStorage.getItem('harness_access_token'))).toBeNull()
  expect(requests).toBe(0)
})
