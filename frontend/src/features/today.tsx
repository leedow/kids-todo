import { Check, Plus, Sprout } from 'lucide-react'
import { useState } from 'react'
import type { Task } from '../api/types'
import { TaskFeedbackEffect } from '../components/task-feedback'
import { Button, Empty, ErrorState, Loading, Modal } from '../components/ui'
import { TaskForm, TaskRow, useTaskCompletion, useToday } from './tasks'

export function TodayTasks() {
  const query = useToday()
  const [editor, setEditor] = useState<Task | 'new' | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')
  const completion = useTaskCompletion()
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
  const items = day.tasks.filter(
    (t) => filter === 'all' || (filter === 'done' ? !!t.completed_at : !t.completed_at),
  )
  return (
    <>
      <TaskFeedbackEffect feedback={completion.feedback} />
      <section className="today-tasks">
        <div className="section-heading">
          <div className="section-title">
            <h2>今天的小任务</h2>
            <span className="count-pill">{day.progress.total}</span>
          </div>
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
                onComplete={(target) => completion.complete(task, target)}
                feedback={
                  completion.feedback?.instanceId === task.instance_id
                    ? completion.feedback.kind
                    : undefined
                }
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
                filter === 'pending' && day.tasks.length ? '这些小任务都完成啦' : '这里还没有小任务'
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
      </section>
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
    </>
  )
}
