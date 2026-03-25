import { requestJson, withOrgQuery } from '../../lib/api'

export interface DashboardSummary {
  open_issues: number
  closed_issues: number
  active_projects: number
  checklist_open_items: number
  unread_notifications: number
}

export interface DashboardTrendPoint {
  day: string
  issues: number
  projects: number
  checklist: number
}

export interface DashboardRecentIssue {
  id: number
  org_id: number
  org_name: string
  title: string
  status: string
  assign_status: string
  author_username: string
}

export interface DashboardQaLeadChecklistRow {
  user_id: number | null
  display_name: string
  assigned_items: number
  open_items: number
  is_unassigned: boolean
}

export interface DashboardQaLeadChecklistProject {
  project_id: number
  project_name: string
  assigned_items: number
  open_items: number
  testers: DashboardQaLeadChecklistRow[]
}

export interface DashboardQaLeadChecklistSummary {
  org_totals: DashboardQaLeadChecklistRow[]
  projects: DashboardQaLeadChecklistProject[]
}

export interface DashboardOrgContext {
  org_id: number | null
  org_name: string
  org_role: string
  org_owner_id: number
  is_org_owner: boolean
  user_id: number
  system_role: string
  active_scope?: string
}

export interface DashboardSummaryResponse {
  org: DashboardOrgContext
  scope: string
  summary: DashboardSummary
  trend: DashboardTrendPoint[]
  recent_issues: DashboardRecentIssue[]
  qa_lead_checklist: DashboardQaLeadChecklistSummary | null
}

export function fetchDashboardSummary(accessToken: string, orgId?: number | null) {
  return requestJson<DashboardSummaryResponse>(withOrgQuery('/dashboard/summary', orgId), { method: 'GET' }, accessToken)
}
