import { requestJson, withOrgQuery } from '../../lib/api'

export interface IssueLabel {
  id: number
  name: string
  description: string
  color: string
}

export interface IssueAttachment {
  id: number
  file_path: string
  original_name: string
  mime_type: string
  file_size: number
  uploaded_at: string
  uploaded_at_iso?: string | null
}

export interface IssueRecord {
  id: number
  org_id: number
  org_name: string
  title: string
  description: string
  status: string
  assign_status: string
  author_id: number
  author_username: string
  pm_id: number
  assigned_dev_id: number
  assigned_junior_id: number
  assigned_qa_id: number
  assigned_senior_qa_id: number
  assigned_qa_lead_id: number
  assigned_at: string
  assigned_at_iso?: string | null
  junior_assigned_at: string
  junior_assigned_at_iso?: string | null
  junior_done_at: string
  junior_done_at_iso?: string | null
  qa_assigned_at: string
  qa_assigned_at_iso?: string | null
  senior_qa_assigned_at: string
  senior_qa_assigned_at_iso?: string | null
  qa_lead_assigned_at: string
  qa_lead_assigned_at_iso?: string | null
  created_at: string
  created_at_iso?: string | null
  labels: IssueLabel[]
  attachments: IssueAttachment[]
}

export interface IssuesResponse {
  org: {
    org_id: number | null
    org_name: string
    org_role: string
    is_org_owner: boolean
    system_role: string
  }
  scope: string
  status: string
  filters: {
    author: number | null
    label: number | null
  }
  counts: {
    open: number
    closed: number
  }
  issues: IssueRecord[]
}

export interface IssueDetailResponse {
  org: {
    org_id: number | null
    org_name: string
    org_role: string
    is_org_owner: boolean
    system_role: string
  }
  issue: IssueRecord
}

export function fetchIssues(accessToken: string, orgId?: number | null, status: 'open' | 'closed' = 'open') {
  const path = withOrgQuery('/issues', orgId)
  return requestJson<IssuesResponse>(`${path}${path.includes('?') ? '&' : '?'}status=${status}`, { method: 'GET' }, accessToken)
}

export function fetchIssue(accessToken: string, orgId: number | null | undefined, issueId: number) {
  return requestJson<IssueDetailResponse>(withOrgQuery(`/issues/${issueId}`, orgId), { method: 'GET' }, accessToken)
}

export function createIssue(
  accessToken: string,
  payload: { org_id: number; title: string; description?: string; labels?: number[] },
  images: File[] = [],
) {
  if (images.length > 0) {
    const formData = new FormData()
    formData.set('org_id', `${payload.org_id}`)
    formData.set('title', payload.title)
    if (payload.description?.trim()) {
      formData.set('description', payload.description.trim())
    }
    ;(payload.labels ?? []).forEach((labelId) => {
      formData.append('labels[]', `${labelId}`)
    })
    images.forEach((file) => {
      formData.append('images[]', file)
    })

    return requestJson<{ issue: IssueRecord }>(
      '/issues',
      {
        method: 'POST',
        body: formData,
      },
      accessToken,
    )
  }

  return requestJson<{ issue: IssueRecord }>(
    '/issues',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function performIssueAction(
  accessToken: string,
  issueId: number,
  action: string,
  payload: Record<string, unknown>,
) {
  return requestJson<{ issue: IssueRecord }>(
    `/issues/${issueId}/${action}`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function deleteIssue(accessToken: string, issueId: number, orgId: number) {
  return requestJson<{ deleted: boolean; issue_id: number }>(
    `/issues/${issueId}`,
    {
      method: 'DELETE',
      body: JSON.stringify({ org_id: orgId }),
    },
    accessToken,
  )
}
