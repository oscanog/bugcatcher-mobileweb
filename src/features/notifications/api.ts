import { requestJson } from '../../lib/api'

export interface NotificationActor {
  id: number
  username: string
}

export interface NotificationRecord {
  id: number
  type: string
  event_key: string
  title: string
  body: string
  severity: 'default' | 'success' | 'alert'
  link_path: string
  read_at: string | null
  read_at_iso?: string | null
  created_at: string
  created_at_iso?: string | null
  org_id: number | null
  project_id: number | null
  issue_id: number | null
  checklist_batch_id: number | null
  checklist_item_id: number | null
  actor: NotificationActor | null
  meta: Record<string, unknown> | null
}

export interface NotificationsResponse {
  items: NotificationRecord[]
  unread_count: number
  total_count: number
}

export interface NotificationSocketConnection {
  socket_token: string
  path: string
  expires_in: number
}

export function fetchNotifications(accessToken: string, state: 'all' | 'unread' = 'all', limit = 25) {
  return requestJson<NotificationsResponse>(`/notifications?state=${state}&limit=${limit}`, { method: 'GET' }, accessToken)
}

export function markNotificationRead(accessToken: string, notificationId: number) {
  return requestJson<{ notification: NotificationRecord }>(
    `/notifications/${notificationId}/read`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function markAllNotificationsRead(accessToken: string) {
  return requestJson<{ updated: number }>(
    '/notifications/read-all',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function requestNotificationSocketConnection(accessToken: string) {
  return requestJson<{ connection: NotificationSocketConnection }>(
    '/realtime/socket-token',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}
