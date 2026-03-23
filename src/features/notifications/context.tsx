/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth-context'
import { normalizeNotificationDestination } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from './api'

interface NotificationContextValue {
  notifications: NotificationRecord[]
  unreadCount: number
  totalCount: number
  isLoading: boolean
  error: string
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

  const hydrate = useCallback(async () => {
    if (!session?.accessToken) {
      setNotifications([])
      setUnreadCount(0)
      setTotalCount(0)
      setError('')
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

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      totalCount,
      isLoading,
      error,
      refreshNotifications: hydrate,
      markNotificationRead: async (notificationId) => {
        if (!session?.accessToken) {
          return
        }

        try {
          const result = await markNotificationRead(session.accessToken, notificationId)
          setNotifications((current) =>
            current.map((item) => (item.id === notificationId ? result.notification : item)),
          )
          setUnreadCount((current) => Math.max(0, current - 1))
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
            return normalizeNotificationDestination(session, result.notification.link_path)
          } catch (markError) {
            setError(getErrorMessage(markError, 'Unable to open notification.'))
          }
        }

        return fallback
      },
    }),
    [error, hydrate, isLoading, notifications, session, totalCount, unreadCount],
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
