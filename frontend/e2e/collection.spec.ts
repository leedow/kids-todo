import { expect, test, type Page } from '@playwright/test'

async function mockCollection(page: Page, { empty = false, failure = { active: false } } = {}) {
  const requests: URL[] = []
  const user = {
    id: 'collection-child',
    username: 'collection-child',
    display_name: '朵朵',
    avatar_key: 'fox',
    role: 'child',
    status: 'active',
  }
  const sets = [
    { id: 'forest', name: '森林朋友', owned_unique: 12, total: 20 },
    { id: 'stars', name: '星空漫游', owned_unique: 12, total: 18 },
    { id: 'empty', name: '海底世界', owned_unique: 0, total: 10 },
  ]
  const cards = Array.from({ length: 25 }, (_, i) => ({
    id: `card-${i}`,
    name: `卡片${i + 1}`,
    description: '卡片介绍',
    set_id: i % 2 ? 'stars' : 'forest',
    set_name: i % 2 ? '星空漫游' : '森林朋友',
    category_id: 'nature',
    category_name: '自然',
    image_asset_id: `image-${i}`,
    image_url: `/media/collection-test-${i}.svg`,
    rarity: i % 3 ? 'common' : 'epic',
    quantity: i === 24 ? 0 : i === 0 ? 3 : 1,
  }))
  await page.route('**/media/collection-test-*.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" rx="20" fill="#efe6d5"/><circle cx="380" cy="140" r="65" fill="#ecc37a"/><path d="M0 510Q180 240 500 440V700H0" fill="#98bca6"/><path d="M0 590Q260 400 500 510V700H0" fill="#6e9b88"/><circle cx="250" cy="370" r="85" fill="#d8af88"/><circle cx="225" cy="355" r="6" fill="#544941"/><circle cx="280" cy="355" r="6" fill="#544941"/></svg>',
    }),
  )
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let json
    if (path.endsWith('/auth/accounts')) json = { accounts: [user] }
    else if (path.endsWith('/me'))
      json = { user, server_today: '2026-10-29', timezone: 'Asia/Shanghai' }
    else if (path.endsWith('/me/collection/sets')) json = { items: sets }
    else if (path.includes('/me/collection/cards/')) {
      json = { ...cards.find((card) => path.endsWith(`/${card.id}`)), acquisitions: [] }
    } else if (path.endsWith('/me/collection')) {
      requests.push(url)
      if (failure.active) {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'UNAVAILABLE', message: '暂时无法加载卡片' } },
        })
        return
      }
      const params = url.searchParams
      const items = empty
        ? []
        : cards.filter(
            (card) =>
              (params.get('owned_only') !== 'true' || card.quantity > 0) &&
              (!params.get('set_id') || card.set_id === params.get('set_id')) &&
              (!params.get('rarity') || card.rarity === params.get('rarity')),
          )
      const current = Number(params.get('page')) || 1
      json = {
        items: items.slice((current - 1) * 20, current * 20),
        total: items.length,
        page: current,
        page_size: 20,
      }
    } else throw new Error(`Unexpected collection request: ${path}`)
    await route.fulfill({ json })
  })
  return requests
}

test('仅显示获得的卡片正面，筛选与翻页始终保持已获得条件', async ({ page }) => {
  const requests = await mockCollection(page)
  await page.goto('/collection')
  await expect(page.locator('.collection-card')).toHaveCount(20)
  await expect(page.getByRole('heading', { name: '我的卡片图鉴' })).toHaveCount(0)
  await expect(page.getByLabel('分类', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '只看已收藏' })).toHaveCount(0)
  expect(await page.locator('.collection-card').allTextContents()).toEqual(Array(20).fill(''))
  await expect(page.locator('.collection-card > img')).toHaveCount(20)
  await expect(page.getByRole('button', { name: '查看卡片25', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.locator('.collection-card')).toHaveCount(4)
  await page.getByRole('button', { name: '星空漫游 12' }).click()
  await expect(page.locator('.collection-card')).toHaveCount(12)
  expect(requests.at(-1)!.searchParams.get('page')).toBe('1')
  await page.getByLabel('稀有度', { exact: true }).selectOption('epic')
  await expect(page.locator('.collection-card')).toHaveCount(4)
  await page.getByRole('button', { name: '海底世界 0' }).click()
  await expect(page.getByText('还没有符合条件的卡片')).toBeVisible()
  await page.getByRole('button', { name: '查看全部卡片' }).click()
  await expect(page.locator('.collection-card')).toHaveCount(20)
  await expect(page.getByLabel('稀有度', { exact: true })).toHaveValue('')
  await page.locator('.collection-card').first().click()
  await expect(page.locator('.card-viewer-card')).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.locator('.collection-card').first()).toBeFocused()
  expect(requests.every((url) => url.searchParams.get('owned_only') === 'true')).toBe(true)
  expect(requests.every((url) => !url.searchParams.has('category_id'))).toBe(true)
})

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1194, height: 834 },
  { width: 1440, height: 900 },
]) {
  test(`${viewport.width}px 布局紧凑、正面完整、宽屏卡集在左侧`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await mockCollection(page)
    await page.goto('/collection')
    const image = page.locator('.collection-card > img').first()
    await expect(image).toBeVisible()
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
    const first = (await image.boundingBox())!
    expect(first.y).toBeLessThan(viewport.width >= 1000 ? 140 : 195)
    const ratio = await image.evaluate((img: HTMLImageElement) => ({
      natural: img.naturalWidth / img.naturalHeight,
      rendered: img.width / img.height,
    }))
    expect(Math.abs(ratio.natural - ratio.rendered)).toBeLessThan(0.015)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const sidebar = (await page.locator('.collection-sidebar').boundingBox())!
    const gallery = (await page.locator('.collection-gallery').boundingBox())!
    if (viewport.width >= 1000) expect(sidebar.x + sidebar.width).toBeLessThan(gallery.x)
    else expect(sidebar.y + sidebar.height).toBeLessThanOrEqual(gallery.y)
    await page.screenshot({ path: `test-results/collection-${viewport.width}.png` })
  })
}

test('没有收藏时提示领取，加载失败可以重试', async ({ page }) => {
  const failure = { active: true }
  await mockCollection(page, { empty: true, failure })
  await page.goto('/collection')
  await expect(page.getByRole('alert')).toContainText('暂时无法加载卡片')
  failure.active = false
  await page.getByRole('button', { name: '再试一次' }).click()
  await expect(page.getByText('收藏小册等你来点亮')).toBeVisible()
  await expect(page.locator('.collection-card')).toHaveCount(0)
})
