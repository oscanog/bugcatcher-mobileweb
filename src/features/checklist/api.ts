import { requestJson, withOrgQuery } from '../../lib/api'

export interface ChecklistBatch {
  id: number
  org_id: number
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
}

export interface ChecklistBatchesResponse {
  batches: ChecklistBatch[]
}

export interface ChecklistBatchDetailResponse {
  batch: ChecklistBatch
  items: ChecklistItem[]
  attachments: Array<{
    id: number
    original_name: string
    file_path: string
  }>
}

export function fetchChecklistBatches(accessToken: string, orgId: number) {
  return requestJson<ChecklistBatchesResponse>(withOrgQuery('/checklist/batches', orgId), { method: 'GET' }, accessToken)
}

export function fetchChecklistBatch(accessToken: string, orgId: number, batchId: number) {
  return requestJson<ChecklistBatchDetailResponse>(withOrgQuery(`/checklist/batches/${batchId}`, orgId), { method: 'GET' }, accessToken)
}
