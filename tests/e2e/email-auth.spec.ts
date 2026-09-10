import { expect, test, type Page } from '@playwright/test'

const envelope = (data: unknown) => ({ status: 'success', code: 200, info: '成功', data })
async function withExistingLogin(page: Page, token = 'another-account') {
  await page.addInitScript((value) => localStorage.setItem('harness_access_token', value), token)
}

test('activation is public, removes the URL token, and keeps the current identity until explicit switching', async ({
  page,
}) => {
  await withExistingLogin(page)
  const requests: string[] = []
  let activated: unknown
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    expect(route.request().headers().authorization).toBeUndefined()
    if (path.endsWith('/activation/validate')) {
      expect(route.request().postDataJSON()).toEqual({ token: 'activation-link-secret' })
      await route.fulfill({
        json: envelope({
          maskedEmail: 'm***@example.com',
          displayName: 'member',
          expiresAt: '2030-01-01T00:00:00Z',
        }),
      })
    } else if (path.endsWith('/activate')) {
      activated = route.request().postDataJSON()
      await route.fulfill({ json: envelope(null) })
    } else throw new Error(`Unexpected request: ${path}`)
  })
  await page.goto('/activate?token=activation-link-secret')
  await expect(page.getByLabel('显示名称', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/activate$/)
  expect(activated).toBeUndefined()
  await page.getByLabel('显示名称', { exact: true }).fill('新成员')
  await page.getByLabel('设置密码', { exact: true }).fill('NewPassword123')
  await page.getByLabel('确认密码', { exact: true }).fill('NewPassword123')
  await page.getByRole('button', { name: '激活账号', exact: true }).click()
  await expect(page.getByRole('heading', { name: '账号激活成功' })).toBeVisible()
  expect(activated).toEqual({
    token: 'activation-link-secret',
    newPassword: 'NewPassword123',
    displayName: '新成员',
  })
  expect(requests).not.toContain('/api/v1/auth/profile')
  expect(await page.evaluate(() => localStorage.getItem('harness_access_token'))).toBe(
    'another-account',
  )
  await page.getByRole('button', { name: '切换账号登录' }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(await page.evaluate(() => localStorage.getItem('harness_access_token'))).toBeNull()
})

for (const [code, label] of [
  [41021, '激活链接已过期'],
  [40921, '此激活链接已使用'],
  [40021, '激活链接无效或已被更新'],
] as const) {
  test(`activation displays ${code} and offers anonymous resend`, async ({ page }) => {
    await withExistingLogin(page, 'expired-login')
    let resend: unknown
    await page.route('**/api/v1/**', async (route) => {
      expect(route.request().headers().authorization).toBeUndefined()
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/activation/validate'))
        await route.fulfill({ json: { status: 'error', code, info: '链接不可用', data: null } })
      else if (path.endsWith('/activation/resend')) {
        resend = route.request().postDataJSON()
        await route.fulfill({ json: envelope({ retryAfterSeconds: 60 }) })
      } else throw new Error(`Unexpected request: ${path}`)
    })
    await page.goto('/activate?token=old-link')
    await expect(page.getByRole('alert')).toContainText(label)
    await page.getByLabel('激活邮箱', { exact: true }).fill('Member@example.com')
    await page.getByRole('button', { name: '发送激活邮件', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('若邮箱符合条件')
    await expect(page.getByRole('button', { name: /秒后可重发/ })).toBeDisabled()
    expect(resend).toEqual({ email: 'member@example.com' })
    expect(await page.evaluate(() => localStorage.getItem('harness_access_token'))).toBe(
      'expired-login',
    )
  })
}

test('password recovery keeps leading zeros, shows invalid codes locally, and preserves another login', async ({
  page,
}) => {
  await withExistingLogin(page)
  const submissions: unknown[] = []
  await page.route('**/api/v1/**', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined()
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/password-reset/code'))
      await route.fulfill({ json: envelope({ retryAfterSeconds: 60 }) })
    else if (path.endsWith('/password-reset')) {
      submissions.push(route.request().postDataJSON())
      await route.fulfill({
        json:
          submissions.length === 1
            ? { status: 'error', code: 40021, info: '验证码错误或已失效', data: null }
            : envelope(null),
      })
    } else throw new Error(`Unexpected request: ${path}`)
  })
  await page.goto('/forgot-password')
  await page.getByLabel('邮箱', { exact: true }).fill('Member@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByRole('status')).toContainText('若邮箱符合条件')
  await expect(page.getByRole('button', { name: /秒后可重发/ })).toBeDisabled()
  await page.getByLabel('邮箱验证码', { exact: true }).fill('001234')
  await page.getByLabel('新密码', { exact: true }).fill('NewPassword123')
  await page.getByLabel('确认新密码', { exact: true }).fill('NewPassword123')
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('验证码错误或已失效')
  await expect(page).toHaveURL(/\/forgot-password$/)
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(page.getByRole('heading', { name: '密码重置成功' })).toBeVisible()
  expect(submissions).toEqual(
    Array(2).fill({ email: 'member@example.com', code: '001234', newPassword: 'NewPassword123' }),
  )
  expect(await page.evaluate(() => localStorage.getItem('harness_access_token'))).toBe(
    'another-account',
  )
})
