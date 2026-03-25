import { requestJson, withOrgQuery } from '../../lib/api'

export interface ChecklistBatch {
  id: number
  org_id: number
  org_name?: string
  project_id: number
  title: string
  module_name: string
  submodule_name: string | null
  source_type: string
  source_channel: string
  source_reference: string | null
  status: string
  created_by: number
  updated_by: number | null
  assigned_qa_lead_id: number | null
  notes: string | null
  page_url: string | null
  created_at: string
  updated_at: string | null
  project_name: string
  qa_lead_name: string | null
  created_by_name: string
  updated_by_name?: string | null
  total_items?: number
  open_items?: string
  in_progress_items?: string
  passed_items?: string
  failed_items?: string
  blocked_items?: string
}

export interface ChecklistItem {
  id: number
  batch_id: number
  org_id: number
  org_name?: string
  project_id: number
  sequence_no: number
  title: string
  module_name: string
  submodule_name: string | null
  full_title: string
  description: string | null
  status: string
  priority: string
  required_role: string
  assigned_to_user_id: number | null
  created_by: number
  updated_by: number | null
  issue_id: number | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string | null
  assigned_to_name: string | null
  created_by_name: string
  updated_by_name: string | null
  batch_title?: string
  batch_status?: string
  batch_page_url?: string | null
  project_name?: string
}

export interface ChecklistBatchesResponse {
  batches: ChecklistBatch[]
}

export interface ChecklistBatchDetailResponse {
  batch: ChecklistBatch
  items: ChecklistItem[]
  attachments: ChecklistAttachment[]
}

export interface ChecklistAttachment {
  id: number
  original_name: string
  file_path: string
  mime_type?: string
  file_size?: number
  uploaded_by_name?: string | null
  created_at?: string
  source_type?: string
}

export interface ChecklistAssigneeOption {
  user_id: number
  username: string
  role: string
}

export interface ChecklistItemDetailResponse {
  item: ChecklistItem
  attachments: ChecklistAttachment[]
  assignable_testers?: ChecklistAssigneeOption[]
}

export interface ChecklistItemUpdatePayload {
  sequence_no?: number
  title?: string
  module_name?: string
  submodule_name?: string
  description?: string
  priority?: string
  required_role?: string
  assigned_to_user_id?: number
}

export function fetchChecklistBatches(
  accessToken: string,
  orgId?: number | null,
  filters?: { projectId?: number; status?: string; search?: string },
) {
  const query = new URLSearchParams()
  if (orgId && orgId > 0) {
    query.set('org_id', `${orgId}`)
  }
  if ((filters?.projectId ?? 0) > 0) {
    query.set('project_id', `${filters?.projectId}`)
  }
  if (filters?.status) {
    query.set('status', filters.status)
  }
  if (filters?.search) {
    query.set('q', filters.search)
  }

  const path = query.size > 0 ? `/checklist/batches?${query.toString()}` : '/checklist/batches'
  return requestJson<ChecklistBatchesResponse>(path, { method: 'GET' }, accessToken)
}

export function fetchChecklistBatch(accessToken: string, orgId: number | null | undefined, batchId: number) {
  return requestJson<ChecklistBatchDetailResponse>(withOrgQuery(`/checklist/batches/${batchId}`, orgId), { method: 'GET' }, accessToken)
}

export function fetchChecklistItem(accessToken: string, orgId: number | null | undefined, itemId: number) {
  return requestJson<ChecklistItemDetailResponse>(withOrgQuery(`/checklist/items/${itemId}`, orgId), { method: 'GET' }, accessToken)
}

export function updateChecklistItem(accessToken: string, orgId: number, itemId: number, payload: ChecklistItemUpdatePayload) {
  return requestJson<{ item: ChecklistItem }>(
    withOrgQuery(`/checklist/items/${itemId}`, orgId),
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function updateChecklistItemStatus(accessToken: string, orgId: number, itemId: number, status: string) {
  return requestJson<{ item: ChecklistItem }>(
    withOrgQuery('/checklist/item_status', orgId),
    {
      method: 'POST',
      body: JSON.stringify({
        item_id: itemId,
        status,
      }),
    },
    accessToken,
  )
}

export function deleteChecklistItem(accessToken: string, orgId: number, itemId: number) {
  return requestJson<{ deleted: boolean; id: number }>(
    withOrgQuery(`/checklist/items/${itemId}`, orgId),
    {
      method: 'DELETE',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function uploadChecklistItemAttachments(accessToken: string, orgId: number, itemId: number, attachments: File[]) {
  const formData = new FormData()
  formData.set('item_id', `${itemId}`)
  attachments.forEach((file) => {
    formData.append('attachments[]', file)
  })

  return requestJson<{ uploaded_count: number; failed: Array<{ name: string; error: string | number }>; attachments: ChecklistAttachment[] }>(
    withOrgQuery('/checklist/item_attachments', orgId),
    {
      method: 'POST',
      body: formData,
    },
    accessToken,
  )
}
