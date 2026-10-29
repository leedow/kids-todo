import { expect, test, type Page } from '@playwright/test'

async function openCard(page: Page) {
  await page.goto('/')
  await page.getByLabel('账号', { exact: true }).fill('e2e-child-one')
  await page.getByLabel('密码', { exact: true }).fill('e2e-only-password-123')
  await page.getByRole('button', { name: '开始今天的小冒险' }).click()
  await page.getByRole('link', { name: '我的图鉴', exact: true }).click()
  await page.locator('.collection-card').first().click()
  await expect(page.locator('.card-viewer-card')).toBeVisible()
}

async function rotations(page: Page) {
  return page.locator('.card-viewer-card').evaluate((element) => {
    const transform = (element as HTMLElement).style.transform
    return {
      x: Number(transform.match(/rotateX\(([-\d.]+)deg\)/)?.[1]),
      y: Number(transform.match(/rotateY\(([-\d.]+)deg\)/)?.[1]),
      twist: Number(transform.match(/rotateZ\(([-\d.]+)deg\)/)?.[1]),
    }
  })
}

test('打开慢速旋转、暂停恢复、360度翻面与纯色背面', async ({ page }) => {
  await page.clock.install()
  await openCard(page)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const start = await rotations(page)
  await page.clock.runFor(1000)
  const after = await rotations(page)
  expect(after.y - start.y).toBeGreaterThan(10)
  expect(after.y - start.y).toBeLessThan(14)
  await page.getByRole('button', { name: '暂停旋转' }).click()
  const paused = await rotations(page)
  await page.clock.runFor(1000)
  expect(await rotations(page)).toEqual(paused)
  await page.getByRole('button', { name: '开始旋转' }).click()
  await page.clock.runFor(1000)
  expect((await rotations(page)).y).toBeGreaterThan(paused.y + 10)
  await page.getByRole('button', { name: '复位卡片' }).click()
  await page.getByRole('group', { name: '卡片互动区域' }).focus()
  for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowRight')
  expect((await rotations(page)).y).toBe(180)
  await expect(page.locator('.card-viewer-back')).toHaveCSS(
    'background-color',
    'rgb(114, 140, 125)',
  )
  await expect(page.locator('.card-viewer-front')).toHaveCSS('backface-visibility', 'hidden')
  await expect(page.locator('.card-viewer-back')).toHaveCSS('backface-visibility', 'hidden')
  await page.screenshot({ path: 'test-results/card-viewer-back.png' })
  for (let i = 0; i < 36; i++) await page.keyboard.press('ArrowRight')
  expect((await rotations(page)).y).toBe(360)
  await page.screenshot({ path: 'test-results/card-viewer-full-turn.png' })
  for (let i = 0; i < 72; i++) await page.keyboard.press('ArrowUp')
  expect((await rotations(page)).x).toBe(360)
})

test('拖动可跨越一圈，松手惯性衰减，按住或复位停止运动', async ({ page }) => {
  await page.clock.install()
  await openCard(page)
  await page.getByRole('button', { name: '复位卡片' }).click()
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  await page.mouse.move(500, 450)
  await page.mouse.down()
  await page.mouse.move(1250, 450, { steps: 20 })
  const released = await rotations(page)
  expect(released.y).toBeGreaterThan(360)
  await page.mouse.up()
  await page.clock.runFor(200)
  const early = await rotations(page)
  expect(early.y).toBeGreaterThan(released.y + 10)
  await page.clock.runFor(200)
  const later = await rotations(page)
  expect(later.y).toBeGreaterThan(early.y)
  expect(later.y - early.y).toBeLessThan(early.y - released.y)
  await page.clock.runFor(7000)
  const settled = await rotations(page)
  await page.clock.runFor(1000)
  expect(await rotations(page)).toEqual(settled)
  await expect(page.getByRole('button', { name: '开始旋转' })).toBeVisible()

  await page.getByRole('button', { name: '复位卡片' }).click()
  await page.getByRole('button', { name: '开始旋转' }).click()
  await page.mouse.move(720, 450)
  await page.mouse.down()
  const held = await rotations(page)
  await page.clock.runFor(500)
  expect(await rotations(page)).toEqual(held)
  await page.mouse.move(800, 450)
  await page.clock.runFor(200)
  const heldAfterDrag = await rotations(page)
  await page.mouse.up()
  await page.clock.runFor(500)
  expect(await rotations(page)).toEqual(heldAfterDrag)
  await page.getByRole('button', { name: '复位卡片' }).click()
  await page.clock.runFor(1000)
  expect(await rotations(page)).toEqual({ x: 0, y: 0, twist: 0 })
})

