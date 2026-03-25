import { requestJson, withOrgQuery } from '../../lib/api'

export interface ProjectSummary {
  id: number
  org_id: number
  org_name: string
  name: string
  code: string | null
  description: string | null
  status: 'active' | 'archived'
  created_by: number
  updated_by: number | null
  created_at: string
  updated_at: string | null
}

export interface ChecklistBatchSummary {
  id: number
  org_id?: number
  org_name?: string
  title: string
  status: string
  module_name: string
  submodule_name: string | null
  total_items: number
  open_items: string
  in_progress_items: string
  passed_items: string
  failed_items: string
  blocked_items: string
}

export interface ProjectsResponse {
  org: {
    org_id: number | null
    org_name: string
  }
  projects: ProjectSummary[]
}

export interface ProjectDetailResponse {
  project: ProjectSummary
  batches: ChecklistBatchSummary[]
}

export function fetchProjects(accessToken: string, orgId?: number | null, show: 'active' | 'all' = 'active') {
  const path = withOrgQuery('/projects', orgId)
  return requestJson<ProjectsResponse>(`${path}${path.includes('?') ? '&' : '?'}show=${show}`, { method: 'GET' }, accessToken)
}

export function fetchProject(accessToken: string, orgId: number | null | undefined, projectId: number) {
  return requestJson<ProjectDetailResponse>(withOrgQuery(`/projects/${projectId}`, orgId), { method: 'GET' }, accessToken)
}

export function createProject(
  accessToken: string,
  payload: { org_id: number; name: string; code?: string; description?: string; status?: 'active' | 'archived' },
) {
  return requestJson<{ project: ProjectSummary }>(
    '/projects',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function updateProject(
  accessToken: string,
  projectId: number,
  payload: { org_id: number; name: string; code?: string; description?: string; status?: 'active' | 'archived' },
) {
  return requestJson<{ project: ProjectSummary }>(
    `/projects/${projectId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    accessToken,
  )
}

export function setProjectStatus(accessToken: string, projectId: number, orgId: number, nextStatus: 'active' | 'archived') {
  const path = nextStatus === 'archived' ? `/projects/${projectId}/archive` : `/projects/${projectId}/activate`
  return requestJson<{ project_id: number; status: string }>(
    path,
    {
      method: 'POST',
      body: JSON.stringify({ org_id: orgId }),
    },
    accessToken,
  )
}
