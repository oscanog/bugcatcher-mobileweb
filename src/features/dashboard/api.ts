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
  title: string
  status: string
  assign_status: string
  author_username: string
}

export interface DashboardOrgContext {
  org_id: number
  org_name: string
  org_role: string
  org_owner_id: number
  is_org_owner: boolean
  user_id: number
  system_role: string
}

export interface DashboardSummaryResponse {
  org: DashboardOrgContext
  scope: string
  summary: DashboardSummary
  trend: DashboardTrendPoint[]
  recent_issues: DashboardRecentIssue[]
}

export function fetchDashboardSummary(accessToken: string, orgId: number) {
  return requestJson<DashboardSummaryResponse>(withOrgQuery('/dashboard/summary', orgId), { method: 'GET' }, accessToken)
}
