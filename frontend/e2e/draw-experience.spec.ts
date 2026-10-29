import { expect, test, type Page } from '@playwright/test'

async function mockDraw(
  page: Page,
  {
    failOnce = false,
    slow = false,
    imageError = false,
    keepClaimedReward = false,
    allClaimed = false,
    open = true,
  } = {},
) {
  const user = {
    id: 'draw-child',
    username: 'draw-child',
    display_name: '朵朵',
    avatar_key: 'fox',
    role: 'child',
    status: 'active',
  }
  const options = ['森林小鹿', '月亮小兔', '星光小熊'].map((name, i) => ({
    id: `option-${i}`,
    position: i,
    card: {
      id: `card-${i}`,
      name,
      description: '每一棵大树，都是从一颗小小的种子开始长大的。',
      set_id: 'forest',
      set_name: '森林朋友',
      category_id: 'nature',
      category_name: '自然',
      image_asset_id: `image-${i}`,
      image_url: `/media/draw-test-${i}.svg`,
      rarity: i === 1 ? 'epic' : 'common',
      draw_weight: 10,
      sort_order: i,
      status: 'active',
    },
  }))
  const selected: string[] = []
  let claimed: string | null = allClaimed ? 'option-0' : null
  await page.route('**/media/draw-test-*.svg', (route) =>
    imageError
      ? route.abort()
      : route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700" viewBox="0 0 500 700"><rect width="500" height="700" rx="20" fill="#f2e9d8"/><circle cx="380" cy="140" r="65" fill="#ecc37a"/><path d="M0 510Q180 240 500 440V700H0" fill="#98bca6"/><path d="M0 590Q260 400 500 510V700H0" fill="#6e9b88"/><circle cx="250" cy="370" r="85" fill="#d8af88"/><path d="M200 310Q140 170 190 230L245 300M275 300Q360 160 320 270L300 320" fill="#d8af88"/><circle cx="225" cy="355" r="6" fill="#544941"/><circle cx="280" cy="355" r="6" fill="#544941"/><path d="M242 382Q252 395 265 382" fill="none" stroke="#544941" stroke-width="5" stroke-linecap="round"/></svg>',
        }),
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json
    if (path.endsWith('/auth/accounts')) json = { accounts: [user] }
    else if (path.endsWith('/auth/csrf')) json = { csrf_token: 'draw-test-token' }
    else if (path.endsWith('/me'))
      json = { user, server_today: '2026-10-29', timezone: 'Asia/Shanghai' }
    else if (path.endsWith('/me/rewards'))
      json = {
        items:
          claimed && !keepClaimedReward
            ? []
            : [{ id: 'reward', business_date: '2026-10-29', state: 'available' }],
        total: claimed && !keepClaimedReward ? 0 : 1,
        page: 1,
        page_size: 20,
      }
    else if (path.endsWith('/draw-session'))
      json = {
        id: 'session',
        reward_id: 'reward',
        state: claimed ? 'claimed' : 'open',
        options,
        selected_option_id: claimed,
      }
    else if (path.endsWith('/selection')) {
      selected.push(route.request().postDataJSON().option_id)
      if (slow) await new Promise((resolve) => setTimeout(resolve, 1500))
      if (failOnce && selected.length === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { code: 'TRY_AGAIN', message: '网络开了个小差，请重试' } },
        })
        return
      }
      claimed = selected.at(-1)!
      json = {
        id: 'acquisition',
        card: options.find((option) => option.id === claimed)!.card,
        acquired_at: '2026-10-29T12:00:00Z',
      }
    } else if (path.endsWith('/me/collection/sets') || path.endsWith('/catalog/categories'))
      json = { items: [] }
    else if (path.endsWith('/me/collection'))
      json = {
        items: options.map((option) => ({
          ...option.card,
          quantity: option.id === claimed ? 1 : 0,
        })),
        total: 3,
        page: 1,
        page_size: 20,
      }
    else throw new Error(`Unexpected draw-test request: ${path}`)
    await route.fulfill({ json })
  })
  await page.goto('/rewards')
  if (open) {
    await page.getByRole('button', { name: '挑选卡片', exact: true }).click()
    await expect(page.getByRole('button', { name: /选择第.张神秘卡片/ })).toHaveCount(3)
  }
  return { selected }
}

