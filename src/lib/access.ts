import type { IconName, NavItem } from '../app-data'
import type { AuthSession, OrgRole, SystemRole } from '../auth-context'

export type AppRouteKey =
  | 'dashboard'
  | 'organizations'
  | 'projects'
  | 'reports'
  | 'profile'
  | 'notifications'
  | 'super-admin'
  | 'openclaw'
  | 'manage-users'
  | 'checklist'
  | 'discord-links'
  | 'settings'

export interface AppRouteDefinition {
  key: AppRouteKey
  path: string
  title: string
  subtitle?: string
  navKey: 'dashboard' | 'organizations' | 'projects' | 'reports' | 'profile' | 'utility'
  requiresAuth?: boolean
  requiresOrg?: boolean
  requiredSystemRole?: SystemRole
  requiredOrgRole?: OrgRole
}

export interface SidebarItemDefinition {
  key: string
  label: string
  to: string
  icon: IconName
  tone?: 'default' | 'danger'
}

export interface IssueAccessSubject {
  status: string
  assign_status: string
  pm_id: number
  assigned_dev_id: number
  assigned_junior_id: number
  assigned_qa_id: number
  assigned_senior_qa_id: number
  assigned_qa_lead_id: number
}

export type IssueWorkflowActionKey =
  | 'assign-dev'
  | 'assign-junior'
  | 'junior-done'
  | 'assign-qa'
  | 'report-senior-qa'
  | 'report-qa-lead'
  | 'qa-lead-approve'
  | 'qa-lead-reject'
  | 'pm-close'
  | 'delete'

export const bottomNavItems: NavItem[] = [
  { label: 'Dashboard', shortLabel: 'Dash', to: '/app/dashboard', icon: 'dashboard' },
  { label: 'Organization', shortLabel: 'Org', to: '/app/organizations', icon: 'organization' },
  { label: 'Projects', shortLabel: 'Projects', to: '/app/projects', icon: 'projects' },
  { label: 'Issues', shortLabel: 'Issues', to: '/app/reports', icon: 'reports' },
  { label: 'Profile', shortLabel: 'Profile', to: '/app/profile', icon: 'users' },
]

export const appRoutes: AppRouteDefinition[] = [
  { key: 'dashboard', path: '/app/dashboard', title: 'Dashboard', subtitle: 'Live summary', navKey: 'dashboard', requiresAuth: true, requiresOrg: true },
  { key: 'organizations', path: '/app/organizations', title: 'Organization', subtitle: 'Membership hub', navKey: 'organizations', requiresAuth: true },
  { key: 'projects', path: '/app/projects', title: 'Projects', subtitle: 'Active work', navKey: 'projects', requiresAuth: true, requiresOrg: true },
  { key: 'reports', path: '/app/reports', title: 'Issues', subtitle: 'Workflow queue', navKey: 'reports', requiresAuth: true, requiresOrg: true },
  { key: 'profile', path: '/app/profile', title: 'Profile', subtitle: 'Account center', navKey: 'profile', requiresAuth: true },
  { key: 'notifications', path: '/app/notifications', title: 'Notifications', subtitle: 'In-app inbox', navKey: 'utility', requiresAuth: true },
  {
    key: 'super-admin',
    path: '/app/super-admin',
    title: 'Super Admin',
    subtitle: 'Control center',
    navKey: 'utility',
    requiresAuth: true,
    requiredSystemRole: 'super_admin',
  },
  {
    key: 'openclaw',
    path: '/app/openclaw',
    title: 'OpenClaw',
    subtitle: 'Runtime control',
    navKey: 'utility',
    requiresAuth: true,
    requiredSystemRole: 'super_admin',
  },
  {
    key: 'manage-users',
    path: '/app/manage-users',
    title: 'Manage Users',
    subtitle: 'Owner controls',
    navKey: 'utility',
    requiresAuth: true,
    requiresOrg: true,
    requiredOrgRole: 'owner',
  },
  { key: 'checklist', path: '/app/checklist', title: 'Checklist', subtitle: 'Batch tracking', navKey: 'utility', requiresAuth: true, requiresOrg: true },
  { key: 'discord-links', path: '/app/discord-links', title: 'Discord Link', subtitle: 'Channel health', navKey: 'utility', requiresAuth: true },
  { key: 'settings', path: '/app/settings', title: 'Settings', subtitle: 'App defaults', navKey: 'utility', requiresAuth: true },
]

const sidebarItemDefinitions: SidebarItemDefinition[] = [
  { key: 'super-admin', label: 'Super Admin', to: '/app/super-admin', icon: 'shield' },
  { key: 'openclaw', label: 'OpenClaw', to: '/app/openclaw', icon: 'spark' },
  { key: 'checklist', label: 'Checklist', to: '/app/checklist', icon: 'checklist' },
  { key: 'discord-links', label: 'Discord Link', to: '/app/discord-links', icon: 'discord' },
  { key: 'manage-users', label: 'Manage Users', to: '/app/manage-users', icon: 'users' },
  { key: 'settings', label: 'Settings', to: '/app/settings', icon: 'settings' },
  { key: 'logout', label: 'Logout', to: '/login', icon: 'logout', tone: 'danger' },
]

export function getActiveMembership(session: AuthSession | null) {
  if (!session) {
    return null
  }
  return session.memberships.find((membership) => membership.org_id === session.activeOrgId) ?? null
}

export function hasSystemRole(session: AuthSession | null, role: SystemRole): boolean {
  return session?.user.role === role
}

export function hasOrgRole(session: AuthSession | null, role: OrgRole): boolean {
  const membership = getActiveMembership(session)
  if (!membership) {
    return false
  }
  return membership.role === role || (role === 'owner' && membership.is_owner)
}

