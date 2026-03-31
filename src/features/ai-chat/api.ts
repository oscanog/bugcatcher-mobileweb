import { API_BASE_PATH, ApiError, requestJson, withOrgQuery } from '../../lib/api'

export type AIChatSourceMode = 'screenshot' | 'link'

export interface AIChatBootstrap {
  enabled: boolean
  assistant_name: string
  org_id: number
  error_message?: string
  provider?: {
    id: number
    display_name: string
  }
  model?: {
    id: number
    display_name: string
    model_id: string
    supports_vision: boolean
  }
  source_modes?: {
    link: {
      enabled: boolean
      warning_message: string
    }
    screenshot: {
      enabled: boolean
      warning_message: string
    }
  }
}

export interface AIChatAttachment {
  id: number
  file_path: string
  storage_key?: string
  original_name: string
  mime_type: string
  file_size: number
  created_at: string
  created_at_iso?: string | null
}

export interface AIGeneratedChecklistItem {
  id: number
  project_id: number
  source_mode: AIChatSourceMode
  target_mode: 'new' | 'existing'
  target_batch_id: number | null
  batch_title: string
  module_name: string
  submodule_name: string
  page_url?: string
  sequence_no: number
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  required_role: string
  review_status: 'pending' | 'approved' | 'rejected'
  duplicate_status: 'unique' | 'possible_duplicate' | 'confirmed_duplicate' | string
  duplicate_summary: string
  duplicate_matches: Array<{
    id: number
    title: string
    full_title: string
  }>
  approved_batch_id: number | null
  approved_item_id: number | null
  approved_at: string
  approved_at_iso?: string | null
  rejected_at: string
  rejected_at_iso?: string | null
  created_at: string
  created_at_iso?: string | null
  updated_at: string
  updated_at_iso?: string | null
}

export interface AIChatDraftContext {
  project_id: number
  project_name: string
  source_mode: AIChatSourceMode
  target_mode: '' | 'new' | 'existing'
  existing_batch_id: number | null
  existing_batch_title: string
  resolved_batch_id: number | null
  resolved_batch_title: string
  batch_title: string
  module_name: string
  submodule_name: string
  page_url: string
  page_link_status: string
  page_link_warning: string
  has_saved_link_credentials: boolean
  is_ready: boolean
  is_locked: boolean
}

export interface AIChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  status: 'pending' | 'streaming' | 'completed' | 'failed'
  error_message: string
  created_at: string
  created_at_iso?: string | null
  updated_at: string
  updated_at_iso?: string | null
  attachments: AIChatAttachment[]
  generated_checklist_items: AIGeneratedChecklistItem[]
}

export interface AIChatThread {
  id: number
  org_id: number
  user_id: number
  title: string
  created_at: string
  created_at_iso?: string | null
  updated_at: string
  updated_at_iso?: string | null
  last_message_at: string
  last_message_at_iso?: string | null
  draft_context: AIChatDraftContext
  messages: AIChatMessage[]
}

export type AIChatThreadSummary = Pick<
  AIChatThread,
  | 'id'
  | 'title'
  | 'created_at'
  | 'created_at_iso'
  | 'updated_at'
  | 'updated_at_iso'
  | 'last_message_at'
  | 'last_message_at_iso'
  | 'draft_context'
>

export interface DraftContextPayload {
  project_id: number
  source_mode: AIChatSourceMode
  target_mode: 'new' | 'existing'
  existing_batch_id?: number
  batch_title?: string
  module_name?: string
  submodule_name?: string
  page_url?: string
}

export interface AIChatPageLinkPreview {
  page_url: string
  status: string
  page_title: string
  excerpt: string
  warning_message: string
  requires_credentials: boolean
  credentials_saved: boolean
}

export type AIChatDraftStreamStage =
  | 'preparing'
  | 'analyzing_link'
  | 'reading_page'
  | 'reading_screenshots'
  | 'reasoning'
  | 'drafting'
  | 'reviewing'
  | 'finalizing'

export type AIChatDraftStreamEvent =
  | {
      event: 'start'
      thread_id: number
      user_message_id: number
      assistant_message_id: number
      assistant_name: string
      source_mode?: AIChatSourceMode
      reused?: boolean
    }
  | {
      event: 'stage'
      stage: AIChatDraftStreamStage
      source_mode?: AIChatSourceMode
    }
  | {
      event: 'reasoning_delta'
      delta: string
      source_mode?: AIChatSourceMode
    }
  | {
      event: 'done'
      thread_id: number
      user_message_id: number
      assistant_message_id: number
      thread: AIChatThread | null
      reused?: boolean
    }
  | {
      event: 'error'
      thread_id?: number
      user_message_id?: number
      assistant_message_id?: number
      message: string
      code?: string
      thread?: AIChatThread | null
    }

interface JsonEnvelope<T> {
  data?: T
  error?: {
    code?: string
    message?: string
    details?: unknown
  }
}

function decodeJsonError(status: number, rawText: string): never {
  try {
    const envelope = JSON.parse(rawText) as JsonEnvelope<unknown>
    throw new ApiError(status, envelope.error?.message || 'Unable to complete the AI checklist request.', envelope.error?.code)
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(status, rawText.trim() || 'Unable to complete the AI checklist request.')
  }
}