for (const [index, viewport] of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1194, height: 834 },
  { width: 844, height: 390 },
].entries()) {
  test(`${viewport.width}px 三张背面悬浮、选中翻转居中、自动飞入图鉴`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const { selected } = await mockDraw(page)
    const slot = index % 3
    await expect(page.locator('.draw-overlay')).toHaveCSS('opacity', '1')
    await expect(page.locator('.draw-heading')).toHaveCSS('opacity', '1')
    await expect(page.getByRole('dialog').getByRole('img')).toHaveCount(0)
    for (const pick of await page.locator('.draw-pick').all()) {
      const bounds = (await pick.boundingBox())!
      expect(bounds.x).toBeGreaterThan(0)
      expect(bounds.x + bounds.width).toBeLessThan(viewport.width)
    }
    await page.screenshot({ path: `../.cache/draw-preview/backs-${viewport.width}.png` })
    await page.getByRole('button', { name: `选择第${slot + 1}张神秘卡片` }).click()
    await expect(page.locator('.draw-pick.is-dismissed')).toHaveCount(2)
    await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
    await expect(page.locator('.draw-pick.is-picked')).toHaveCSS('opacity', '1')
    await expect(page.locator('.draw-card-turn.is-front')).toHaveCSS(
      'transform',
      /matrix3d\(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1\)/,
    )
    await expect(page.locator('.draw-card-back').first()).toHaveCSS('backface-visibility', 'hidden')
    const bounds = (await page.locator('.draw-pick.is-picked').boundingBox())!
    const stage = (await page.locator('.draw-stage').boundingBox())!
    expect(Math.abs(bounds.x + bounds.width / 2 - stage.x - stage.width / 2)).toBeLessThan(2)
    const footer = (await page.locator('.draw-footer').boundingBox())!
    const nav = (await page.locator('.mobile-nav').boundingBox())!
    if (viewport.height < 520) expect(bounds.x + bounds.width).toBeLessThan(footer.x)
    else expect(bounds.y + bounds.height).toBeLessThan(footer.y)
    expect(footer.y + footer.height).toBeLessThanOrEqual(nav.y)
    expect(selected).toEqual([`option-${slot}`])
    await expect(page.locator('.draw-discovery')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: `../.cache/draw-preview/reveal-${viewport.width}.png` })
    await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'flying', {
      timeout: 7000,
    })
    const flight = await page.locator('.draw-flying-card').evaluate((element) => {
      const style = (element as HTMLElement).style
      return {
        x:
          Number.parseFloat(style.left) +
          Number.parseFloat(style.width) / 2 +
          Number.parseFloat(style.getPropertyValue('--fly-x')),
        y:
          Number.parseFloat(style.top) +
          Number.parseFloat(style.height) / 2 +
          Number.parseFloat(style.getPropertyValue('--fly-y')),
      }
    })
    const target = (await page.locator('.mobile-nav a[href="/collection"]').boundingBox())!
    expect(flight.x).toBeCloseTo(target.x + target.width / 2, 0)
    expect(flight.y).toBeCloseTo(target.y + target.height / 2, 0)
    await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'landing')
    await expect(page.getByText('已收入图鉴', { exact: true })).toHaveCount(2)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.toast')).toContainText('已收入图鉴')
    await page.getByRole('link', { name: '我的图鉴', exact: true }).click()
    await expect(page.locator('.collection-card.collected')).toHaveCount(1)
    await expect(page.locator('.collection-card.collected h3')).toHaveText(
      ['森林小鹿', '月亮小兔', '星光小熊'][slot],
    )
    await page.reload()
    await expect(page.locator('.collection-card.collected')).toHaveCount(1)
    expect(selected).toEqual([`option-${slot}`])
    expect(errors).toEqual([])
  })
}

test('领取失败保留选中卡片、慢响应等待成功、重试不更换选择', async ({ page }) => {
  const { selected } = await mockDraw(page, { failOnce: true, slow: true })
  await page.getByRole('button', { name: '选择第2张神秘卡片' }).click()
  await page.locator('.draw-pick').nth(2).dispatchEvent('click')
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'selecting')
  await expect(page.locator('.draw-card-turn.is-front')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('网络开了个小差')
  expect(selected).toEqual(['option-1'])
  await page.getByRole('button', { name: '再试一次，揭开这张卡' }).click()
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
  await expect(page.locator('.draw-discovery h2')).toHaveText('月亮小兔')
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(selected).toEqual(['option-1', 'option-1'])
})

