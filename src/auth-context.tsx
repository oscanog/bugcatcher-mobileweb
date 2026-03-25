/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { API_BASE_PATH, ApiError, getErrorMessage, registerAccessTokenRefreshHandler, requestJson } from './lib/api'
import { getActiveMembership, getDefaultAppPath, hasOrgRole, hasSystemRole } from './lib/access'

export type SystemRole = 'super_admin' | 'admin' | 'user'
export type OrgRole =
  | 'owner'
  | 'member'
  | 'Project Manager'
  | 'QA Lead'
  | 'Senior Developer'
  | 'Senior QA'
  | 'Junior Developer'
  | 'QA Tester'

export interface Membership {
  org_id: number
  org_name: string
  role: OrgRole
  is_owner: boolean
}

export interface AuthUser {
  id: number
  username: string
  email: string
  role: SystemRole
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  refreshExpiresAt: number
  activeOrgId: number
}

export interface AuthSession extends StoredTokens {
  user: AuthUser
  memberships: Membership[]
}

interface AuthActionResult {
  ok: boolean
  message?: string
  error?: string
}

interface LoginPayload {
  email: string
  password: string
  activeOrgId?: number
}

interface SignupPayload {
  username: string
  email: string
  password: string
  confirmPassword: string
}

interface ResetPasswordPayload {
  email: string
  password: string
  confirmPassword: string
}

interface AuthContextValue {
  status: 'bootstrapping' | 'anonymous' | 'authenticated'
  session: AuthSession | null
  isBootstrapping: boolean
  isAuthenticated: boolean
  user: AuthUser | null
  memberships: Membership[]
  activeMembership: Membership | null
  activeOrgId: number
  hasActiveOrg: boolean
  defaultAppPath: string
  login: (payload: LoginPayload) => Promise<AuthActionResult>
  logout: () => Promise<void>
  signup: (payload: SignupPayload) => Promise<AuthActionResult>
  requestOtp: (email: string) => Promise<AuthActionResult>
  resendOtp: (email: string) => Promise<AuthActionResult>
  verifyOtp: (email: string, otp: string) => Promise<AuthActionResult>
  resetPassword: (payload: ResetPasswordPayload) => Promise<AuthActionResult>
  refreshSession: () => Promise<boolean>
  setActiveOrg: (orgId: number) => Promise<AuthActionResult>
}

interface LoginResponse {
  user: AuthUser
  active_org_id: number
  tokens: {
    access_token: string
    access_expires_in: number
    refresh_token: string
    refresh_expires_in: number
  }
}

interface MeResponse {
  user: AuthUser
  active_org_id: number
  memberships: Membership[]
}

interface RefreshResponse {
  active_org_id: number
  tokens: {
    access_token: string
    access_expires_in: number
    refresh_token: string
    refresh_expires_in: number
  }
}

const AUTH_STORAGE_KEY = 'bugcatcher-mobileweb-auth-session'
export { API_BASE_PATH, getDefaultAppPath, hasOrgRole, hasSystemRole }

const AuthContext = createContext<AuthContextValue | null>(null)

function normalizeRole(value: string): SystemRole {
  return value === 'super_admin' || value === 'admin' ? value : 'user'
}

function readStoredTokens(): StoredTokens | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredTokens>
    if (
      !parsed.accessToken ||
      !parsed.refreshToken ||
      typeof parsed.accessExpiresAt !== 'number' ||
      typeof parsed.refreshExpiresAt !== 'number'
    ) {
      return null
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      accessExpiresAt: parsed.accessExpiresAt,
      refreshExpiresAt: parsed.refreshExpiresAt,
      activeOrgId: typeof parsed.activeOrgId === 'number' ? parsed.activeOrgId : 0,
    }
  } catch {
    return null
  }
}

function persistStoredTokens(session: StoredTokens | null) {
  if (typeof window === 'undefined') {
    return
  }

  if (!session) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    return
  }

  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

function buildStoredTokens(payload: LoginResponse['tokens'] | RefreshResponse['tokens'], activeOrgId: number): StoredTokens {
  const now = Date.now()
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessExpiresAt: now + payload.access_expires_in * 1000,
    refreshExpiresAt: now + payload.refresh_expires_in * 1000,
    activeOrgId,
  }
}

