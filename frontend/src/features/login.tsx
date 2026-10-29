import { useMutation } from '@tanstack/react-query'
import { ArrowRight, ShieldCheck, Sprout } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import type { User } from '../api/types'
import { useAccounts } from '../app/context'
import { avatars, BunnyArt, GardenArt } from '../components/icons'
import { Button } from '../components/ui'

export function LoginForm({
  compact = false,
  admin = false,
  onSuccess,
}: {
  compact?: boolean
  admin?: boolean
  onSuccess?: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { accounts, switchAccount, refresh } = useAccounts()
  const navigate = useNavigate()
  const login = useMutation({
    mutationFn: () =>
      api<{ user: User }>(admin ? '/admin/auth/login' : '/auth/accounts', {
        method: 'POST',
        admin,
        body: { username, password },
      }),
    onSuccess: async (data) => {
      setPassword('')
      if (admin) navigate('/admin', { replace: true })
      else {
        await refresh()
        switchAccount(data.user.id)
        navigate('/')
        onSuccess?.()
      }
    },
  })
  const form = (
    <form
      className="form-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        login.mutate()
      }}
    >
      <label>
        账号
        <input
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={40}
          placeholder="请输入账号"
        />
      </label>
      <label>
        密码
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={128}
          placeholder="请输入密码"
        />
      </label>
      {login.error && (
        <p className="form-error" role="alert">
          {login.error.message}
        </p>
      )}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? '正在登录…' : admin ? '登录管理后台' : '开始今天的小冒险'}
        <ArrowRight size={18} />
      </Button>
      <p className="form-hint">
        {admin ? '仅供应用管理员使用' : '账号由应用管理员创建。忘记密码时，请大人联系管理员。'}
      </p>
    </form>
  )
  if (compact) return form
  if (!admin)
    return (
      <main className="child-login">
        <div className="child-login-brand">
          <Sprout size={22} />
          小小成长家
        </div>
        <section className="child-login-card">
          <div className="child-login-art">
            <BunnyArt />
          </div>
          <h1>小目标，大冒险</h1>
          <p className="child-login-intro">做完今天的小任务，认识新的卡片朋友。</p>
          {form}
          {accounts.length > 0 && (
            <div className="login-accounts">
              {accounts.map((u) => (
                <Button
                  key={u.id}
                  variant="secondary"
                  onClick={() => {
                    switchAccount(u.id)
                    navigate('/')
                  }}
                >
                  {avatars[u.avatar_key]} {u.display_name}
                </Button>
              ))}
            </div>
          )}
        </section>
        <Link className="child-admin-link" to="/admin/login">
          应用管理员入口
        </Link>
      </main>
    )

  return (
    <main className="login-screen">
      <div className="login-brand">
        <Sprout /> 小小成长家
      </div>
      <section className="login-card">
        <div className="login-art">
          <GardenArt />
          <span className="eyebrow">ONE LITTLE STEP AT A TIME</span>
          <h1>
            每天进步
            <br />
            一点点。
          </h1>
          <p>
            完成小任务，收集大世界。
            <br />
            属于你的成长故事，从今天开始。
          </p>
        </div>
        <div className="login-form">
          <span className="tag">
            {admin ? <ShieldCheck size={15} /> : <Sprout size={15} />}
            {admin ? '应用管理' : '欢迎回来'}
          </span>
          <h2>{admin ? '管理员登录' : '你好，小小成长家'}</h2>
          <p className="muted">
            {admin ? '管理内容，照看每一份成长记录。' : '准备好收集今天的小小成就了吗？'}
          </p>
          {form}
          {!admin && accounts.length > 0 && (
            <div className="login-accounts">
              {accounts.map((u) => (
                <Button
                  key={u.id}
                  variant="secondary"
                  onClick={() => {
                    switchAccount(u.id)
                    navigate('/')
                  }}
                >
                  {avatars[u.avatar_key]} {u.display_name}
                </Button>
              ))}
            </div>
          )}
          <Link className="subtle-link" to={admin ? '/' : '/admin/login'}>
            {admin ? '返回儿童应用' : '应用管理员入口'}
          </Link>
        </div>
      </section>
      <p className="login-bottom">🌱 一点一滴，都会长大。</p>
    </main>
  )
}