test('键盘选择、减少动态效果、关闭未领取奖励后可以继续', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { selected } = await mockDraw(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(selected).toEqual([])
  await page.getByRole('button', { name: '挑选卡片', exact: true }).click()
  await page.getByRole('button', { name: '选择第3张神秘卡片' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
  await expect(page.locator('.draw-card-float').first()).toHaveCSS('animation-name', 'none')
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(selected).toEqual(['option-2'])
})

test('图片失败仍可收藏，不会把卡片困在动画中', async ({ page }) => {
  await mockDraw(page, { imageError: true })
  await page.getByRole('button', { name: '选择第1张神秘卡片' }).click()
  await expect(page.getByRole('button', { name: '图片迷路了，点这里重新加载' })).toBeVisible()
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.toast')).toContainText('已收入图鉴')
})

test('已领取会话重新打开时直接恢复正面，不会再次领取', async ({ page }) => {
  const { selected } = await mockDraw(page, { keepClaimedReward: true })
  await page.getByRole('button', { name: '选择第2张神秘卡片' }).click()
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '挑选卡片', exact: true }).click()
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'restored')
  await expect(page.locator('.draw-discovery h2')).toHaveText('月亮小兔')
  await page.getByRole('button', { name: '完成', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(selected).toEqual(['option-1'])
})

test('奖励已领完仍可反复预览动效，整个过程不写入奖励或收藏', async ({ page }) => {
  const writes: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/') && request.method() !== 'GET') writes.push(request.url())
  })
  const { selected } = await mockDraw(page, { allClaimed: true, open: false })
  await expect(page.getByRole('button', { name: '挑选卡片', exact: true })).toHaveCount(0)
  for (const slot of [1, 3]) {
    await page.getByRole('button', { name: '体验抽卡动效', exact: true }).click()
    await expect(page.getByText('动效预览 · 不消耗奖励')).toBeVisible()
    await page.getByRole('button', { name: `选择第${slot}张神秘卡片` }).click()
    await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
    if (slot === 3) await page.getByRole('button', { name: '收入我的图鉴' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 })
    await expect(page.locator('.toast')).toContainText('真实收藏没有变化')
  }
  await page.getByRole('link', { name: '我的图鉴', exact: true }).click()
  await expect(page.locator('.collection-card.collected')).toHaveCount(1)
  await expect(page.locator('.collection-card.collected h3')).toHaveText('森林小鹿')
  expect(selected).toEqual([])
  expect(writes).toEqual([])
})

test('手势解锁音效，静音立即生效并在再次打开后保留', async ({ page }) => {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = []
    const starts: string[] = []
    Object.assign(window, { drawAudioProbe: { contexts, starts } })
    const NativeAudio = window.AudioContext
    window.AudioContext = class extends NativeAudio {
      constructor(options?: AudioContextOptions) {
        super(options)
        contexts.push(this)
      }
      createOscillator() {
        const node = super.createOscillator()
        const start = node.start.bind(node)
        node.start = (when?: number) => {
          starts.push('tone')
          start(when)
        }
        return node
      }
      createBufferSource() {
        const node = super.createBufferSource()
        const start = node.start.bind(node)
        node.start = (when?: number) => {
          starts.push('swish')
          start(when)
        }
        return node
      }
    }
  })
  await mockDraw(page, { keepClaimedReward: true })
  const probe = () =>
    page.evaluate(() => {
      const data = (
        window as unknown as { drawAudioProbe: { contexts: AudioContext[]; starts: string[] } }
      ).drawAudioProbe
      return { states: data.contexts.map((context) => context.state), starts: data.starts }
    })
  expect((await probe()).states).toEqual([])
  await page.getByRole('button', { name: '选择第1张神秘卡片' }).click()
  await expect.poll(async () => (await probe()).states).toContain('running')
  await expect.poll(async () => (await probe()).starts).toContain('swish')
  await page.getByRole('button', { name: '关闭抽卡音效' }).click()
  const muted = (await probe()).starts.length
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await probe()).starts).toHaveLength(muted)
  await expect.poll(async () => (await probe()).states).toEqual(['closed'])
  await page.getByRole('button', { name: '体验抽卡动效' }).click()
  await expect(page.getByRole('button', { name: '开启抽卡音效' })).toBeVisible()
  await page.getByRole('button', { name: '选择第2张神秘卡片' }).click()
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
  expect((await probe()).starts).toHaveLength(muted)
  await page.getByRole('button', { name: '开启抽卡音效' }).click()
  await expect.poll(async () => (await probe()).states).toContain('running')
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await probe()).starts.length).toBeGreaterThan(muted)
})

test('浏览器不支持声音时仍能完成抽卡', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'AudioContext', { value: undefined }),
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockDraw(page)
  await page.getByRole('button', { name: '选择第2张神秘卡片' }).click()
  await page.getByRole('button', { name: '收入我的图鉴' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('卡片从屏幕上方入场，稳定落定后才能选择', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockDraw(page)
  const entrance = page.locator('.draw-card-enter')
  for (const progress of [0, 0.22, 0.45, 0.75, 0.95]) {
    await entrance.evaluateAll((elements, progress) => {
      for (const element of elements) {
        const animation = element.getAnimations()[0]
        animation.pause()
        const timing = animation.effect!.getTiming()
        animation.currentTime = Number(timing.delay) + Number(timing.duration) * progress
      }
    }, progress)
    if (progress === 0) {
      for (const card of await entrance.all()) {
        const bounds = (await card.boundingBox())!
        expect(bounds.y + bounds.height).toBeLessThan(0)
      }
    }
    await expect(page.getByRole('button', { name: '选择第1张神秘卡片' })).toBeDisabled()
    await page.screenshot({ path: `../.cache/draw-preview/entry-${progress}.png` })
  }
  await entrance.evaluateAll((elements) =>
    elements.forEach((element) => element.getAnimations().forEach((animation) => animation.play())),
  )
  await expect(page.getByRole('button', { name: '选择第1张神秘卡片' })).toBeEnabled()
  await page.getByRole('button', { name: '选择第1张神秘卡片' }).click()
  await expect(page.locator('.draw-experience')).toHaveAttribute('data-phase', 'revealing')
})
