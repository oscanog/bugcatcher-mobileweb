import { API_BASE_PATH, ApiError, requestJson, withOrgQuery } from '../../lib/api'

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
  target_mode: '' | 'new' | 'existing'
  existing_batch_id: number | null
  existing_batch_title: string
  resolved_batch_id: number | null
  resolved_batch_title: string
  batch_title: string
  module_name: string
  submodule_name: string
  page_url: string
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

export interface DraftContextPayload {
  project_id: number
  target_mode: 'new' | 'existing'
  existing_batch_id?: number
  batch_title?: string
  module_name?: string
  submodule_name?: string
  page_url?: string
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

export function fetchAIChatBootstrap(accessToken: string, orgId: number) {
  return requestJson<AIChatBootstrap>(withOrgQuery('/ai-chat/bootstrap', orgId), { method: 'GET' }, accessToken)
}

export function fetchAIChatThreads(accessToken: string, orgId: number) {
  return requestJson<{ threads: Array<Pick<AIChatThread, 'id' | 'title' | 'created_at' | 'updated_at' | 'last_message_at' | 'draft_context'>> }>(
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

export function createChecklistDraft(accessToken: string, orgId: number, threadId: number, message: string, attachments: File[]) {
  const formData = new FormData()
  formData.set('org_id', `${orgId}`)
  formData.set('message', message)
  attachments.forEach((file) => {
    formData.append('attachments[]', file)
  })

  return requestMultipartJson<{ thread: AIChatThread; assistant_message_id: number; user_message_id: number }>(
    accessToken,
    `/ai-chat/threads/${threadId}/checklist-drafts`,
    formData,
  )
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
