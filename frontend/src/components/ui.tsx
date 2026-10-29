import { useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { clsx, type ClassValue } from 'clsx'
import { LoaderCircle, X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      ghost: 'btn-ghost',
      danger: 'btn-danger',
    },
  },
  defaultVariants: { variant: 'primary' },
})

export function Button({
  asChild,
  variant,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  wide?: boolean
}) {
  const child = !useLocation().pathname.startsWith('/admin')
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={cn('dialog', wide && 'dialog-wide', child && 'child-dialog')}>
          <header className="dialog-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description className={description ? 'muted' : 'sr-only'}>
                {description ?? title}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="icon-btn" aria-label="关闭">
                <X size={20} />
              </button>
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Loading({ label = '正在准备…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={24} />
      {label}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  return (
    <div className="error-state" role="alert">
      <p>{error?.message ?? '暂时没有连接上'}</p>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          再试一次
        </Button>
      )}
    </div>
  )
}

export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  )
}

export function Pager({
  page,
  total,
  pageSize = 20,
  onChange,
}: {
  page: number
  total: number
  pageSize?: number
  onChange: (page: number) => void
}) {
  if (total <= pageSize) return null
  return (
    <div className="pager">
      <Button variant="secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span>
        {page} / {Math.ceil(total / pageSize)}
      </span>
      <Button
        variant="secondary"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </Button>
    </div>
  )
}
