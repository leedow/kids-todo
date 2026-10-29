import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  Gift,
  LogOut,
  Plus,
  Sparkles,
  Sun,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { avatars } from '../components/icons'
import { Button, Loading, Modal } from '../components/ui'
import { useAccounts, useMe, useToast } from './context'
import { LoginForm } from '../features/login'

export function ChildLayout() {
  const { active, activeId, accounts, loading, switchAccount, logout } = useAccounts()
  const [switching, setSwitching] = useState(false)
  const [adding, setAdding] = useState(false)
  const toast = useToast()
  const me = useMe()
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname, activeId])
  if (loading) return <Loading />
  if (!active) return <LoginForm />
  return (
    <div className="app-shell child-app">
      <header className="topbar">
        <button
          className="account-button"
          onClick={() => setSwitching(true)}
          aria-label="切换儿童账号"
        >
          <span className="avatar">{avatars[active.avatar_key] ?? '🦊'}</span>
          <span>
            {active.display_name}
            <small>我的成长空间</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <Link to="/" className="child-wordmark">
          <Sparkles size={18} />
          <span>小小成长家</span>
        </Link>
      </header>
      <main className="main-content" key={activeId}>
        <Outlet />
      </main>
      <nav className="mobile-nav" aria-label="主导航">
        <Navigation />
      </nav>
      <Modal
        open={switching}
        onClose={() => setSwitching(false)}
        title="今天是哪位成长家？"
        description="选择已登录的账号，任务和卡片也会一起切换。"
      >
        <div className="account-list">
          {accounts.map((account) => (
            <div className="account-row" key={account.id}>
              <button
                className="account-choice"
                onClick={() => {
                  switchAccount(account.id)
                  setSwitching(false)
                }}
              >
                <span className="avatar">{avatars[account.avatar_key] ?? '🦊'}</span>
                <strong>{account.display_name}</strong>
                {activeId === account.id && <span className="tag">正在使用</span>}
              </button>
              <button
                className="icon-btn"
                aria-label={`退出${account.display_name}`}
                onClick={() => {
                  if (confirm(`退出${account.display_name}？下次需要重新登录。`))
                    void logout(account.id).catch((e) => toast(e.message))
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          className="full-width"
          onClick={() => {
            setSwitching(false)
            setAdding(true)
          }}
        >
          <Plus size={18} />
          添加儿童账号
        </Button>
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="添加儿童账号">
        <LoginForm compact onSuccess={() => setAdding(false)} />
      </Modal>
      {me.error && (
        <div className="session-alert" role="alert">
          {me.error.message}
          <button
            onClick={() => {
              void logout(activeId)
                .then(() => toast('请重新登录'))
                .catch(() => {
                  void me.refetch()
                })
            }}
          >
            <X size={16} />
            重新登录
          </button>
        </div>
      )}
    </div>
  )
}

function Navigation() {
  return (
    <>
      <NavLink to="/" end aria-label="今日任务">
        <Sun size={19} />
        <span>今日</span>
      </NavLink>
      <NavLink to="/calendar" aria-label="成长日历">
        <CalendarDays size={19} />
        <span>日历</span>
      </NavLink>
      <NavLink to="/collection" aria-label="我的图鉴">
        <BookOpen size={19} />
        <span>图鉴</span>
      </NavLink>
      <NavLink to="/rewards" aria-label="我的奖励">
        <Gift size={20} />
        <span>奖励</span>
      </NavLink>
    </>
  )
}
