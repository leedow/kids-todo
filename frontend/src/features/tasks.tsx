import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  Plus,
  Sprout,
  Trash2,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Day, Page, Task, TaskInput } from '../api/types'
import { useAccounts, useMe, useToast } from '../app/context'
import { icons, TaskIcon } from '../components/icons'
import { Button, Empty, ErrorState, Loading, Modal, Pager } from '../components/ui'

export function useToday() {
  const { activeId } = useAccounts()
  const me = useMe()
  const date = me.data?.server_today ?? ''
  return useQuery({
    queryKey: ['child', activeId, 'day', date],
    enabled: !!date,
    queryFn: ({ signal }) =>
      api<Day>(`/me/days/${date}/prepare`, { method: 'POST', accountId: activeId, signal }),
  })
}

export function TaskForm({
  task,
  today,
  onSaved,
}: {
  task?: Task
  today: string
  onSaved: () => void
}) {
  const { activeId } = useAccounts()
  const client = useQueryClient()
  const [value, setValue] = useState<TaskInput>({
    name: task?.name ?? '',
    description: task?.description ?? '',
    icon: task?.icon ?? 'book',
    color: task?.color ?? 'mint',
    rule_type: task?.rule_type ?? 'daily',
    start_date: task?.start_date ?? today,
    end_date: task?.end_date ?? null,
    weekdays: task?.weekdays ?? [1, 2, 3, 4, 5],
    planned_time: task?.planned_time?.slice(0, 5) ?? null,
    sort_order: task?.sort_order ?? 0,
    state: task?.state ?? 'active',
  })
  const field = <K extends keyof TaskInput>(key: K, val: TaskInput[K]) =>
    setValue((old) => ({ ...old, [key]: val }))
  const save = useMutation({
    mutationFn: () =>
      api(task ? `/me/tasks/${task.id}` : '/me/tasks', {
        method: task ? 'PATCH' : 'POST',
        accountId: activeId,
        body: value,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['child', activeId] })
      onSaved()
    },
  })
  return (
    <form
      className="form-stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <label>
        小任务名称
        <input
          autoFocus
          value={value.name}
          onChange={(e) => field('name', e.target.value)}
          maxLength={60}
          required
          placeholder="比如：阅读20分钟"
        />
      </label>
      <fieldset>
        <legend>选一个图标</legend>
        <div className="icon-options">
          {Object.keys(icons).map((name) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={value.icon === name}
              className={value.icon === name ? 'selected' : ''}
              onClick={() => field('icon', name)}
            >
              <TaskIcon name={name} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="form-row">
        <label>
          重复方式
          <select
            value={value.rule_type}
            onChange={(e) => field('rule_type', e.target.value as TaskInput['rule_type'])}
          >
            <option value="once">只做一次</option>
            <option value="daily">每天</option>
            <option value="weekly">每周指定星期</option>
          </select>
        </label>
        <label>
          计划时间 <span className="optional">选填</span>
          <input
            type="time"
            value={value.planned_time ?? ''}
            onChange={(e) => field('planned_time', e.target.value || null)}
          />
        </label>
      </div>
      {value.rule_type === 'weekly' && (
        <fieldset>
          <legend>选择星期</legend>
          <div className="weekday-options">
            {['一', '二', '三', '四', '五', '六', '日'].map((day, index) => (
              <button
                key={day}
                type="button"
                aria-pressed={value.weekdays?.includes(index + 1)}
                className={value.weekdays?.includes(index + 1) ? 'selected' : ''}
                onClick={() =>
                  field(
                    'weekdays',
                    value.weekdays?.includes(index + 1)
                      ? value.weekdays.filter((d) => d !== index + 1)
                      : [...(value.weekdays ?? []), index + 1],
                  )
                }
              >
                {day}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="form-row">
        <label>
          {value.rule_type === 'once' ? '任务日期' : '开始日期'}
          <input
            type="date"
            value={value.start_date}
            min={task ? undefined : today}
            onChange={(e) => field('start_date', e.target.value)}
            required
          />
        </label>
        {value.rule_type !== 'once' && (
          <label>
            结束日期 <span className="optional">选填</span>
            <input
              type="date"
              value={value.end_date ?? ''}
              min={value.start_date}
              onChange={(e) => field('end_date', e.target.value || null)}
            />
          </label>
        )}
      </div>
      <details className="task-extra-settings">
        <summary>
          更多设置 <span>说明、颜色和排序</span>
        </summary>
        <div className="form-stack">
          <label>
            任务说明 <span className="optional">选填</span>
            <textarea
              value={value.description ?? ''}
              onChange={(e) => field('description', e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="记下一个小提示…"
            />
          </label>
          <fieldset>
            <legend>喜欢的颜色</legend>
            <div className="color-options">
              {['mint', 'peach', 'lavender', 'sky', 'yellow'].map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  aria-pressed={value.color === color}
                  className={`color-${color} ${value.color === color ? 'selected' : ''}`}
                  onClick={() => field('color', color)}
                >
                  {value.color === color && <Check size={18} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label>
            排序 <span className="optional">数字越小越靠前，同一计划时间内生效</span>
            <input
              type="number"
              value={value.sort_order}
              min={-100000}
              max={100000}
              onChange={(e) => field('sort_order', Number(e.target.value))}
            />
          </label>
        </div>
      </details>
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? '正在保存…' : task ? '保存修改' : '种下一个小目标'}
        <Sprout size={18} />
      </Button>
    </form>
  )
}

export function TaskRow({
  task,
  onComplete,
  onEdit,
  disabled = false,
}: {
  task: Day['tasks'][number]
  onComplete?: () => void
  onEdit?: () => void
  disabled?: boolean
}) {
  const done = !!task.completed_at
  return (
    <article className={`task-row ${done ? 'task-done' : ''}`}>
      <span className={`task-icon color-${task.color}`}>
        <TaskIcon name={task.icon} size={24} />
      </span>
      <div className="task-info">
        <h3>
          {onEdit ? (
            <button className="task-title-button" onClick={onEdit} title="编辑任务">
              {task.name}
            </button>
          ) : (
            task.name
          )}
        </h3>
        {task.description && <p>{task.description}</p>}
        <span className="task-meta">
          {task.planned_time ? (
            <>
              <Clock3 size={12} />
              {task.planned_time.slice(0, 5)}
            </>
          ) : (
            '时间由你安排'
          )}
          {done && <span>· 已完成</span>}
          {task.planned_time_passed && <span>· 时间已过</span>}
        </span>
      </div>
      {onComplete ? (
        <button
          className={`check-button ${done ? 'checked' : ''}`}
          role="checkbox"
          aria-checked={done}
          aria-label={`${done ? '取消完成' : '完成'}${task.name}`}
          disabled={disabled}
          onClick={onComplete}
        >
          {done && <Check size={19} strokeWidth={3} />}
        </button>
      ) : (
        done && (
          <span className="check-button checked">
            <Check size={19} />
          </span>
        )
      )}
    </article>
  )
}

export function TasksPage() {
  const { activeId } = useAccounts()
  const me = useMe()
  const client = useQueryClient()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<Task | 'new' | null>(null)
  const query = useQuery({
    queryKey: ['child', activeId, 'tasks', page],
    queryFn: ({ signal }) =>
      api<Page<Task>>(`/me/tasks?page=${page}`, { accountId: activeId, signal }),
  })
  const change = useMutation({
    mutationFn: ({ task, archive }: { task: Task; archive?: boolean }) =>
      api(`/me/tasks/${task.id}`, {
        method: archive ? 'DELETE' : 'PATCH',
        accountId: activeId,
        body: archive ? undefined : { state: task.state === 'paused' ? 'active' : 'paused' },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['child', activeId] })
    },
    onError: (e) => toast(e.message),
  })
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        返回今日
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LITTLE PLANS</span>
          <h1>我的小目标</h1>
          <p>把想做的事，变成每天的小小行动。</p>
        </div>
        <Button onClick={() => setEditor('new')}>
          <Plus size={18} />
          添加任务
        </Button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <section className="panel">
          {query.data.items.length === 0 ? (
            <Empty icon={<Sprout size={42} />} title="先种下一个小目标" />
          ) : (
            query.data.items.map((task) => (
              <div className="managed-task" key={task.id}>
                <span className={`task-icon color-${task.color}`}>
                  <TaskIcon name={task.icon} />
                </span>
                <button className="managed-title" onClick={() => setEditor(task)}>
                  <strong>{task.name}</strong>
                  <small>
                    {task.rule_type === 'once'
                      ? task.start_date
                      : task.rule_type === 'daily'
                        ? '每天'
                        : `每周 ${task.weekdays.map((d) => '一二三四五六日'[d - 1]).join('、')}`}{' '}
                    · {task.state === 'paused' ? '已暂停' : '进行中'}
                  </small>
                </button>
                <button
                  className="icon-btn"
                  disabled={change.isPending}
                  aria-label={`${task.state === 'paused' ? '恢复' : '暂停'}${task.name}`}
                  onClick={() => change.mutate({ task })}
                >
                  {task.state === 'paused' ? <Play size={17} /> : <Pause size={17} />}
                </button>
                <button
                  className="icon-btn"
                  aria-label={`归档${task.name}`}
                  disabled={change.isPending}
                  onClick={() => {
                    if (confirm(`归档“${task.name}”？历史记录会保留，归档后不能恢复。`))
                      change.mutate({ task, archive: true })
                  }}
                >
                  <Trash2 size={17} />
                </button>
                <ChevronRight size={16} />
              </div>
            ))
          )}
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </section>
      )}
      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor === 'new' ? '添加小任务' : '编辑小任务'}
      >
        {editor && me.data && (
          <TaskForm
            task={editor === 'new' ? undefined : editor}
            today={me.data.server_today}
            onSaved={() => setEditor(null)}
          />
        )}
      </Modal>
    </>
  )
}
