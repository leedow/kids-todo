import { expect, test, type Page } from '@playwright/test'

const today = '2026-10-29'

async function mockCalendar(page: Page) {
  const user = {
    id: 'layout-child',
    username: 'layout-child',
    display_name: '朵朵',
    avatar_key: 'fox',
    role: 'child',
    status: 'active',
  }
  const tasks = ['阅读20分钟', '练习画画', '整理书包', '运动半小时', '练习钢琴', '早点睡觉'].map(
    (name, i) => ({
      id: `task-${i}`,
      instance_id: `instance-${i}`,
      name,
      description: '',
      color: i % 2 ? 'peach' : 'mint',
      icon: i % 2 ? 'brush' : 'book',
      planned_time: i % 2 ? null : '19:00:00',
      completed_at: i === 0 ? '2026-10-29T10:00:00Z' : null,
      rule_type: 'daily',
      start_date: today,
      end_date: null,
      weekdays: [],
      sort_order: i,
      state: 'active',
    }),
  )
  let prepared = false
  const dayTasks = (date: string) =>
    tasks.filter((task) => task.rule_type !== 'once' || task.start_date === date)
  const day = (date: string) => ({
    business_date: date,
    server_today: today,
    timezone: 'Asia/Shanghai',
    is_preview: date > today,
    prepared: date === today ? prepared : date < today,
    tasks: dayTasks(date).map((task) => ({
      ...task,
      instance_id: date === today && !prepared ? null : task.instance_id,
      completed_at: date === today ? task.completed_at : null,
    })),
    progress: {
      total: dayTasks(date).length,
      completed: date === today ? dayTasks(date).filter((task) => task.completed_at).length : 0,
    },
    reward: { id: 'layout-reward', state: 'locked' },
  })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const date = path.match(/\/me\/days\/([^/]+)/)?.[1]
    const completion = path.match(/\/me\/task-instances\/([^/]+)\/completion$/)?.[1]
    const editing = path.match(/\/me\/tasks\/([^/]+)$/)?.[1]
    let json
    if (path.endsWith('/auth/accounts')) json = { accounts: [user] }
    else if (path.endsWith('/auth/csrf')) json = { csrf_token: 'layout-test-token' }
    else if (path.endsWith('/me')) json = { user, server_today: today, timezone: 'Asia/Shanghai' }
    else if (date) {
      if (path.endsWith('/prepare')) prepared = true
      json = day(date)
    } else if (completion) {
      const task = tasks.find((task) => task.instance_id === completion)!
      task.completed_at = route.request().postDataJSON().completed ? '2026-10-29T11:00:00Z' : null
      json = day(today)
    } else if (editing) {
      const task = tasks.find((task) => task.id === editing)!
      Object.assign(task, route.request().postDataJSON())
      json = task
    } else if (path.endsWith('/me/tasks') && route.request().method() === 'POST') {
      const task = {
        ...tasks[1],
        ...route.request().postDataJSON(),
        id: 'task-added',
        instance_id: 'instance-added',
        completed_at: null,
      }
      tasks.push(task)
      json = task
    } else throw new Error(`Unexpected layout-test request: ${path}`)
    await route.fulfill({ json })
  })
}

test.beforeEach(async ({ page }) => {
  await mockCalendar(page)
})

