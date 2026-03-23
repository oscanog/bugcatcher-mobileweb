const DEFAULT_API_BASE_PATH = '/api/v1'

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

function stripByteOrderMark(value: string): string {
  return value.replace(/^\uFEFF/, '').replace(/^ï»¿/, '')
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = stripByteOrderMark(await response.text())
  if (!text) {
    return { ok: false, error: { message: 'Empty response.' } }
  }

  try {
    return JSON.parse(text) as ApiEnvelope<T>
  } catch {
    throw new ApiError(response.status, `Expected JSON response but received: ${text.slice(0, 180)}`)
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_PATH}${path}`, {
    ...init,
    headers,
  })

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
  return error instanceof Error && error.message ? error.message : fallback
}

export function withOrgQuery(path: string, orgId: number): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}org_id=${orgId}`
}
