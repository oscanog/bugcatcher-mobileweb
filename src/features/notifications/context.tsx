/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth-context'
import { fetchChecklistItem } from '../checklist/api'
import { normalizeNotificationDestination } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  requestNotificationSocketConnection,
  type NotificationRecord,
} from './api'
import {
  buildNotificationsSocketUrl,
  parseNotificationRealtimeEvent,
  type NotificationConnectionState,
  upsertNotificationRecord,
} from './realtime'

const NOTIFICATION_POLL_INTERVAL_MS = 45000
const NOTIFICATION_RECONNECT_BASE_MS = 2000
const NOTIFICATION_RECONNECT_MAX_MS = 30000
const NOTIFICATION_MAX_REALTIME_FAILURES = import.meta.env.DEV ? 1 : 5

interface NotificationContextValue {
  notifications: NotificationRecord[]
  unreadCount: number
  totalCount: number
  isLoading: boolean
  error: string
  connectionState: NotificationConnectionState
  connectionHint: string
  refreshNotifications: () => Promise<void>
  markNotificationRead: (notificationId: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  openNotification: (notificationId: number) => Promise<string>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [connectionState, setConnectionState] = useState<NotificationConnectionState>('idle')
  const [connectionHint, setConnectionHint] = useState('')

  const hydrate = useCallback(async () => {
    if (!session?.accessToken) {
      setNotifications([])
      setUnreadCount(0)
      setTotalCount(0)
      setError('')
      setConnectionState('idle')
      setConnectionHint('')
      return
    }

    setIsLoading(true)
    try {
      const data = await fetchNotifications(session.accessToken, 'all', 50)
      setNotifications(data.items)
      setUnreadCount(data.unread_count)
      setTotalCount(data.total_count)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load notifications.'))
    } finally {
      setIsLoading(false)
    }
  }, [session?.accessToken])

  useEffect(() => {
    void hydrate()
  }, [hydrate, session?.activeOrgId])

  useEffect(() => {
    if (!session?.accessToken) {
      setConnectionState('idle')
      setConnectionHint('')
      return
    }

    let isActive = true
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let pollingTimer: number | null = null
    let reconnectAttempts = 0
    let realtimeFailures = 0

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const stopPolling = () => {
      if (pollingTimer !== null) {
        window.clearInterval(pollingTimer)
        pollingTimer = null
      }
    }

    const startPolling = () => {
      if (!isActive || pollingTimer !== null) {
        return
      }

      setConnectionState('polling')
      setConnectionHint('Realtime reconnecting. Background refresh is active.')
      pollingTimer = window.setInterval(() => {
        void hydrate()
      }, NOTIFICATION_POLL_INTERVAL_MS)
    }

    const applyRealtimeEvent = (message: string) => {
      const payload = parseNotificationRealtimeEvent(message)
      if (!payload) {
        return
      }

      if (payload.type === 'notification.created') {
        if (!payload.notification) {
          void hydrate()
        } else {
          setNotifications((current) => upsertNotificationRecord(current, payload.notification!))
        }
      }

      if (payload.type === 'notification.read' && payload.notification) {
        setNotifications((current) =>
          current.map((item) => (item.id === payload.notification!.id ? payload.notification! : item)),
        )
      }

      if (payload.type === 'notification.read_all') {
        const readAt = payload.timestamp ?? new Date().toISOString()
        setNotifications((current) =>
          current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
        )
      }

      if (typeof payload.unread_count === 'number') {
        setUnreadCount(payload.unread_count)
      }

      if (typeof payload.total_count === 'number') {
        setTotalCount(payload.total_count)
      }
    }

    const stopRealtimeReconnects = () => {
      clearReconnectTimer()
      setConnectionState('polling')
      setConnectionHint('Live notifications unavailable. Background refresh is active.')
    }

    const scheduleReconnect = () => {
      if (!isActive) {
        return
      }

      startPolling()
      realtimeFailures += 1

      if (realtimeFailures >= NOTIFICATION_MAX_REALTIME_FAILURES) {
        stopRealtimeReconnects()
        return
      }

      clearReconnectTimer()
      const delay = Math.min(
        NOTIFICATION_RECONNECT_MAX_MS,
        NOTIFICATION_RECONNECT_BASE_MS * Math.max(1, 2 ** reconnectAttempts),
      )
      reconnectAttempts += 1
      reconnectTimer = window.setTimeout(() => {
        void connect()
      }, delay)
    }

    const connect = async () => {
      if (!isActive || !session.accessToken) {
        return
      }

      clearReconnectTimer()
      setConnectionState('connecting')
      setConnectionHint('Connecting live notifications...')

      try {
        const result = await requestNotificationSocketConnection(session.accessToken)
        if (!isActive) {
          return
        }

        socket = new WebSocket(buildNotificationsSocketUrl(result.connection.path, result.connection.socket_token))
        socket.onopen = () => {
          if (!isActive) {
            return
          }

          reconnectAttempts = 0
          realtimeFailures = 0
          stopPolling()
          setConnectionState('connected')
          setConnectionHint('Live notifications connected.')
        }

        socket.onmessage = (event) => {
          applyRealtimeEvent(String(event.data ?? ''))
        }

        socket.onerror = () => {
          socket?.close()
        }

        socket.onclose = () => {
          if (!isActive) {
            return
          }

          socket = null
          scheduleReconnect()
        }
      } catch {
        if (!isActive) {
          return
        }

        scheduleReconnect()
      }
    }

    void connect()

    return () => {
      isActive = false
      clearReconnectTimer()
      stopPolling()
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      setConnectionState('idle')
      setConnectionHint('')
    }
  }, [hydrate, session?.accessToken])

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      totalCount,
      isLoading,
      error,
      connectionState,
      connectionHint,
      refreshNotifications: hydrate,
      markNotificationRead: async (notificationId) => {
        if (!session?.accessToken) {
          return
        }

        try {
          const wasUnread = notifications.some((item) => item.id === notificationId && !item.read_at)
          const result = await markNotificationRead(session.accessToken, notificationId)
          setNotifications((current) =>
            current.map((item) => (item.id === notificationId ? result.notification : item)),
          )
          if (wasUnread) {
            setUnreadCount((current) => Math.max(0, current - 1))
          }
        } catch (markError) {
          setError(getErrorMessage(markError, 'Unable to mark notification as read.'))
        }
      },
      markAllAsRead: async () => {
        if (!session?.accessToken) {
          return
        }

        try {
          await markAllNotificationsRead(session.accessToken)
          setNotifications((current) =>
            current.map((item) => (item.read_at ? item : { ...item, read_at: new Date().toISOString() })),
          )
          setUnreadCount(0)
        } catch (markError) {
          setError(getErrorMessage(markError, 'Unable to mark all notifications as read.'))
        }
      },
      openNotification: async (notificationId) => {
        const notification = notifications.find((item) => item.id === notificationId)
        const fallback = normalizeNotificationDestination(session, notification?.link_path ?? '/app/notifications')
        if (!session?.accessToken || !notification) {
          return fallback
        }

        if (!notification.read_at) {
          try {
            const result = await markNotificationRead(session.accessToken, notificationId)
            setNotifications((current) =>
              current.map((item) => (item.id === notificationId ? result.notification : item)),
            )
            setUnreadCount((current) => Math.max(0, current - 1))
            const nextPath = normalizeNotificationDestination(session, result.notification.link_path)
            if (result.notification.checklist_item_id && nextPath.startsWith('/app/checklist/items/')) {
              const orgId = result.notification.org_id ?? session.activeOrgId
              if (orgId > 0) {
                try {
                  await fetchChecklistItem(session.accessToken, orgId, result.notification.checklist_item_id)
                } catch {
                  setError('This checklist item is no longer assigned to you.')
                  return '/app/notifications'
                }
              }
            }
            return nextPath
          } catch (markError) {
            setError(getErrorMessage(markError, 'Unable to open notification.'))
          }
        }

        if (notification.checklist_item_id && fallback.startsWith('/app/checklist/items/')) {
          const orgId = notification.org_id ?? session.activeOrgId
          if (orgId > 0) {
            try {
              await fetchChecklistItem(session.accessToken, orgId, notification.checklist_item_id)
            } catch {
              setError('This checklist item is no longer assigned to you.')
              return '/app/notifications'
            }
          }
        }

        return fallback
      },
    }),
    [
      connectionHint,
      connectionState,
      error,
      hydrate,
      isLoading,
      notifications,
      session,
      totalCount,
      unreadCount,
    ],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used inside NotificationProvider')
  }
  return context
}
