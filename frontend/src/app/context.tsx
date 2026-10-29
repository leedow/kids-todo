import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { Me, User } from '../api/types'

type AccountState = {
  accounts: User[]
  activeId: string
  active: User | undefined
  loading: boolean
  switchAccount: (id: string) => void
  refresh: () => Promise<unknown>
  logout: (id: string) => Promise<void>
}
const AccountContext = createContext<AccountState | null>(null)
const ToastContext = createContext<(message: string) => void>(() => {})

export function Providers({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const [selected, setSelected] = useState(() => sessionStorage.getItem('active-child') ?? '')
  const [message, setMessage] = useState('')
  const query = useQuery({
    queryKey: ['accounts'],
    queryFn: ({ signal }) => api<{ accounts: User[] }>('/auth/accounts', { signal }),
  })
  const accounts = query.data?.accounts ?? []
  const active = accounts.find((u) => u.id === selected) ?? accounts[0]
  const activeId = active?.id ?? ''
  const switchAccount = useCallback(
    (id: string) => {
      void client.cancelQueries({ queryKey: ['child', selected] })
      setSelected(id)
      sessionStorage.setItem('active-child', id)
    },
    [client, selected],
  )
  useEffect(() => {
    if (activeId && activeId !== selected) {
      setSelected(activeId)
      sessionStorage.setItem('active-child', activeId)
    }
  }, [activeId, selected])
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])
  const logout = async (id: string) => {
    try {
      await api(`/auth/accounts/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (!(error instanceof ApiError) || ![401, 403, 404].includes(error.status)) throw error
    }
    client.removeQueries({ queryKey: ['child', id] })
    await query.refetch()
  }
  return (
    <ToastContext value={setMessage}>
      <AccountContext
        value={{
          accounts,
          activeId,
          active,
          loading: query.isPending,
          switchAccount,
          refresh: query.refetch,
          logout,
        }}
      >
        {children}
      </AccountContext>
      {message && (
        <div className="toast" role="status" onClick={() => setMessage('')}>
          {message}
        </div>
      )}
    </ToastContext>
  )
}

export function useAccounts() {
  const state = useContext(AccountContext)
  if (!state) throw new Error('AccountProvider missing')
  return state
}
export const useToast = () => useContext(ToastContext)
export function useMe() {
  const { activeId } = useAccounts()
  return useQuery({
    queryKey: ['child', activeId, 'me'],
    enabled: !!activeId,
    queryFn: ({ signal }) => api<Me>('/me', { accountId: activeId, signal }),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })
}

export const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' },
) =>
  new Date(`${date}T12:00:00+08:00`).toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    ...options,
  })
export const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