async function requestMultipartJson<T>(accessToken: string, path: string, formData: FormData) {
  const response = await fetch(`${API_BASE_PATH}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  })

  const rawText = await response.text()
  if (!response.ok) {
    decodeJsonError(response.status, rawText)
  }

  const envelope = JSON.parse(rawText) as JsonEnvelope<T>
  return (envelope.data ?? envelope) as T
}

function parseSseEvent(rawEvent: string): AIChatDraftStreamEvent | null {
  const lines = rawEvent.split('\n')
  let eventName = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (!line.trim()) {
      continue
    }
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (!dataLines.length) {
    return null
  }

  const rawData = dataLines.join('\n')
  const parsed = JSON.parse(rawData) as Record<string, unknown>
  return {
    event: eventName,
    ...parsed,
  } as AIChatDraftStreamEvent
}

export function fetchAIChatBootstrap(accessToken: string, orgId: number) {
  return requestJson<AIChatBootstrap>(withOrgQuery('/ai-chat/bootstrap', orgId), { method: 'GET' }, accessToken)
}

export function fetchAIChatThreads(accessToken: string, orgId: number) {
  return requestJson<{ threads: AIChatThreadSummary[] }>(
    withOrgQuery('/ai-chat/threads', orgId),
    { method: 'GET' },
    accessToken,
  )
}

export function createAIChatThread(accessToken: string, orgId: number, title = 'New chat') {
  return requestJson<{ thread: AIChatThread }>(
    '/ai-chat/threads',
    {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId, title }),
    },
    accessToken,
  )
}

export function fetchAIChatThread(accessToken: string, orgId: number, threadId: number) {
  return requestJson<{ thread: AIChatThread }>(withOrgQuery(`/ai-chat/threads/${threadId}`, orgId), { method: 'GET' }, accessToken)
}

export function updateAIChatDraftContext(accessToken: string, orgId: number, threadId: number, payload: DraftContextPayload) {
  return requestJson<{ thread: AIChatThread }>(
    `/ai-chat/threads/${threadId}/draft-context`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        org_id: orgId,
        ...payload,
      }),
    },
    accessToken,
  )
}

export function previewAIChatPageLink(
  accessToken: string,
  orgId: number,
  threadId: number,
  payload: {
    page_url: string
    basic_auth_username?: string
    basic_auth_password?: string
  },
) {
  return requestJson<{ thread: AIChatThread; page_link_preview: AIChatPageLinkPreview }>(
    `/ai-chat/threads/${threadId}/page-link-preview`,
    {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId,
        ...payload,
      }),
    },
    accessToken,
  )
}

export function createChecklistDraft(
  accessToken: string,
  orgId: number,
  threadId: number,
  message: string,
  attachments: File[],
  clientRequestId?: string,
) {
  const formData = new FormData()
  formData.set('org_id', `${orgId}`)
  formData.set('message', message)
  if (clientRequestId) {
    formData.set('client_request_id', clientRequestId)
  }
  attachments.forEach((file) => {
    formData.append('attachments[]', file)
  })

  return requestMultipartJson<{ thread: AIChatThread; assistant_message_id: number; user_message_id: number }>(
    accessToken,
    `/ai-chat/threads/${threadId}/checklist-drafts`,
    formData,
  )
}

export async function streamChecklistDraft(
  accessToken: string,
  orgId: number,
  threadId: number,
  payload: {
    message: string
    attachments: File[]
    client_request_id: string
  },
  handlers: {
    onEvent: (event: AIChatDraftStreamEvent) => void
    signal?: AbortSignal
  },
) {
  const formData = new FormData()
  formData.set('org_id', `${orgId}`)
  formData.set('message', payload.message)
  formData.set('client_request_id', payload.client_request_id)
  payload.attachments.forEach((file) => {
    formData.append('attachments[]', file)
  })

  const response = await fetch(`${API_BASE_PATH}/ai-chat/threads/${threadId}/messages/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
    signal: handlers.signal,
  })

  if (!response.ok) {
    const rawText = await response.text()
    decodeJsonError(response.status, rawText)
  }

  if (!response.body) {
    throw new ApiError(500, 'AI chat streaming is unavailable right now.')
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''

    for (const eventChunk of events) {
      const parsed = parseSseEvent(eventChunk)
      if (parsed) {
        handlers.onEvent(parsed)
      }
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    const parsed = parseSseEvent(buffer)
    if (parsed) {
      handlers.onEvent(parsed)
    }
  }
}

export function approveGeneratedChecklistItem(accessToken: string, orgId: number, generatedItemId: number) {
  return requestJson<{ generated_item: AIGeneratedChecklistItem }>(
    `/ai-chat/generated-items/${generatedItemId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId }),
    },
    accessToken,
  )
}

export function rejectGeneratedChecklistItem(accessToken: string, orgId: number, generatedItemId: number) {
  return requestJson<{ generated_item: AIGeneratedChecklistItem }>(
    `/ai-chat/generated-items/${generatedItemId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId }),
    },
    accessToken,
  )
}

export function deleteAIChatThread(accessToken: string, orgId: number, threadId: number) {
  return requestJson<{ deleted: boolean; thread_id: number }>(
    withOrgQuery(`/ai-chat/threads/${threadId}`, orgId),
    { method: 'DELETE' },
    accessToken,
  )
}