for (const viewport of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1194, height: 834 },
]) {
  test(`${viewport.width}px 合并页面、左下角模式切换与首屏任务`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/calendar')
    await expect(page.locator('.week-table thead th')).toHaveCount(7)
    await expect(page.locator('.week-task-state')).toHaveCount(42)
    await expect(page.getByRole('button', { name: '日历', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const mode = await page.locator('.calendar-mode-switch').boundingBox()
    const manage = await page.getByRole('link', { name: '管理', exact: true }).boundingBox()
    const navigation = await page.locator('.week-navigation').boundingBox()
    expect(mode!.x + mode!.width).toBeLessThan(manage!.x)
    expect(Math.abs(mode!.y - manage!.y)).toBeLessThan(5)
    if (Math.abs(mode!.y - navigation!.y) < 5) {
      expect(manage!.x + manage!.width).toBeLessThan(navigation!.x)
    } else {
      expect(navigation!.y).toBeGreaterThanOrEqual(mode!.y + mode!.height)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `test-results/merged-calendar-${viewport.width}.png`,
      fullPage: true,
    })

    await page.getByRole('button', { name: '今日', exact: true }).click()
    await expect(page).toHaveURL(/\/calendar\?mode=today$/)
    await expect(page.getByRole('heading', { name: '今天的小任务' })).toBeVisible()
    await expect(page.locator('.today-tasks .task-row')).toHaveCount(6)
    await expect(
      page.locator('.today-overview, .reward-strip, .hero, .week-navigation, .week-table'),
    ).toHaveCount(0)
    await expect(page.locator('.mobile-nav a')).toHaveCount(3)
    await expect(page.getByRole('link', { name: '管理', exact: true })).toHaveAttribute(
      'href',
      '/tasks',
    )
    await expect(page.getByRole('button', { name: '今日', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const first = await page.locator('.today-tasks .task-row').first().boundingBox()
    const second = await page.locator('.today-tasks .task-row').nth(1).boundingBox()
    const nav = await page.locator('.mobile-nav').boundingBox()
    expect(first!.y).toBeLessThan(220)
    expect(second!.y + second!.height).toBeLessThan(nav!.y)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: `test-results/merged-today-${viewport.width}.png`,
      fullPage: true,
    })
    await page.reload()
    await expect(page.locator('.today-tasks .task-row')).toHaveCount(6)

    await page.getByRole('button', { name: '日历', exact: true }).click()
    await page.getByRole('button', { name: '下一周', exact: true }).click()
    await expect(page.locator('.week-table thead th').first()).toContainText('11/2')
    await page.getByRole('button', { name: '今日', exact: true }).click()
    await expect(page.locator('.today-tasks .task-row')).toHaveCount(6)
    await page.getByRole('button', { name: '日历', exact: true }).click()
    await expect(page.locator('.week-table thead th').first()).toContainText('11/2')
    await page.getByRole('button', { name: '本周', exact: true }).click()
    await expect(page.locator('.week-table thead th').first()).toContainText('10/26')
  })
}

test('兼容原今日入口，保留打卡、筛选、添加、编辑并同步日历状态', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveURL(/\/calendar\?mode=today$/)
  await page.getByRole('checkbox', { name: '完成练习画画', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '取消完成练习画画', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: '已完成', exact: true }).click()
  await expect(page.locator('.today-tasks .task-row')).toHaveCount(2)
  await page.getByRole('button', { name: '待完成', exact: true }).click()
  await expect(page.locator('.today-tasks .task-row')).toHaveCount(4)
  await page.getByRole('button', { name: '全部任务', exact: true }).click()
  await page.getByRole('button', { name: '练习画画', exact: true }).click()
  await page.getByLabel('小任务名称').fill('画一幅风景')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(page.getByRole('heading', { name: '画一幅风景' })).toBeVisible()
  await page.getByRole('button', { name: '添加任务', exact: true }).click()
  await page.getByLabel('小任务名称').fill('整理玩具')
  await page.getByRole('button', { name: '种下一个小目标' }).click()
  await expect(page.getByRole('heading', { name: '整理玩具' })).toBeVisible()
  await page.getByRole('button', { name: '日历', exact: true }).click()
  const updated = page
    .locator('.week-day-tasks.week-today .week-task-state')
    .filter({ hasText: '画一幅风景' })
  await expect(updated).toContainText('已完成')
  await updated.click()
  await expect(updated).toContainText('待完成')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '今日', exact: true }).click()
  await expect(page.locator('.today-tasks')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: '完成画一幅风景', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  expect(errors).toEqual([])
})

test('直接打开日历即可完成与取消今天的任务，空白点击按日期添加一次性任务', async ({ page }) => {
  await page.goto('/calendar')
  const drawing = page.locator('.week-today .week-task-state').filter({ hasText: '练习画画' })
  await expect(drawing).toBeEnabled()
  await drawing.locator('.task-icon svg').click()
  await expect(drawing).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('thead .week-today small')).toContainText('2 / 6')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await drawing.click()
  await expect(drawing).toHaveAttribute('aria-checked', 'false')

  // Padding is part of the blank date column; task clicks must never open this form.
  await page.locator(`[data-date="${today}"]`).click({ position: { x: 2, y: 2 } })
  await expect(page.getByRole('dialog', { name: '添加小任务' })).toBeVisible()
  await expect(page.getByLabel('任务日期')).toHaveValue(today)
  await expect(page.getByLabel('重复方式')).toHaveValue('once')
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  await page.locator('[data-date="2026-10-30"]').click({ position: { x: 2, y: 2 } })
  await expect(page.getByLabel('任务日期')).toHaveValue('2026-10-30')
  await page.getByLabel('小任务名称').fill('周五整理玩具')
  const saved = page.waitForRequest(
    (request) => request.url().endsWith('/me/tasks') && request.method() === 'POST',
  )
  await page.getByRole('button', { name: '种下一个小目标' }).click()
  expect((await saved).postDataJSON()).toMatchObject({
    start_date: '2026-10-30',
    rule_type: 'once',
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-date="2026-10-30"] .week-card-name')).toContainText([
    '周五整理玩具',
  ])
  await expect(
    page.locator('.week-today .week-card-name').filter({ hasText: '周五整理玩具' }),
  ).toHaveCount(0)
  await page.locator('[data-date="2026-10-28"]').click({ position: { x: 2, y: 2 } })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-date="2026-10-28"] .week-add-task')).toHaveCount(0)
})

