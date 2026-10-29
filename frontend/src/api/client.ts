export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

type Options = {
  method?: string
  body?: unknown
  accountId?: string
  admin?: boolean
  signal?: AbortSignal
}
const csrf = new Map<string, string>()
const csrfPending = new Map<string, Promise<string>>()

async function token(scope: string, force = false): Promise<string> {
  if (!force && csrf.has(scope)) return csrf.get(scope)!
  if (csrfPending.has(scope)) return csrfPending.get(scope)!
  const promise = fetch(`/api/v1/auth/csrf?scope=${scope}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) throw new ApiError('NETWORK_ERROR', '暂时无法连接，请重试', response.status)
      const result = await response.json()
      csrf.set(scope, result.csrf_token)
      return result.csrf_token as string
    })
    .finally(() => csrfPending.delete(scope))
  csrfPending.set(scope, promise)
  return promise
}

export async function api<T>(path: string, options: Options = {}, retried = false): Promise<T> {
  const method = options.method ?? 'GET'
  const scope = options.admin || path.startsWith('/admin') ? 'admin' : 'child'
  const headers: Record<string, string> = {}
  if (options.accountId) headers['X-Account-ID'] = options.accountId
  if (method !== 'GET') headers['X-CSRF-Token'] = await token(scope)
  const isForm = options.body instanceof FormData
  if (options.body !== undefined && !isForm) headers['Content-Type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('NETWORK_ERROR', '网络暂时没连上，请稍后重试', 0)
  }
  if (response.status === 204) return undefined as T
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (result.error?.code === 'CSRF_INVALID' && !retried) {
      await token(scope, true)
      return api<T>(path, options, true)
    }
    throw new ApiError(
      result.error?.code ?? 'SERVER_ERROR',
      result.error?.message ?? '暂时无法完成，请重试',
      response.status,
    )
  }
  if (result.csrf_token) csrf.set(scope, result.csrf_token)
  return result as T
}
