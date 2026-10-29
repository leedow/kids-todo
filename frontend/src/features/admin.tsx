import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Eye,
  Gift,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sprout,
  Upload,
  Users,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import type {
  AdminDraw,
  Card,
  CardCategory,
  CardSet,
  Day,
  Me,
  OwnedCard,
  Page,
  Stats,
  User,
} from '../api/types'
import { dateLabel, shiftDate, useToast } from '../app/context'
import { avatars, rarityNames } from '../components/icons'
import { Button, Empty, ErrorState, Loading, Modal, Pager } from '../components/ui'
import { TaskRow } from './tasks'

export function AdminApp() {
  const query = useQuery({ queryKey: ['admin', 'me'], queryFn: () => api<Me>('/admin/me') })
  const client = useQueryClient()
  const toast = useToast()
  const logout = useMutation({
    mutationFn: () => api('/admin/auth/logout', { method: 'POST' }),
    onSuccess: () => client.removeQueries({ queryKey: ['admin'] }),
    onError: (e) => toast(e.message),
  })
  if (query.isPending) return <Loading />
  if (query.error instanceof ApiError && [401, 403].includes(query.error.status))
    return <Navigate to="/admin/login" replace />
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  if (logout.isSuccess) return <Navigate to="/admin/login" replace />
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link to="/admin" className="brand">
          <span className="brand-icon">
            <Sprout />
          </span>
          <span>
            小小成长家<small>APPLICATION ADMIN</small>
          </span>
        </Link>
        <div className="admin-role">
          <ShieldCheck size={16} />
          应用管理员
        </div>
        <nav aria-label="后台导航">
          <NavLink end to="/admin">
            <LayoutDashboard size={19} />
            数据概览
          </NavLink>
          <NavLink to="/admin/users">
            <Users size={19} />
            儿童账号
          </NavLink>
          <NavLink to="/admin/content">
            <BookOpen size={19} />
            卡片内容
          </NavLink>
          <NavLink to="/admin/draws">
            <Gift size={19} />
            抽卡记录
          </NavLink>
        </nav>
        <Link className="back-link" to="/">
          <ArrowLeft size={17} />
          儿童应用
        </Link>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>让每一份成长，都有迹可循。</span>
          <div>
            <span>{query.data?.user.display_name}</span>
            <button
              className="icon-btn"
              aria-label="退出管理员"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="admin-content">
          <Routes>
            <Route index element={<Overview today={query.data!.server_today} />} />
            <Route path="users" element={<UsersPage today={query.data!.server_today} />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="draws" element={<DrawsPage today={query.data!.server_today} />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Overview({ today }: { today: string }) {
  const [range, setRange] = useState(7)
  const query = useQuery({
    queryKey: ['admin', 'stats', today, range],
    queryFn: ({ signal }) =>
      api<Stats>(`/admin/stats?from=${shiftDate(today, 1 - range)}&to=${today}`, { signal }),
  })
  if (query.isPending) return <Loading />
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          void query.refetch()
        }}
      />
    )
  const latest = query.data.days.at(-1)!
  const metrics = [
    ['儿童账号', query.data.total_users, `${query.data.disabled_users} 个已禁用`],
    ['今日活跃', latest.active_users, '使用儿童端的不同账号'],
    ['今日完成任务', latest.completed_tasks, `${latest.total_tasks} 个有效任务`],
    ['今日解锁奖励', latest.rewards_earned, '按奖励所属日期'],
    ['今日发放卡片', latest.cards_granted, '包含历史奖励补领'],
    [
      '今日完成率',
      latest.completion_rate === null ? '—' : `${Math.round(latest.completion_rate * 100)}%`,
      '完成数 / 有效任务数',
    ],
  ]
  const max = Math.max(1, ...query.data.days.map((d) => d.completed_tasks))
  return (
    <>
      <AdminHeading
        eyebrow="GROWING TOGETHER"
        title="数据概览"
        description={`${dateLabel(today, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 应用运行情况`}
      />
      <div className="metric-grid">
        {metrics.map(([name, value, hint]) => (
          <section className="panel metric-card" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
            <small>{hint}</small>
          </section>
        ))}
      </div>
      <section className="panel trend-panel">
        <div className="section-heading">
          <div className="section-title">
            <BarChart3 size={20} />
            <h2>任务完成趋势</h2>
          </div>
          <div className="filter-tabs compact">
            {[7, 30].map((n) => (
              <button className={range === n ? 'active' : ''} onClick={() => setRange(n)} key={n}>
                {n}天
              </button>
            ))}
          </div>
        </div>
        <div className="trend-chart">
          {query.data.days.map((d) => (
            <div
              key={d.date}
              className="trend-column"
              title={`${d.date}：完成${d.completed_tasks}，解锁${d.rewards_earned}，发卡${d.cards_granted}`}
            >
              <span>{d.completed_tasks || ''}</span>
              <div style={{ height: `${Math.max(3, (d.completed_tasks / max) * 145)}px` }} />
              <small>{d.date.slice(5)}</small>
            </div>
          ))}
        </div>
        <p className="form-hint">
          奖励按所属日统计，发卡按实际领取日统计；没有任务时完成率显示为“—”。
        </p>
      </section>
      <section className="panel table-panel">
        <h2>每日明细</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>活跃儿童</th>
                <th>有效任务</th>
                <th>已完成</th>
                <th>奖励解锁</th>
                <th>卡片发放</th>
              </tr>
            </thead>
            <tbody>
              {[...query.data.days].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td>{d.active_users}</td>
                  <td>{d.total_tasks}</td>
                  <td>{d.completed_tasks}</td>
                  <td>{d.rewards_earned}</td>
                  <td>{d.cards_granted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function AdminHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  )
}

function UsersPage({ today }: { today: string }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [viewing, setViewing] = useState<User | null>(null)
  const query = useQuery({
    queryKey: ['admin', 'users', q, status, page],
    queryFn: ({ signal }) =>
      api<Page<User>>(`/admin/users?q=${encodeURIComponent(q)}&status=${status}&page=${page}`, {
        signal,
      }),
  })
  return (
    <>
      <AdminHeading
        eyebrow="LITTLE GROWERS"
        title="儿童账号"
        description="创建独立账号，查看任务与收藏记录。"
      >
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} />
          创建账号
        </Button>
      </AdminHeading>
      <div className="admin-filters">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="搜索儿童账号"
            placeholder="搜索账号或昵称"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          aria-label="账号状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="disabled">已禁用</option>
        </select>
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
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>儿童</th>
                  <th>登录账号</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="table-user">
                        <span className="avatar">{avatars[user.avatar_key]}</span>
                        <strong>{user.display_name}</strong>
                      </span>
                    </td>
                    <td>{user.username}</td>
                    <td>
                      <span className={`tag ${user.status === 'disabled' ? 'neutral' : ''}`}>
                        {user.status === 'active' ? '正常' : '已禁用'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button variant="ghost" onClick={() => setViewing(user)}>
                          <Eye size={16} />
                          记录
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(user)}>
                          <Pencil size={15} />
                          编辑
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.total && <Empty icon={<Users size={35} />} title="还没有儿童账号" />}
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </section>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? '创建儿童账号' : '编辑儿童账号'}
      >
        {editing && (
          <UserEditor
            key={editing === 'new' ? 'new' : editing.id}
            user={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
      {viewing && (
        <UserRecords
          key={viewing.id}
          user={viewing}
          today={today}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

function UserEditor({ user, onClose }: { user?: User; onClose: () => void }) {
  const client = useQueryClient()
  const [username, setUsername] = useState(user?.username ?? '')
  const [name, setName] = useState(user?.display_name ?? '')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState(user?.avatar_key ?? 'fox')
  const [status, setStatus] = useState(user?.status ?? 'active')
  const save = useMutation({
    mutationFn: () =>
      api(user ? `/admin/users/${user.id}` : '/admin/users', {
        method: user ? 'PATCH' : 'POST',
        body: user
          ? { display_name: name, avatar_key: avatar, status, ...(password ? { password } : {}) }
          : { username, display_name: name, password, avatar_key: avatar },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin'] })
      onClose()
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
        登录账号
        <input
          required
          disabled={!!user}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          pattern="[a-zA-Z0-9_.\-]{3,40}"
          minLength={3}
          maxLength={40}
          placeholder="3～40位字母、数字、点、下划线或横线"
        />
      </label>
      <label>
        儿童昵称
        <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <fieldset>
        <legend>选择头像</legend>
        <div className="avatar-options">
          {Object.entries(avatars).map(([key, emoji]) => (
            <button
              type="button"
              key={key}
              className={avatar === key ? 'selected' : ''}
              aria-label={key}
              aria-pressed={avatar === key}
              onClick={() => setAvatar(key)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        {user ? '重置密码（不修改请留空）' : '登录密码'}
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          maxLength={128}
          required={!user}
          placeholder="至少8位"
        />
      </label>
      {user && (
        <label>
          账号状态
          <select value={status} onChange={(e) => setStatus(e.target.value as User['status'])}>
            <option value="active">正常</option>
            <option value="disabled">禁用</option>
          </select>
        </label>
      )}
      {user && <p className="form-hint">重置密码或更改账号状态后，该儿童需要重新登录。</p>}
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <Button type="submit" disabled={save.isPending}>
        {save.isPending ? '正在保存…' : user ? '保存修改' : '创建儿童账号'}
      </Button>
    </form>
  )
}

function UserRecords({ user, today, onClose }: { user: User; today: string; onClose: () => void }) {
  const [date, setDate] = useState(today)
  const [tab, setTab] = useState('tasks')
  const days = useQuery({
    queryKey: ['admin', 'user-days', user.id, date],
    queryFn: () => api<{ days: Day[] }>(`/admin/users/${user.id}/days?from=${date}&to=${date}`),
  })
  const cards = useQuery({
    queryKey: ['admin', 'user-collection', user.id],
    queryFn: () => api<Page<OwnedCard>>(`/admin/users/${user.id}/collection?page_size=100`),
  })
  const draws = useQuery({
    queryKey: ['admin', 'user-draws', user.id],
    queryFn: () => api<Page<AdminDraw>>(`/admin/draw-sessions?user_id=${user.id}&page_size=100`),
  })
  return (
    <Modal open onClose={onClose} title={`${user.display_name}的成长记录`} wide>
      <div className="filter-tabs">
        {[
          ['tasks', '任务记录'],
          ['cards', '卡片收藏'],
          ['draws', '抽卡记录'],
        ].map(([key, name]) => (
          <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>
            {name}
          </button>
        ))}
      </div>
      {tab === 'tasks' && (
        <>
          <label className="inline-field">
            日期
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value)
              }}
            />
          </label>
          {days.isPending ? (
            <Loading />
          ) : days.error ? (
            <ErrorState error={days.error} />
          ) : (
            <>
              {days.data.days[0].tasks.map((task) => (
                <TaskRow task={task} key={task.id} />
              ))}
              {!days.data.days[0].tasks.length && (
                <Empty icon={<Sprout />} title="这一天没有任务" />
              )}
              <p className="form-hint">
                奖励状态：
                {
                  { locked: '未解锁', available: '待领取', drawing: '选卡中', claimed: '已领取' }[
                    days.data.days[0].reward.state
                  ]
                }
              </p>
            </>
          )}
        </>
      )}
      {tab === 'cards' &&
        (cards.isPending ? (
          <Loading />
        ) : cards.error ? (
          <ErrorState error={cards.error} />
        ) : (
          <div className="admin-card-preview">
            {cards.data.items.map((card) => (
              <div key={card.id}>
                <img src={card.image_url} alt={card.name} />
                <strong>{card.name}</strong>
                <span>×{card.quantity}</span>
              </div>
            ))}
            {!cards.data.total && <p className="muted">还没有收藏卡片。</p>}
          </div>
        ))}
      {tab === 'draws' &&
        (draws.isPending ? (
          <Loading />
        ) : draws.error ? (
          <ErrorState error={draws.error} />
        ) : (
          <DrawRecords items={draws.data.items} />
        ))}
    </Modal>
  )
}

type ContentKind = 'card-categories' | 'card-sets' | 'cards'
type ContentRow = (CardCategory | CardSet | Card) & { id: string }
const contentNames: Record<ContentKind, string> = {
  'card-categories': '分类',
  'card-sets': '卡片集',
  cards: '卡片',
}

function ContentPage() {
  const [kind, setKind] = useState<ContentKind>('cards')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ContentRow | 'new' | null>(null)
  const client = useQueryClient()
  const toast = useToast()
  const query = useQuery({
    queryKey: ['admin', 'content', kind, page, q],
    queryFn: ({ signal }) =>
      api<Page<ContentRow>>(`/admin/${kind}?page=${page}&q=${encodeURIComponent(q)}`, { signal }),
  })
  const archive = useMutation({
    mutationFn: (id: string) => api(`/admin/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'content'] })
    },
    onError: (e) => toast(e.message),
  })
  return (
    <>
      <AdminHeading
        eyebrow="A WORLD OF LITTLE WONDERS"
        title="卡片内容"
        description="分类 → 卡片集 → 卡片，构建孩子的知识小世界。"
      >
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} />
          新增{contentNames[kind]}
        </Button>
      </AdminHeading>
      <div className="admin-content-tools">
        <div className="filter-tabs">
          {(['card-categories', 'card-sets', 'cards'] as const).map((key) => (
            <button
              className={kind === key ? 'active' : ''}
              key={key}
              onClick={() => {
                setKind(key)
                setPage(1)
                setQ('')
              }}
            >
              {contentNames[key]}管理
            </button>
          ))}
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索内容"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="搜索名称"
          />
        </div>
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
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  {kind === 'cards' && (
                    <>
                      <th>卡片集</th>
                      <th>稀有度 / 权重</th>
                    </>
                  )}
                  <th>排序</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="content-name">
                        {'image_url' in row && <img src={row.image_url} alt="" />}
                        <strong>{row.name}</strong>
                      </div>
                    </td>
                    {'rarity' in row && (
                      <>
                        <td>{row.set_name}</td>
                        <td>
                          <span className={`rarity-tag rarity-${row.rarity}`}>
                            {rarityNames[row.rarity]}
                          </span>{' '}
                          / {row.draw_weight}
                        </td>
                      </>
                    )}
                    <td>{row.sort_order}</td>
                    <td>
                      <span className={`tag ${row.status === 'archived' ? 'neutral' : ''}`}>
                        {row.status === 'active' ? '启用' : '已归档'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button variant="ghost" onClick={() => setEditing(row)}>
                          <Pencil size={15} />
                          编辑
                        </Button>
                        {row.status === 'active' && (
                          <Button
                            variant="ghost"
                            disabled={archive.isPending}
                            onClick={() => {
                              if (confirm(`归档“${row.name}”？历史收藏和已生成候选会保留。`))
                                archive.mutate(row.id)
                            }}
                          >
                            归档
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.total && (
            <Empty icon={<BookOpen size={35} />} title={`还没有${contentNames[kind]}`} />
          )}
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </section>
      )}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${editing === 'new' ? '新增' : '编辑'}${contentNames[kind]}`}
      >
        {editing && (
          <ContentEditor
            key={`${kind}-${editing === 'new' ? 'new' : editing.id}`}
            kind={kind}
            row={editing === 'new' ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  )
}

type ContentDraft = {
  name: string
  description: string
  status: string
  sort_order: number
  category_id: string
  set_id: string
  image_asset_id: string
  cover_asset_id: string | null
  rarity: string
  draw_weight: number
}

function ContentEditor({
  kind,
  row,
  onClose,
}: {
  kind: ContentKind
  row?: ContentRow
  onClose: () => void
}) {
  const client = useQueryClient()
  const [value, setValue] = useState<ContentDraft>({
    name: '',
    description: '',
    status: 'active',
    sort_order: 0,
    category_id: '',
    set_id: '',
    image_asset_id: '',
    cover_asset_id: null,
    rarity: 'common',
    draw_weight: 10,
    ...row,
  })
  const [preview, setPreview] = useState(
    row && 'image_url' in row ? row.image_url : row && 'cover_url' in row ? row.cover_url : null,
  )
  const categories = useQuery({
    queryKey: ['admin', 'content', 'category-options'],
    queryFn: () => api<Page<CardCategory>>('/admin/card-categories?page_size=100'),
  })
  const sets = useQuery({
    queryKey: ['admin', 'content', 'set-options'],
    queryFn: () => api<Page<CardSet>>('/admin/card-sets?page_size=100'),
  })
  const field = <K extends keyof ContentDraft>(key: K, val: ContentDraft[K]) =>
    setValue((v) => ({ ...v, [key]: val }))
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api<{ id: string; url: string }>('/admin/media', { method: 'POST', body })
    },
    onSuccess: (asset) => {
      field(kind === 'cards' ? 'image_asset_id' : 'cover_asset_id', asset.id)
      setPreview(asset.url)
    },
  })
  const save = useMutation({
    mutationFn: () => {
      const base = { name: value.name, status: value.status, sort_order: value.sort_order }
      const body =
        kind === 'card-categories'
          ? base
          : kind === 'card-sets'
            ? {
                ...base,
                description: value.description,
                category_id: value.category_id,
                cover_asset_id: value.cover_asset_id,
              }
            : {
                ...base,
                description: value.description,
                set_id: value.set_id,
                image_asset_id: value.image_asset_id,
                rarity: value.rarity,
                draw_weight: value.draw_weight,
              }
      return api(`/admin/${kind}${row ? `/${row.id}` : ''}`, {
        method: row ? 'PATCH' : 'POST',
        body,
      })
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['admin', 'content'] })
      onClose()
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
        名称
        <input
          required
          maxLength={60}
          value={value.name}
          onChange={(e) => field('name', e.target.value)}
        />
      </label>
      {kind === 'card-sets' && (
        <label>
          所属分类
          <select
            required
            value={value.category_id}
            onChange={(e) => field('category_id', e.target.value)}
          >
            <option value="">请选择分类</option>
            {categories.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === 'cards' && (
        <label>
          所属卡片集
          <select required value={value.set_id} onChange={(e) => field('set_id', e.target.value)}>
            <option value="">请选择卡片集</option>
            {sets.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind !== 'card-categories' && (
        <>
          <label>
            简介
            <textarea
              rows={3}
              maxLength={1000}
              value={value.description}
              onChange={(e) => field('description', e.target.value)}
            />
          </label>
          <label className="upload-field">
            <Upload size={19} />
            {upload.isPending
              ? '正在处理图片…'
              : kind === 'cards'
                ? '上传卡片图片'
                : '上传封面（选填）'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={upload.isPending}
              onChange={(e) => {
                if (e.target.files?.[0]) upload.mutate(e.target.files[0])
              }}
            />
          </label>
          {preview && <img className="upload-preview" src={preview} alt="图片预览" />}
          <p className="form-hint">JPEG、PNG 或 WebP，最大5MB、1600万像素。</p>
          {upload.error && <p className="form-error">{upload.error.message}</p>}
        </>
      )}
      {kind === 'cards' && (
        <div className="form-row">
          <label>
            稀有度
            <select value={value.rarity} onChange={(e) => field('rarity', e.target.value)}>
              {Object.entries(rarityNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            抽取权重
            <input
              type="number"
              min={1}
              max={10000}
              required
              value={value.draw_weight}
              onChange={(e) => field('draw_weight', Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <div className="form-row">
        <label>
          排序
          <input
            type="number"
            value={value.sort_order}
            onChange={(e) => field('sort_order', Number(e.target.value))}
          />
        </label>
        <label>
          状态
          <select value={value.status} onChange={(e) => field('status', e.target.value)}>
            <option value="active">启用</option>
            <option value="archived">归档</option>
          </select>
        </label>
      </div>
      {save.error && (
        <p className="form-error" role="alert">
          {save.error.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={save.isPending || upload.isPending || (kind === 'cards' && !value.image_asset_id)}
      >
        {save.isPending ? '正在保存…' : '保存内容'}
      </Button>
    </form>
  )
}

function DrawsPage({ today }: { today: string }) {
  const [page, setPage] = useState(1)
  const [from, setFrom] = useState(shiftDate(today, -29))
  const [to, setTo] = useState(today)
  const [userId, setUserId] = useState('')
  const [state, setState] = useState('')
  const users = useQuery({
    queryKey: ['admin', 'users', 'options'],
    queryFn: () => api<Page<User>>('/admin/users?page_size=100'),
  })
  const query = useQuery({
    queryKey: ['admin', 'draws', page, from, to, userId, state],
    queryFn: ({ signal }) =>
      api<Page<AdminDraw>>(
        `/admin/draw-sessions?page=${page}&from=${from}&to=${to}${userId ? `&user_id=${userId}` : ''}${state ? `&state=${state}` : ''}`,
        { signal },
      ),
  })
  return (
    <>
      <AdminHeading
        eyebrow="EVERY REWARD HAS A STORY"
        title="抽卡记录"
        description="查看固定候选、最终选择和发放状态。"
      />
      <div className="admin-filters">
        <label>
          从
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>
          至
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <select
          aria-label="筛选儿童"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部儿童</option>
          {users.data?.items.map((u) => (
            <option key={u.id} value={u.id}>
              {u.display_name}
            </option>
          ))}
        </select>
        <select
          aria-label="抽卡状态"
          value={state}
          onChange={(e) => {
            setState(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部状态</option>
          <option value="open">选卡中</option>
          <option value="claimed">已领取</option>
        </select>
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
          <DrawRecords items={query.data.items} />
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </section>
      )}
    </>
  )
}

function DrawRecords({ items }: { items: AdminDraw[] }) {
  if (!items.length) return <Empty icon={<Gift size={38} />} title="还没有抽卡记录" />
  return (
    <div className="draw-records">
      {items.map((draw) => (
        <article className="draw-record" key={draw.id}>
          <header>
            <div>
              <strong>{draw.user.display_name}</strong>
              <span>{draw.business_date} 的奖励</span>
            </div>
            <span className={`tag ${draw.state === 'open' ? 'neutral' : ''}`}>
              {draw.state === 'open' ? '选卡中' : '已领取'}
            </span>
          </header>
          <div className="record-options">
            {draw.options.map((option) => (
              <div
                className={draw.selected_option_id === option.id ? 'selected' : ''}
                key={option.id}
              >
                <img src={option.card.image_url} alt={option.card.name} />
                <span>{option.card.name}</span>
                {draw.selected_option_id === option.id && <span className="tag">已选择</span>}
              </div>
            ))}
          </div>
          {draw.completed_at && (
            <p className="form-hint">
              实际领取时间：
              {new Date(draw.completed_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
