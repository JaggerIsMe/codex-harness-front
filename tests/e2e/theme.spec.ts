import { expect, test } from '@playwright/test'

test('theme switches with the keyboard and remains selected after reload', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('.login-page')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  const darkToggle = page.getByRole('button', { name: '切换到深色主题' })
  await darkToggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass('dark')
  await expect(page.locator('.login-page')).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(236, 236, 236)')
  await expect(page.locator('.login-submit')).toHaveCSS('color', 'rgb(23, 23, 23)')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  await page.reload()
  await expect(page.getByRole('button', { name: '切换到浅色主题' })).toBeVisible()
  await expect(page.locator('.login-page')).toHaveCSS('background-color', 'rgb(23, 23, 23)')
  await page.getByRole('button', { name: '切换到浅色主题' }).click()
  await expect(page.locator('html')).not.toHaveClass('dark')
  await expect(page.locator('.login-page')).toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await page.reload()
  await expect(page.getByRole('button', { name: '切换到深色主题' })).toBeVisible()
})
