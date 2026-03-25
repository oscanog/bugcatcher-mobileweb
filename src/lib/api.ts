const DEFAULT_API_BASE_PATH = '/api/v1'
const AUTH_REFRESH_SKIP_PATHS = new Set(['/auth/login', '/auth/me', '/auth/refresh'])

export const API_BASE_PATH = (import.meta.env.VITE_API_BASE_PATH?.trim() || DEFAULT_API_BASE_PATH).replace(/\/+$/, '')

export interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

type AccessTokenRefreshHandler = () => Promise<string | null>

let accessTokenRefreshHandler: AccessTokenRefreshHandler | null = null

function stripByteOrderMark(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^ï»¿/, '')
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = stripByteOrderMark(await response.text())
  if (!text) {
    return { ok: false, error: { message: 'The server returned an empty response. Please try again.' } }
  }

  try {
    return JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new ApiError(response.status, 'The server returned an unexpected response. Please try again.')
  }
}

function buildHeaders(init: RequestInit, accessToken?: string): Headers {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

function canRetryWithRefreshedToken(path: string, status: number, accessToken?: string): boolean {
  if (status !== 401 || !accessToken || !accessTokenRefreshHandler) {
    return false
  }

  const normalizedPath = path.split('?')[0]
  return !AUTH_REFRESH_SKIP_PATHS.has(normalizedPath)
}

async function sendJsonRequest(path: string, init: RequestInit, accessToken?: string): Promise<Response> {
  return fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    headers: buildHeaders(init, accessToken),
  })
}

export function registerAccessTokenRefreshHandler(handler: AccessTokenRefreshHandler | null) {
  accessTokenRefreshHandler = handler
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  let response = await sendJsonRequest(path, init, accessToken)

  if (canRetryWithRefreshedToken(path, response.status, accessToken)) {
    const refreshedAccessToken = await accessTokenRefreshHandler?.()
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await sendJsonRequest(path, init, refreshedAccessToken)
    }
  }

  const envelope = await parseEnvelope<T>(response)
  if (!response.ok || !envelope.ok || envelope.data === undefined) {
    throw new ApiError(
      response.status,
      envelope.error?.message || 'Request failed.',
      envelope.error?.code,
    )
  }

  return envelope.data
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Unable to reach the server. Check your connection and try again.'
  }
  return error instanceof Error && error.message ? error.message : fallback
}

export function withOrgQuery(path: string, orgId?: number | null): string {
  if (!orgId || orgId <= 0) {
    return path
  }
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}org_id=${orgId}`
}
