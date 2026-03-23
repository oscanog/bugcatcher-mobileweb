import { requestJson } from '../../lib/api'

export interface OpenClawRuntimePayload {
  runtime: {
    config_version: string
    runtime: {
      is_enabled: boolean
      default_provider_config_id: number | null
      default_model_id: number | null
      notes: string | null
      discord_bot_token: string
    }
    providers: Array<{
      id: number
      provider_key: string
      display_name: string
      provider_type: string
      is_enabled: boolean
    }>
    models: Array<{
      id: number
      display_name: string
      model_id: string
      is_enabled: boolean
      is_default: boolean
    }>
    channels: Array<{
      id: number
      guild_id: string
      channel_id: string
      is_enabled: boolean
    }>
    pending_reload_request: {
      id: number
      status: string
      requested_at: string
    } | null
    runtime_status: {
      config_version_applied: string | null
      gateway_state: string
      discord_state: string
      discord_application_id: string | null
      last_heartbeat_at: string | null
      last_reload_at: string | null
    }
  }
  control_plane: {
    id: string
    config_version: string
    last_runtime_reload_requested_at: string | null
    last_runtime_reload_requested_by: string | null
    last_runtime_reload_reason: string | null
    updated_at: string
    last_runtime_reload_requested_by_name: string | null
  }
  runtime_status: {
    id: string
    gateway_state: string
    discord_state: string
    heartbeat_at: string | null
    last_reload_at: string | null
    last_error_message: string | null
    updated_at: string
  }
  pending_reload_request: {
    id: number
    status: string
    requested_at: string
  } | null
}

export function fetchOpenClawRuntime(accessToken: string) {
  return requestJson<OpenClawRuntimePayload>('/admin/openclaw/runtime', { method: 'GET' }, accessToken)
}

export function requestOpenClawReload(accessToken: string) {
  return requestJson<{ reload_request_id: number; status: string }>(
    '/admin/openclaw/runtime/reload',
    {
      method: 'POST',
      body: JSON.stringify({ reason: 'mobileweb_manual_reload' }),
    },
    accessToken,
  )
}
