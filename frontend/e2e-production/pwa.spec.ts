import { expect, test } from '@playwright/test'

test('HTTPS安全Cookie、生产静态页面与离线恢复', async ({ page, context }) => {
  await page.goto('/')
  await page.getByLabel('账号', { exact: true }).fill('verify-child')
  await page.getByLabel('密码', { exact: true }).fill('release-test-only-123')
  await page.getByRole('button', { name: '开始今天的小冒险' }).click()
  await expect(page.locator('.hero h1')).toContainText('恢复验收')
  const cookie = (await context.cookies()).find((c) => c.name === '__Host-kids_child_session')
  expect(cookie?.secure).toBe(true)
  expect(cookie?.httpOnly).toBe(true)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const cached = await page.evaluate(async () => {
    const stores = await caches.keys()
    const requests = await Promise.all(
      stores.map(async (key) => (await (await caches.open(key)).keys()).map((r) => r.url)),
    )
    return requests.flat()
  })
  expect(cached.some((url) => url.includes('/api/'))).toBe(false)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '🌱 小树休息一下' })).toBeVisible()
  await context.setOffline(false)
  await page.getByRole('button', { name: '重新连接' }).click()
  await expect(page.locator('.hero h1')).toContainText('恢复验收')
})