test('空任务日期可键盘添加，未来任务保留详情，打卡失败可重试', async ({ page }) => {
  await page.route('**/me/days/2026-10-30', async (route) => {
    await route.fulfill({
      json: {
        business_date: '2026-10-30',
        server_today: today,
        timezone: 'Asia/Shanghai',
        is_preview: true,
        prepared: false,
        tasks: [],
        progress: { total: 0, completed: 0 },
        reward: { id: null, state: 'locked' },
      },
    })
  })
  await page.goto('/calendar')
  await page.locator('[data-date="2026-10-30"] .week-day-empty').click()
  await expect(page.getByLabel('任务日期')).toHaveValue('2026-10-30')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '2026-10-30 添加任务', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: '添加小任务' })).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('[data-date="2026-10-31"] .week-task-state').first().click()
  await expect(page.getByRole('dialog')).toContainText('已计划')
  await page.getByRole('button', { name: '关闭', exact: true }).click()

  await page.route(
    '**/me/task-instances/*/completion',
    (route) =>
      route.fulfill({
        status: 409,
        json: { error: { code: 'DAY_CLOSED', message: '只能修改今天的任务记录' } },
      }),
    { times: 1 },
  )
  const drawing = page.locator('.week-today .week-task-state').filter({ hasText: '练习画画' })
  await drawing.click()
  await expect(page.getByText('只能修改今天的任务记录', { exact: true })).toBeVisible()
  await expect(drawing).toHaveAttribute('aria-checked', 'false')
  await drawing.click()
  await expect(drawing).toHaveAttribute('aria-checked', 'true')
})

test('打卡反馈只在保存成功后播放，筛选移除任务仍可显示，日历支持取消反馈', async ({ page }) => {
  await page.addInitScript(() => {
    const originalStart = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when?: number) {
      document.documentElement.dataset.playedNotes = String(
        Number(document.documentElement.dataset.playedNotes ?? 0) + 1,
      )
      originalStart.call(this, when)
    }
  })
  await page.goto('/calendar?mode=today')
  await expect(page.locator('.task-row')).toHaveCount(6)
  await expect(page.locator('.task-feedback')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-played-notes')
  await page.getByRole('button', { name: '待完成', exact: true }).click()

  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/me/task-instances/*/completion',
    async (route) => {
      await pending
      await route.fallback()
    },
    { times: 1 },
  )
  const drawing = page.getByRole('checkbox', { name: '完成练习画画', exact: true })
  await drawing.click()
  await expect(drawing).toBeDisabled()
  await expect(page.locator('.task-feedback')).toHaveCount(0)
  await expect(page.locator('html')).not.toHaveAttribute('data-played-notes')
  release()
  await expect(page.locator('.task-feedback-complete .task-feedback-label')).toHaveText('完成啦！')
  await expect(drawing).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-played-notes', '3')
  await expect(page.locator('.task-feedback')).toHaveCount(0)

  await page.getByRole('button', { name: '日历', exact: true }).click()
  const card = page.locator('.week-today .week-task-state').filter({ hasText: '练习画画' })
  await card.click()
  await expect(card).toHaveAttribute('aria-checked', 'false')
  await expect(card).toHaveAttribute('data-task-feedback', 'undo')
  await expect(page.locator('.task-feedback-undo')).toHaveText('已恢复待完成')
  await expect(page.locator('html')).toHaveAttribute('data-played-notes', '5')
  await expect(page.locator('.task-feedback')).toHaveCount(0)

  await page.route(
    '**/me/task-instances/*/completion',
    (route) =>
      route.fulfill({
        status: 409,
        json: { error: { code: 'DAY_CLOSED', message: '只能修改今天的任务记录' } },
      }),
    { times: 1 },
  )
  await card.click()
  await expect(page.getByText('只能修改今天的任务记录', { exact: true })).toBeVisible()
  await expect(card).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.task-feedback')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-played-notes', '5')
  await card.click()
  await expect(card).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.task-feedback-complete .task-feedback-label')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-played-notes', '8')
  await page.screenshot({ path: 'test-results/task-completion-feedback.png' })
})

test('禁用音频和减少动态效果时仍能正常完成与取消任务', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        constructor() {
          throw new Error('Audio unavailable')
        }
      },
    })
  })
  await page.goto('/calendar?mode=today')
  await page.getByRole('checkbox', { name: '完成练习画画', exact: true }).click()
  await expect(page.locator('.task-feedback-label')).toHaveText('完成啦！')
  await expect(page.locator('.task-feedback-ring')).toBeHidden()
  expect(
    await page.locator('.task-feedback-label').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  await page.getByRole('checkbox', { name: '取消完成练习画画', exact: true }).click()
  await expect(page.locator('.task-feedback-label')).toHaveText('已恢复待完成')
  await expect(page.getByRole('checkbox', { name: '完成练习画画', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await expect(page.locator('.task-feedback')).toHaveCount(0)
  expect(errors).toEqual([])
})
