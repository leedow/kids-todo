import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Providers } from './app/context'
import { ChildLayout } from './app/layout'
import { AdminApp } from './features/admin'
import { CalendarPage } from './features/calendar'
import { CollectionPage } from './features/collection'
import { LoginForm } from './features/login'
import { RewardsPage } from './features/rewards'
import { TasksPage } from './features/tasks'
import './styles/index.css'
import './styles/child-app.css'
import './styles/calendar-workspace.css'

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15000 }, mutations: { retry: false } },
})
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Providers>
          <Routes>
            <Route path="/admin/login" element={<LoginForm admin />} />
            <Route path="/admin/*" element={<AdminApp />} />
            <Route element={<ChildLayout />}>
              <Route index element={<Navigate to="/calendar?mode=today" replace />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="collection" element={<CollectionPage />} />
              <Route path="rewards" element={<RewardsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Providers>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => console.warn('离线提示暂时不可用'))
  })
}
