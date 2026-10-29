import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Check, Gift, Plus, Settings2, Sparkles, Sprout } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Day, Task } from '../api/types'
import { dateLabel, useAccounts, useToast } from '../app/context'
import { BunnyArt } from '../components/icons'
import { Button, Empty, ErrorState, Loading, Modal } from '../components/ui'
import { DrawModal } from './rewards'
import { TaskForm, TaskRow, useToday } from './tasks'

export function TodayPage() {
  const { active, activeId } = useAccounts()
  const query = useToday()
  const client = useQueryClient()
  const toast = useToast()
  const [editor, setEditor] = useState<Task | 'new' | null>(null)
  const [draw, setDraw] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')
  const completion = useMutation({
    mutationFn: (task: Day['tasks'][number]) =>
      api<Day>(`/me/task-instances/${task.instance_id}/completion`, {
        method: 'PUT',
        accountId: activeId,
        body: { completed: !task.completed_at },
      }),
    onSuccess: (result) => {
      client.setQueryData(['child', activeId, 'day', result.business_date], result)
      void client.invalidateQueries({ queryKey: ['child', activeId, 'rewards'] })
      void client.invalidateQueries({ queryKey: ['child', activeId, 'calendar'] })
    },
    onError: (error) => {
      toast(error.message)
      void query.refetch()
    },
  })
  if (query.isPending) return <Loading label="正在准备今天的小目标…" />
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  const day = query.data
  const percentage = day.progress.total
    ? Math.round((day.progress.completed / day.progress.total) * 100)
    : 0
  const items = day.tasks.filter(
    (t) => filter === 'all' || (filter === 'done' ? !!t.completed_at : !t.completed_at),
  )
  const remaining = day.progress.total - day.progress.completed
  return (
    <>
      <div className="today-dashboard">
        <div className="today-overview">
          <div className="today-title">
            <div>
              <span className="today-date">
                {dateLabel(day.business_date, { month: 'long', day: 'numeric', weekday: 'long' })}
              </span>
              <h2>今天，也很棒！</h2>
            </div>
            <span className="day-sun" aria-hidden="true">
              ☀
            </span>
          </div>
          <section className="hero day-card">
            <div className="day-card-copy">
              <h1>嗨，{active?.display_name}！</h1>
              <p>
                {day.progress.total === 0
                  ? '从一个小目标开始吧'
                  : remaining === 0
                    ? '全部完成！给自己一个拥抱'
                    : `还有 ${remaining} 件小事，一件件来吧`}
              </p>
              <div className="day-count">
                <strong>{day.progress.completed}</strong>
                <span>/ {day.progress.total} 个任务已完成</span>
                <Sparkles size={18} />
              </div>
              <div
                className="progress-track"
                role="progressbar"
                aria-label="今日完成进度"
                aria-valuenow={percentage}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${percentage}%` }} />
              </div>
            </div>
            <BunnyArt />
          </section>
          <section className={`reward-strip ${day.reward.state !== 'locked' ? 'unlocked' : ''}`}>
            <span className="reward-sticker">
              <Gift size={29} />
            </span>
            <div>
              <h2>
                {day.reward.state === 'claimed'
                  ? '今日卡片已收藏'
                  : day.reward.state === 'locked'
                    ? '今天的卡片惊喜'
                    : '今日奖励已解锁！'}
              </h2>
              <p>
                {day.reward.state === 'locked'
                  ? '完成全部任务，三张卡片选一张'
                  : day.reward.state === 'claimed'
                    ? '去看看你的新朋友吧'
                    : '已经为你保留，随时都能领取'}
              </p>
            </div>
            {day.reward.state === 'claimed' ? (
              <Link to="/collection" className="reward-action" aria-label="去图鉴看看">
                <BookOpen size={19} />
                <span>去看看</span>
              </Link>
            ) : (
              <button
                className="reward-action"
                disabled={day.reward.state === 'locked'}
                onClick={() => setDraw(day.reward.id)}
                aria-label={day.reward.state === 'locked' ? '完成任务后开启' : '领取今日奖励'}
              >
                <span>{day.reward.state === 'locked' ? '待解锁' : '领卡片'}</span>
                <ArrowRight size={17} />
              </button>
            )}
          </section>
        </div>
        <section className="today-tasks">
          <div className="section-heading">
            <div className="section-title">
              <h2>今天的小任务</h2>
              <span className="count-pill">{day.progress.total}</span>
            </div>
            <Link to="/tasks" className="text-link task-manage">
              <Settings2 size={17} />
              管理
            </Link>
          </div>
          <div className="task-list-toolbar">
            <div className="filter-tabs" aria-label="任务筛选">
              {(
                [
                  ['all', '全部任务'],
                  ['pending', '待完成'],
                  ['done', '已完成'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? 'active' : ''}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="add-task-button"
              onClick={() => setEditor('new')}
              aria-label="添加任务"
            >
              <Plus size={20} />
              <span>添加任务</span>
            </button>
          </div>
          <div className="task-list">
            {items.length ? (
              items.map((task) => (
                <TaskRow
                  task={task}
                  key={task.id}
                  disabled={completion.isPending || !task.instance_id}
                  onEdit={() => setEditor(task)}
                  onComplete={() => completion.mutate(task)}
                />
              ))
            ) : (
              <Empty
                icon={
                  filter === 'pending' && day.tasks.length ? (
                    <Check size={38} />
                  ) : (
                    <Sprout size={40} />
                  )
                }
                title={
                  filter === 'pending' && day.tasks.length
                    ? '这些小任务都完成啦'
                    : '这里还没有小任务'
                }
              >
                <p>
                  {day.tasks.length ? '换个分类看看吧。' : '读一本书，画一幅画，做一点喜欢的事。'}
                </p>
                {!day.tasks.length && (
                  <Button variant="secondary" onClick={() => setEditor('new')}>
                    <Plus size={17} />
                    添加第一个任务
                  </Button>
                )}
              </Empty>
            )}
          </div>
          <p className="day-encouragement">
            <span aria-hidden="true">✦</span> 按自己的节奏，慢慢来就好
          </p>
        </section>
      </div>
      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor === 'new' ? '添加小任务' : '编辑小任务'}
      >
        {editor && (
          <TaskForm
            task={editor === 'new' ? undefined : editor}
            today={day.server_today}
            onSaved={() => setEditor(null)}
          />
        )}
      </Modal>
      {draw && <DrawModal key={draw} rewardId={draw} onClose={() => setDraw(null)} />}
    </>
  )
}
