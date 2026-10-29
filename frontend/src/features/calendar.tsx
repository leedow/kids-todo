import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Gift,
  Sprout,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Day } from '../api/types'
import { dateLabel, shiftDate, useAccounts, useMe } from '../app/context'
import { TaskIcon } from '../components/icons'
import { Button, ErrorState, Loading, Modal } from '../components/ui'

type WeeklyTask = Day['tasks'][number]
const mondayOf = (date: string) =>
  shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
const statusOf = (task: WeeklyTask, date: string, today: string) =>
  task.completed_at ? '已完成' : date > today ? '已计划' : date === today ? '待完成' : '未完成'

export function CalendarPage() {
  const me = useMe()
  if (me.isPending) return <Loading />
  if (me.error) return <ErrorState error={me.error} />
  return <CalendarContent today={me.data.server_today} />
}

function CalendarContent({ today }: { today: string }) {
  const { activeId } = useAccounts()
  const [offset, setOffset] = useState(0)
  const start = shiftDate(mondayOf(today), offset * 7)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(start, index))
  const [selected, setSelected] = useState<{ date: string; task: WeeklyTask } | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const query = useQuery({
    queryKey: ['child', activeId, 'calendar', 'week', start],
    queryFn: ({ signal }) =>
      Promise.all(
        dates.map((date) => api<Day>(`/me/days/${date}`, { accountId: activeId, signal })),
      ),
  })
  const updateEdges = () => {
    const el = scroll.current
    if (el)
      setEdges({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
  }
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    el.scrollLeft = 0
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [start, query.isSuccess])
  const slide = (direction: number) => {
    const el = scroll.current
    if (el)
      el.scrollBy({
        left: direction * Math.max(160, el.clientWidth * 0.65),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
  }
  const total = query.data?.reduce((sum, day) => sum + day.progress.total, 0) ?? 0
  const completed = query.data?.reduce((sum, day) => sum + day.progress.completed, 0) ?? 0
  return (
    <div className="weekly-calendar">
      <div className="page-heading">
        <div>
          <h1>我的一周</h1>
          <p>每天的小安排，一起看得清清楚楚。</p>
        </div>
        <CalendarDays className="heading-icon" size={42} />
      </div>
      <section className="week-panel" aria-label="每周任务日历">
        <header className="week-toolbar">
          <div className="week-title">
            <h2>
              {dateLabel(start, { year: 'numeric', month: 'long', day: 'numeric' })} —{' '}
              {dateLabel(dates[6], {
                ...(start.slice(0, 4) !== dates[6].slice(0, 4) ? { year: 'numeric' as const } : {}),
                month: 'long',
                day: 'numeric',
              })}
            </h2>
            <p>
              {query.isSuccess
                ? `整周已完成 ${completed} / ${total} 次任务`
                : '周一到周日 · 每天的小目标'}
            </p>
          </div>
          <div className="week-navigation">
            <button
              className="icon-btn"
              aria-label="上一周"
              onClick={() => setOffset((n) => n - 1)}
            >
              <ChevronLeft size={21} />
            </button>
            <Button variant="secondary" onClick={() => setOffset(0)}>
              本周
            </Button>
            <button
              className="icon-btn"
              aria-label="下一周"
              onClick={() => setOffset((n) => n + 1)}
            >
              <ChevronRight size={21} />
            </button>
          </div>
        </header>
        {query.isPending ? (
          <Loading label="正在展开这一周的任务…" />
        ) : query.error ? (
          <ErrorState
            error={query.error}
            retry={() => {
              void query.refetch()
            }}
          />
        ) : (
          <>
            <div className="week-scroll-tools">
              <div className="week-legend">
                <span>
                  <Check size={15} />
                  已完成
                </span>
                <span>
                  <Circle size={14} />
                  待完成 / 未完成
                </span>
                <span>
                  <Clock3 size={15} />
                  已计划
                </span>
              </div>
              <div className="week-pan">
                <span>{edges.left || edges.right ? '左右滑动看整周' : '整周安排'}</span>
                <button
                  className="icon-btn"
                  aria-label="向左查看日期"
                  disabled={!edges.left}
                  onClick={() => slide(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="向右查看日期"
                  disabled={!edges.right}
                  onClick={() => slide(1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div
              className="week-scroll"
              ref={scroll}
              onScroll={updateEdges}
              tabIndex={0}
              role="region"
              aria-label="一周任务表，可左右滚动"
            >
              <table className="week-table">
                <caption className="sr-only">
                  {start} 至 {dates[6]}，每列一天，分别列出当天的全部任务。点击任务查看详情。
                </caption>
                <colgroup>
                  {dates.map((date) => (
                    <col key={date} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {query.data.map((day, index) => (
                      <th
                        key={day.business_date}
                        scope="col"
                        className={day.business_date === today ? 'week-today' : ''}
                        aria-current={day.business_date === today ? 'date' : undefined}
                      >
                        <span className="week-day-name">
                          周{'一二三四五六日'[index]}
                          {day.business_date === today && <em>今天</em>}
                        </span>
                        <strong>
                          {dateLabel(day.business_date, { month: 'numeric', day: 'numeric' })}
                        </strong>
                        <small>
                          {day.progress.completed} / {day.progress.total} 完成
                          {day.is_preview && ' · 预览'}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {query.data.map((day) => (
                      <td
                        key={day.business_date}
                        data-date={day.business_date}
                        className={`week-day-tasks ${day.business_date === today ? 'week-today' : ''}`}
                      >
                        <div className="week-day-list">
                          {day.tasks.length ? (
                            day.tasks.map((task) => (
                              <button
                                key={task.id}
                                className={`week-task-state ${task.completed_at ? 'done' : day.business_date > today ? 'planned' : 'pending'}`}
                                aria-label={`${day.business_date} ${task.name} ${statusOf(task, day.business_date, today)}`}
                                onClick={() => setSelected({ date: day.business_date, task })}
                              >
                                <span className={`task-icon color-${task.color}`}>
                                  <TaskIcon name={task.icon} size={19} />
                                </span>
                                <strong className="week-card-name">{task.name}</strong>
                                <small className="week-card-time">
                                  <Clock3 size={13} />
                                  {task.planned_time?.slice(0, 5) ?? '自由安排'}
                                </small>
                                <span className="week-card-status">
                                  {task.completed_at ? (
                                    <Check size={15} />
                                  ) : day.business_date > today ? (
                                    <Clock3 size={14} />
                                  ) : (
                                    <Circle size={14} />
                                  )}
                                  {statusOf(task, day.business_date, today)}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="week-day-empty">
                              <Sprout size={24} />
                              <span>这一天没有任务</span>
                              <small>留一点自由时间</small>
                            </div>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    {query.data.map((day) => (
                      <td
                        key={day.business_date}
                        className={day.business_date === today ? 'week-today' : ''}
                      >
                        {day.reward.state !== 'locked' ? (
                          <Link
                            to={day.reward.state === 'claimed' ? '/collection' : '/rewards'}
                            className="week-reward"
                          >
                            <Gift size={15} />
                            {day.reward.state === 'claimed' ? '已收藏' : '待领取'}
                          </Link>
                        ) : (
                          <span className="week-no-reward">
                            {day.business_date > today ? '奖励 · 等待这一天' : '奖励 · 未解锁'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="week-footnote">点击任务卡片查看详情 · 未来安排仅供预览，过去记录只读</p>
          </>
        )}
      </section>
      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.task.name}
          description={dateLabel(selected.date, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        >
          <div className="week-detail">
            <span className={`task-icon color-${selected.task.color}`}>
              <TaskIcon name={selected.task.icon} size={28} />
            </span>
            <strong>{statusOf(selected.task, selected.date, today)}</strong>
            <p>
              <Clock3 size={17} />
              {selected.task.planned_time?.slice(0, 5) ?? '时间由你安排'}
            </p>
            {selected.task.description && <p>{selected.task.description}</p>}
            {selected.task.completed_at && (
              <p>
                完成时间：
                {new Date(selected.task.completed_at).toLocaleString('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
            {selected.date === today ? (
              <Button asChild>
                <Link to="/">去今日任务{selected.task.completed_at ? '查看' : '打卡'}</Link>
              </Button>
            ) : (
              <p className="muted">
                {selected.date > today
                  ? '未来的计划可以在任务管理中调整。'
                  : '这是当天留下的记录。'}
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