test('纯图片预览支持鼠标、键盘缩放旋转、复位与焦点恢复', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openCard(page)
  const dialog = page.getByRole('dialog')
  const card = page.locator('.card-viewer-card')
  const stage = page.getByRole('group', { name: '卡片互动区域' })
  await expect(dialog.getByRole('img')).toHaveCount(1)
  await expect(dialog).not.toContainText('已收藏')
  await expect(dialog).not.toContainText('初次相遇')
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 10 })
  await page.mouse.up()
  await expect(dialog).toBeVisible()
  await expect(card).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await page.mouse.wheel(0, -200)
  await expect(page.getByLabel('缩放比例')).not.toHaveText('100%')
  await page.getByRole('button', { name: '复位卡片' }).click()
  await expect(page.getByLabel('缩放比例')).toHaveText('100%')
  await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
  await stage.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('+')
  await expect(page.getByLabel('缩放比例')).toHaveText('115%')
  await page.screenshot({ path: 'test-results/card-viewer-desktop.png' })
  await page.keyboard.press('0')
  for (let i = 0; i < 7; i++)
    await page.getByRole('button', { name: '放大卡片' }).click({ force: true })
  await expect(page.getByLabel('缩放比例')).toHaveText('250%')
  await expect(page.getByRole('button', { name: '放大卡片' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.collection-card').first()).toBeFocused()
  await page.locator('.collection-card').first().click()
  await expect(page.getByLabel('缩放比例')).toHaveText('100%')
  await page.mouse.click(20, 180)
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})

for (const device of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1194, height: 834 },
]) {
  test(`${device.name} 单指倾斜、双指缩放旋转、手势切换及取消`, async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: device,
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await openCard(page)
    const card = page.locator('.card-viewer-card')
    const cdp = await context.newCDPSession(page)
    const x = device.width / 2
    const y = device.height / 2
    const touch = (type: string, points: { id: number; x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
    await touch('touchStart', [{ id: 1, x, y }])
    await touch('touchMove', [{ id: 1, x: x + 45, y: y + 40 }])
    await touch('touchEnd', [])
    await expect(card).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    await expect(page.getByRole('button', { name: '暂停旋转' })).toBeVisible()
    await touch('touchStart', [
      { id: 1, x: x - 40, y },
      { id: 2, x: x + 40, y },
    ])
    await touch('touchMove', [
      { id: 1, x: x - 65, y: y - 25 },
      { id: 2, x: x + 65, y: y + 25 },
    ])
    await expect(page.getByLabel('缩放比例')).not.toHaveText('100%')
    const transformed = await card.getAttribute('style')
    expect(transformed).not.toContain('rotateZ(0deg)')
    await touch('touchEnd', [])
    await expect(page.getByRole('button', { name: '暂停旋转' })).toBeVisible()
    const releasedTwist = (await rotations(page)).twist
    await expect.poll(async () => (await rotations(page)).twist).toBeGreaterThan(releasedTwist)
    await touch('touchStart', [
      { id: 1, x: x - 65, y: y - 25 },
      { id: 2, x: x + 65, y: y + 25 },
    ])
    await touch('touchEnd', [{ id: 1, x: x - 65, y: y - 25 }])
    await touch('touchMove', [{ id: 1, x: x - 55, y: y - 20 }])
    await touch('touchCancel', [])
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('.card-viewer-stage')).toHaveAttribute('data-dragging', 'false')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.getByRole('button', { name: '复位卡片' }).tap()
    await expect(card).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    await expect(page.getByLabel('缩放比例')).toHaveText('100%')
    const bounds = (await card.boundingBox())!
    expect(bounds.x).toBeGreaterThan(0)
    expect(bounds.y).toBeGreaterThan(0)
    expect(bounds.x + bounds.width).toBeLessThan(device.width)
    expect(bounds.y + bounds.height).toBeLessThan(device.height - 70)
    await page.screenshot({ path: `test-results/card-viewer-${device.name}.png` })
    await page.getByRole('button', { name: '关闭', exact: true }).tap()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await context.close()
  })
}

test('图片加载失败可以重试，减少动态效果设置仍可操作', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let failImages = true
  await page.route('**/media/**', (route) => (failImages ? route.abort() : route.continue()))
  await page.goto('/')
  await page.getByLabel('账号', { exact: true }).fill('e2e-child-one')
  await page.getByLabel('密码', { exact: true }).fill('e2e-only-password-123')
  await page.getByRole('button', { name: '开始今天的小冒险' }).click()
  await page.getByRole('link', { name: '我的图鉴', exact: true }).click()
  await page.locator('.collection-card').first().click()
  await expect(page.getByRole('alert')).toContainText('卡片图片暂时没有加载成功')
  failImages = false
  await page.getByRole('button', { name: '再试一次' }).click()
  await expect(page.locator('.card-viewer-card')).toBeVisible()
  await expect(page.locator('.card-viewer-overlay')).toHaveCSS('animation-name', 'none')
  await expect(page.getByRole('button', { name: '开始旋转' })).toBeVisible()
  await page.getByRole('group', { name: '卡片互动区域' }).focus()
  await page.keyboard.press('ArrowRight')
  expect((await rotations(page)).y).toBe(5)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
