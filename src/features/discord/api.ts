import { requestJson } from '../../lib/api'

export interface DiscordLinkResponse {
  link: {
    id: number
    discord_user_id: string
    discord_username: string | null
    discord_global_name: string | null
    linked_at: string
    last_seen_at: string | null
  } | null
}

export function fetchDiscordLink(accessToken: string) {
  return requestJson<DiscordLinkResponse>('/discord/link', { method: 'GET' }, accessToken)
}

export function createDiscordLinkCode(accessToken: string) {
  return requestJson<{ code: string; expires_at: string }>(
    '/discord/link-code',
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function unlinkDiscord(accessToken: string) {
  return requestJson<{ unlinked: boolean }>(
    '/discord/link',
    {
      method: 'DELETE',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}
