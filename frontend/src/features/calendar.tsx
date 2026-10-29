import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Gift,
  Plus,
  Settings2,
  Sprout,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { Day } from '../api/types'
import { dateLabel, shiftDate, useAccounts, useMe } from '../app/context'
import { TaskIcon } from '../components/icons'
import { TaskFeedbackEffect } from '../components/task-feedback'
import { Button, ErrorState, Loading, Modal } from '../components/ui'
import { TodayTasks } from './today'
import { TaskForm, useTaskCompletion } from './tasks'

type WeeklyTask = Day['tasks'][number]
const mondayOf = (date: string) =>
  shiftDate(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7))
const statusOf = (task: WeeklyTask, date: string, today: string) =>
  task.completed_at ? '已完成' : date > today ? '已计划' : date === today ? '待完成' : '未完成'

export function CalendarPage() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const [offset, setOffset] = useState(0)
  const isToday = params.get('mode') === 'today'
  const switchMode = (mode: 'today' | 'calendar') => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (mode === 'today') next.set('mode', 'today')
      else next.delete('mode')
      return next
    })
  }
  if (me.isPending) return <Loading />
  if (me.error) return <ErrorState error={me.error} />
  return (
    <section
      className={`week-panel calendar-workspace${isToday ? ' is-today' : ''}`}
      aria-label="任务日历"
    >
      <div className="calendar-mode-content">
        {isToday ? (
          <TodayTasks />
        ) : (
          <CalendarContent today={me.data.server_today} offset={offset} />
        )}
      </div>
      <footer className="calendar-footer">
        <div className="calendar-controls">
          <div className="calendar-mode-switch" role="group" aria-label="显示模式">
            <button type="button" aria-pressed={isToday} onClick={() => switchMode('today')}>
              今日
            </button>
            <button type="button" aria-pressed={!isToday} onClick={() => switchMode('calendar')}>
              日历
            </button>
          </div>
          <Link to="/tasks" className="text-link task-manage">
            <Settings2 size={17} />
            管理
          </Link>
        </div>
        {!isToday && (
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
        )}
      </footer>
    </section>
  )
}

function CalendarContent({ today, offset }: { today: string; offset: number }) {
  const { activeId } = useAccounts()
  const start = shiftDate(mondayOf(today), offset * 7)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(start, index))
  const [selected, setSelected] = useState<{ date: string; task: WeeklyTask } | null>(null)
  const [addingDate, setAddingDate] = useState<string | null>(null)
  const completion = useTaskCompletion()
  const query = useQuery({
    queryKey: ['child', activeId, 'calendar', 'week', start],
    queryFn: ({ signal }) =>
      Promise.all(
        dates.map((date) =>
          api<Day>(`/me/days/${date}${date === today ? '/prepare' : ''}`, {
            method: date === today ? 'POST' : 'GET',
            accountId: activeId,
            signal,
          }),
        ),
      ),
  })
  return (
    <div className="weekly-calendar">
      <TaskFeedbackEffect feedback={completion.feedback} />
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
          <div
            className="week-scroll"
            tabIndex={0}
            role="region"
            aria-label="一周任务表，可左右滚动"
          >
            <table className="week-table">
              <caption className="sr-only">
                {start} 至 {dates[6]}
                ，每列一天。点击今天的任务完成或取消完成，点击今天及未来日期的空白处添加任务。
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
                      onClick={(event) => {
                        if (
                          day.business_date >= today &&
                          !(event.target as HTMLElement).closest('button, a')
                        )
                          setAddingDate(day.business_date)
                      }}
                      data-can-add={day.business_date >= today || undefined}
                    >
                      <div className="week-day-list">
                        {day.tasks.length ? (
                          day.tasks.map((task) => (
                            <button
                              key={task.id}
                              data-task-feedback={
                                day.business_date === today &&
                                completion.feedback?.instanceId === task.instance_id
                                  ? completion.feedback.kind
                                  : undefined
                              }
                              className={`week-task-state ${task.completed_at ? 'done' : day.business_date > today ? 'planned' : 'pending'}`}
                              role={day.business_date === today ? 'checkbox' : undefined}
                              aria-checked={
                                day.business_date === today ? !!task.completed_at : undefined
                              }
                              aria-label={`${day.business_date} ${day.business_date === today ? (task.completed_at ? '取消完成' : '完成') : '查看'}${task.name} ${statusOf(task, day.business_date, today)}`}
                              disabled={
                                day.business_date === today &&
                                (completion.isPending || !task.instance_id)
                              }
                              onClick={(event) => {
                                if (day.business_date === today)
                                  completion.complete(task, event.currentTarget)
                                else setSelected({ date: day.business_date, task })
                              }}
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
                      {day.business_date >= today && (
                        <button
                          type="button"
                          className="week-add-task"
                          aria-label={`${day.business_date} 添加任务`}
                          onClick={() => setAddingDate(day.business_date)}
                        >
                          <Plus size={16} />
                          添加任务
                        </button>
                      )}
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
        </>
      )}
      <Modal
        open={addingDate !== null}
        onClose={() => setAddingDate(null)}
        title="添加小任务"
        description={
          addingDate
            ? dateLabel(addingDate, { month: 'long', day: 'numeric', weekday: 'long' })
            : undefined
        }
      >
        {addingDate && (
          <TaskForm
            key={addingDate}
            today={today}
            initialDate={addingDate}
            initialRuleType="once"
            onSaved={() => setAddingDate(null)}
          />
        )}
      </Modal>
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
            <p className="muted">
              {selected.date > today ? '未来的计划可以在任务管理中调整。' : '这是当天留下的记录。'}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