function buildSession(me: MeResponse, tokens: StoredTokens): AuthSession {
  return {
    ...tokens,
    activeOrgId: me.active_org_id,
    user: {
      ...me.user,
      role: normalizeRole(me.user.role),
    },
    memberships: me.memberships,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthContextValue['status']>('bootstrapping')
  const [session, setSession] = useState<AuthSession | null>(null)
  const refreshPromiseRef = useRef<Promise<AuthSession | null> | null>(null)

  const applySession = useCallback((nextSession: AuthSession | null) => {
    setSession(nextSession)
    persistStoredTokens(nextSession)
    setStatus(nextSession ? 'authenticated' : 'anonymous')
  }, [])

  const hydrateSession = useCallback(async (storedTokens: StoredTokens): Promise<AuthSession> => {
    try {
      const me = await requestJson<MeResponse>('/auth/me', { method: 'GET' }, storedTokens.accessToken)
      return buildSession(me, storedTokens)
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error
      }
    }

    const refreshed = await requestJson<RefreshResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: storedTokens.refreshToken }),
    })
    const nextTokens = buildStoredTokens(refreshed.tokens, refreshed.active_org_id)
    const me = await requestJson<MeResponse>('/auth/me', { method: 'GET' }, nextTokens.accessToken)
    return buildSession(me, nextTokens)
  }, [])

  const refreshSessionInternal = useCallback(async (): Promise<AuthSession | null> => {
    const storedTokens = session ?? readStoredTokens()
    if (!storedTokens) {
      applySession(null)
      return null
    }

    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        try {
          const refreshedSession = await hydrateSession(storedTokens)
          applySession(refreshedSession)
          return refreshedSession
        } catch {
          applySession(null)
          return null
        } finally {
          refreshPromiseRef.current = null
        }
      })()
    }

    return refreshPromiseRef.current
  }, [applySession, hydrateSession, session])

  useEffect(() => {
    const bootstrap = async () => {
      const storedTokens = readStoredTokens()
      if (!storedTokens) {
        setStatus('anonymous')
        return
      }

      try {
        const hydratedSession = await hydrateSession(storedTokens)
        applySession(hydratedSession)
      } catch {
        applySession(null)
      }
    }

    void bootstrap()
  }, [applySession, hydrateSession])

  useEffect(() => {
    registerAccessTokenRefreshHandler(async () => {
      const refreshedSession = await refreshSessionInternal()
      return refreshedSession?.accessToken ?? null
    })

    return () => {
      registerAccessTokenRefreshHandler(null)
    }
  }, [refreshSessionInternal])

  const activeMembership = getActiveMembership(session)
  const value: AuthContextValue = {
    status,
    session,
    isBootstrapping: status === 'bootstrapping',
    isAuthenticated: Boolean(session),
    user: session?.user ?? null,
    memberships: session?.memberships ?? [],
    activeMembership,
    activeOrgId: session?.activeOrgId ?? 0,
    hasActiveOrg: Boolean(activeMembership),
    defaultAppPath: getDefaultAppPath(session),
    login: async ({ email, password, activeOrgId }) => {
      try {
        const login = await requestJson<LoginResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            ...(activeOrgId ? { active_org_id: activeOrgId } : {}),
          }),
        })
        const tokens = buildStoredTokens(login.tokens, login.active_org_id)
        const me = await requestJson<MeResponse>('/auth/me', { method: 'GET' }, tokens.accessToken)
        applySession(buildSession(me, tokens))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to login.') }
      }
    },
    logout: async () => {
      const accessToken = session?.accessToken

      try {
        if (accessToken) {
          await requestJson<{ logged_out: boolean }>(
            '/auth/logout',
            {
              method: 'POST',
              body: JSON.stringify({}),
            },
            accessToken,
          )
        }
      } catch {
        // Clear local auth even if the server request fails.
      }

      applySession(null)
    },
    signup: async ({ username, email, password, confirmPassword }) => {
      try {
        const response = await requestJson<{ message: string }>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            email,
            password,
            confirm_password: confirmPassword,
          }),
        })
        return { ok: true, message: response.message }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to create account.') }
      }
    },
    requestOtp: async (email) => {
      try {
        const response = await requestJson<{ message: string }>('/auth/forgot/request-otp', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
        return { ok: true, message: response.message }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to request reset code.') }
      }
    },
    resendOtp: async (email) => {
      try {
        const response = await requestJson<{ message: string }>('/auth/forgot/resend-otp', {
          method: 'POST',
          body: JSON.stringify({ email }),
        })
        return { ok: true, message: response.message }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to resend reset code.') }
      }
    },
    verifyOtp: async (email, otp) => {
      try {
        const response = await requestJson<{ message: string }>('/auth/forgot/verify-otp', {
          method: 'POST',
          body: JSON.stringify({ email, otp }),
        })
        return { ok: true, message: response.message }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to verify reset code.') }
      }
    },
    resetPassword: async ({ email, password, confirmPassword }) => {
      try {
        const response = await requestJson<{ message: string }>('/auth/forgot/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            confirm_password: confirmPassword,
          }),
        })
        return { ok: true, message: response.message }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to reset password.') }
      }
    },
    refreshSession: async () => {
      const refreshedSession = await refreshSessionInternal()
      return Boolean(refreshedSession)
    },
    setActiveOrg: async (orgId) => {
      if (!session) {
        return { ok: false, error: 'Authentication required.' }
      }

      try {
        const response = await requestJson<RefreshResponse>(
          '/session/active-org',
          {
            method: 'PUT',
            body: JSON.stringify({ org_id: orgId }),
          },
          session.accessToken,
        )
        const tokens = buildStoredTokens(response.tokens, response.active_org_id)
        const me = await requestJson<MeResponse>('/auth/me', { method: 'GET' }, tokens.accessToken)
        applySession(buildSession(me, tokens))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: getErrorMessage(error, 'Unable to change active organization.') }
      }
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