export function getDefaultAppPath(session: AuthSession | null): string {
  if (!session) {
    return '/login'
  }
  return getActiveMembership(session) ? '/app/dashboard' : '/app/organizations'
}

export function findAppRoute(pathname: string): AppRouteDefinition {
  return appRoutes.find((route) => pathname === route.path || pathname.startsWith(`${route.path}/`)) ?? appRoutes[0]
}

export function canManageProjects(session: AuthSession | null): boolean {
  const membership = getActiveMembership(session)
  if (!membership) {
    return false
  }
  return membership.is_owner || membership.role === 'Project Manager' || membership.role === 'QA Lead'
}

export function canManageChecklist(session: AuthSession | null): boolean {
  return canManageProjects(session)
}

export function canViewRoute(session: AuthSession | null, routeKey: AppRouteKey): boolean {
  const route = appRoutes.find((item) => item.key === routeKey)
  if (!route) {
    return false
  }
  if (route.requiresAuth && !session) {
    return false
  }

  const activeMembership = getActiveMembership(session)
  if (route.requiresOrg && !activeMembership) {
    return false
  }
  if (route.requiredSystemRole && !hasSystemRole(session, route.requiredSystemRole)) {
    return false
  }
  if (route.requiredOrgRole && !hasOrgRole(session, route.requiredOrgRole)) {
    return false
  }
  if (route.key === 'checklist' && !canManageChecklist(session)) {
    return false
  }
  return true
}

export function canViewPath(session: AuthSession | null, path: string): boolean {
  if (!path.startsWith('/app/')) {
    return true
  }
  return canViewRoute(session, findAppRoute(path).key)
}

export function canSeeSidebarItem(session: AuthSession | null, itemKey: string): boolean {
  if (itemKey === 'logout' || itemKey === 'settings') {
    return Boolean(session)
  }
  const route = appRoutes.find((item) => item.key === itemKey)
  return route ? canViewRoute(session, route.key) : false
}

export function getSidebarItems(session: AuthSession | null): SidebarItemDefinition[] {
  return sidebarItemDefinitions.filter((item) => canSeeSidebarItem(session, item.key))
}

export function normalizeNotificationDestination(session: AuthSession | null, path: string): string {
  if (!path.startsWith('/app/')) {
    return getDefaultAppPath(session)
  }
  if (canViewPath(session, path)) {
    return path
  }
  if (path.startsWith('/app/reports')) {
    return canViewRoute(session, 'reports') ? '/app/reports' : getDefaultAppPath(session)
  }
  if (path.startsWith('/app/projects')) {
    return canViewRoute(session, 'projects') ? '/app/projects' : getDefaultAppPath(session)
  }
  if (path.startsWith('/app/checklist')) {
    return canViewRoute(session, 'checklist') ? '/app/checklist' : getDefaultAppPath(session)
  }
  if (path.startsWith('/app/manage-users')) {
    return canViewRoute(session, 'manage-users') ? '/app/manage-users' : getDefaultAppPath(session)
  }
  if (path.startsWith('/app/openclaw')) {
    return canViewRoute(session, 'openclaw') ? '/app/openclaw' : getDefaultAppPath(session)
  }
  return getDefaultAppPath(session)
}

function isSystemAdmin(session: AuthSession | null): boolean {
  return hasSystemRole(session, 'super_admin') || hasSystemRole(session, 'admin')
}

export function canPerformIssueAction(
  session: AuthSession | null,
  issue: IssueAccessSubject,
  action?: IssueWorkflowActionKey,
): boolean | Record<IssueWorkflowActionKey, boolean> {
  const membership = getActiveMembership(session)
  const userId = session?.user.id ?? 0
  const orgRole = membership?.role ?? ''
  const isOwner = Boolean(membership?.is_owner || membership?.role === 'owner')
  const visibility: Record<IssueWorkflowActionKey, boolean> = {
    'assign-dev':
      orgRole === 'Project Manager' &&
      (issue.assign_status === 'unassigned' ||
        (issue.assign_status === 'rejected' && issue.pm_id === userId)),
    'assign-junior':
      orgRole === 'Senior Developer' &&
      issue.assign_status === 'with_senior' &&
      issue.assigned_dev_id === userId,
    'junior-done':
      orgRole === 'Junior Developer' &&
      issue.assign_status === 'with_junior' &&
      issue.assigned_junior_id === userId,
    'assign-qa':
      orgRole === 'Senior Developer' &&
      issue.assign_status === 'junior_done' &&
      issue.assigned_dev_id === userId,
    'report-senior-qa':
      orgRole === 'QA Tester' &&
      issue.assign_status === 'with_qa' &&
      issue.assigned_qa_id === userId,
    'report-qa-lead':
      orgRole === 'Senior QA' &&
      issue.assign_status === 'with_senior_qa' &&
      issue.assigned_senior_qa_id === userId,
    'qa-lead-approve':
      orgRole === 'QA Lead' &&
      issue.assign_status === 'with_qa_lead' &&
      issue.assigned_qa_lead_id === userId,
    'qa-lead-reject':
      orgRole === 'QA Lead' &&
      issue.assign_status === 'with_qa_lead' &&
      issue.assigned_qa_lead_id === userId,
    'pm-close':
      orgRole === 'Project Manager' &&
      issue.assign_status === 'approved' &&
      issue.pm_id === userId,
    delete: issue.status !== 'closed' && (isOwner || isSystemAdmin(session)),
  }

  if (!action) {
    return visibility
  }
  return visibility[action]
}
