import type { OrgRole } from '../../auth-context'
import { requestJson } from '../../lib/api'

export interface OrganizationSummary {
  id: number
  name: string
  owner_id: number
  my_role: OrgRole | string
  is_owner: boolean
  created_at: string
}

export interface JoinableOrganization {
  id: number
  name: string
  owner_name: string
  member_count: number
}

export interface OrganizationMember {
  user_id: number
  username: string
  email: string
  system_role: string
  org_role: OrgRole | string
  is_owner: boolean
  joined_at: string
}

export interface OrganizationsResponse {
  active_org_id: number
  organizations: OrganizationSummary[]
  joinable_organizations: JoinableOrganization[]
}

export interface OrganizationMembersResponse {
  org: {
    org_id: number
    org_name: string
    org_role: string
    org_owner_id: number
    is_org_owner: boolean
    user_id: number
    system_role: string
  }
  members: OrganizationMember[]
}

export interface OrganizationMutationResponse {
  active_org_id?: number
  org_id: number
}

export function fetchOrganizations(accessToken: string) {
  return requestJson<OrganizationsResponse>('/orgs', { method: 'GET' }, accessToken)
}

export function fetchOrganizationMembers(accessToken: string, orgId: number) {
  return requestJson<OrganizationMembersResponse>(`/orgs/${orgId}/members`, { method: 'GET' }, accessToken)
}

export function createOrganization(accessToken: string, name: string) {
  return requestJson<OrganizationMutationResponse>(
    '/orgs',
    {
      method: 'POST',
      body: JSON.stringify({ name }),
    },
    accessToken,
  )
}

export function joinOrganization(accessToken: string, orgId: number) {
  return requestJson<OrganizationMutationResponse>(
    `/orgs/${orgId}/join`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function leaveOrganization(accessToken: string, orgId: number) {
  return requestJson<OrganizationMutationResponse>(
    `/orgs/${orgId}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}

export function transferOrganizationOwner(accessToken: string, orgId: number, newOwnerId: number) {
  return requestJson<{ transferred: boolean; org_id: number; new_owner_id: number }>(
    `/orgs/${orgId}/transfer-owner`,
    {
      method: 'POST',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    },
    accessToken,
  )
}

export function updateOrganizationMemberRole(accessToken: string, orgId: number, userId: number, role: OrgRole) {
  return requestJson<{ updated: boolean; org_id: number; user_id: number; role: OrgRole }>(
    `/orgs/${orgId}/members/${userId}/role`,
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
    accessToken,
  )
}

export function removeOrganizationMember(accessToken: string, orgId: number, userId: number) {
  return requestJson<{ kicked: boolean; org_id: number; user_id: number }>(
    `/orgs/${orgId}/members/${userId}`,
    {
      method: 'DELETE',
      body: JSON.stringify({}),
    },
    accessToken,
  )
}
