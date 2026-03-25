import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { OrgRole } from '../../auth-context'
import { useAuth } from '../../auth-context'
import { AuthField, SectionCard } from '../../components/ui'
import { getErrorMessage } from '../../lib/api'
import {
  createOrganizationMember,
  fetchOrganizationMembers,
  removeOrganizationMember,
  transferOrganizationOwner,
  updateOrganizationMemberRole,
  type OrganizationMember,
} from '../../features/organizations/api'
import { FormMessage } from '../shared'

const MANAGEABLE_ROLES: OrgRole[] = [
  'member',
  'Project Manager',
  'QA Lead',
  'Senior Developer',
  'Senior QA',
  'Junior Developer',
  'QA Tester',
]

export function ManageUsersPage() {
  const { activeMembership, activeOrgId, session, user } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [draftRoles, setDraftRoles] = useState<Record<number, string>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOrgRole, setSelectedOrgRole] = useState('all')
  const [selectedSystemRole, setSelectedSystemRole] = useState('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    orgRole: MANAGEABLE_ROLES[0],
  })
  const [createPending, setCreatePending] = useState(false)
  const [createError, setCreateError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pendingUserId, setPendingUserId] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!session?.accessToken || !activeOrgId) {
      setMembers([])
      return
    }
    try {
      const result = await fetchOrganizationMembers(session.accessToken, activeOrgId)
      setMembers(result.members)
      setDraftRoles(Object.fromEntries(result.members.map((member) => [member.user_id, member.org_role])))
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load organization members.'))
    }
  }, [activeOrgId, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const orgRoleOptions = useMemo(() => Array.from(new Set(members.map((member) => member.org_role))), [members])
  const systemRoleOptions = useMemo(() => Array.from(new Set(members.map((member) => member.system_role))), [members])

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return members.filter((member) => {
      const matchesSearch =
        query === '' || `${member.username} ${member.email}`.toLowerCase().includes(query)
      const matchesOrgRole = selectedOrgRole === 'all' || member.org_role === selectedOrgRole
      const matchesSystemRole = selectedSystemRole === 'all' || member.system_role === selectedSystemRole

      return matchesSearch && matchesOrgRole && matchesSystemRole
    })
  }, [members, searchQuery, selectedOrgRole, selectedSystemRole])

  const hasActiveFilters = searchQuery.trim() !== '' || selectedOrgRole !== 'all' || selectedSystemRole !== 'all'
  const orgName = activeMembership?.org_name ?? 'this organization'
  const isSuperAdmin = user?.role === 'super_admin'

  useEffect(() => {
    if (!isCreateModalOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !createPending) {
        setIsCreateModalOpen(false)
        setCreateError('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createPending, isCreateModalOpen])

  const runWithUser = async (userId: number, action: () => Promise<void>) => {
    setPendingUserId(userId)
    setMessage('')
    setError('')
    try {
      await action()
      await load()
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to update organization members.'))
    } finally {
      setPendingUserId(null)
    }
  }

  const resetCreateForm = () => {
    setCreateForm({
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      orgRole: MANAGEABLE_ROLES[0],
    })
    setCreateError('')
  }

  const closeCreateModal = () => {
    if (createPending) {
      return
    }
    setIsCreateModalOpen(false)
    resetCreateForm()
  }

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !activeOrgId) {
      setCreateError('Authentication required.')
      return
    }

    setCreatePending(true)
    setCreateError('')

    try {
      const result = await createOrganizationMember(session.accessToken, activeOrgId, {
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        confirm_password: createForm.confirmPassword,
        org_role: createForm.orgRole,
      })
      setMessage(result.message || `New user added to ${orgName}.`)
      setIsCreateModalOpen(false)
      resetCreateForm()
      await load()
    } catch (createUserError) {
      setCreateError(getErrorMessage(createUserError, 'Unable to create user.'))
    } finally {
      setCreatePending(false)
    }
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <SectionCard title="Owner Gate" subtitle="This page is restricted to active organization owners.">
        <p className="body-copy">Owners can change roles, transfer ownership, and remove members. Super admins can also create users directly.</p>
      </SectionCard>

      <SectionCard
        title="Members"
        action={
          isSuperAdmin ? (
            <button
              type="button"
              className="button button--ghost button--tiny"
              onClick={() => {
                resetCreateForm()
                setIsCreateModalOpen(true)
              }}
            >
              New User
            </button>
          ) : undefined
        }
      >
        <div className="list-stack">
          <div className="manage-users-toolbar">
            <div className="manage-users-toolbar__grid">
              <label className="manage-users-toolbar__field manage-users-toolbar__field--search">
                <span>Search</span>
                <input
                  className="input-inline"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by username or email"
                />
              </label>

              <label className="manage-users-toolbar__field">
                <span>Org Role</span>
                <select className="select-inline" value={selectedOrgRole} onChange={(event) => setSelectedOrgRole(event.target.value)}>
                  <option value="all">All roles</option>
                  {orgRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="manage-users-toolbar__field">
                <span>System Role</span>
                <select className="select-inline" value={selectedSystemRole} onChange={(event) => setSelectedSystemRole(event.target.value)}>
                  <option value="all">All system roles</option>
                  {systemRoleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="manage-users-toolbar__summary body-copy">
              Showing {filteredMembers.length} of {members.length} members
            </p>
          </div>

          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => (
              <div key={member.user_id} className="member-card">
                <div className="member-card__header">
                  <strong>{member.username}</strong>
                  <span className={`pill ${member.is_owner ? 'pill--success' : ''}`}>{member.org_role}</span>
                </div>
                <p>{member.email}</p>
                <div className="action-row__controls">
                  {!member.is_owner ? (
                    <>
                      <select
                        className="input-inline select-inline"
                        value={draftRoles[member.user_id] ?? member.org_role}
                        onChange={(event) => setDraftRoles((current) => ({ ...current, [member.user_id]: event.target.value }))}
                      >
                        {MANAGEABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={pendingUserId === member.user_id}
                        onClick={() =>
                          void runWithUser(member.user_id, async () => {
                            await updateOrganizationMemberRole(
                              session!.accessToken,
                              activeOrgId,
                              member.user_id,
                              (draftRoles[member.user_id] ?? member.org_role) as OrgRole,
                            )
                            setMessage('Member role updated.')
                          })
                        }
                      >
                        Save Role
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        disabled={pendingUserId === member.user_id}
                        onClick={() =>
                          void runWithUser(member.user_id, async () => {
                            await transferOrganizationOwner(session!.accessToken, activeOrgId, member.user_id)
                            setMessage(`Ownership of ${orgName} transferred.`)
                          })
                        }
                      >
                        Make Owner of {orgName}
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        disabled={pendingUserId === member.user_id}
                        onClick={() =>
                          void runWithUser(member.user_id, async () => {
                            await removeOrganizationMember(session!.accessToken, activeOrgId, member.user_id)
                            setMessage('Member removed.')
                          })
                        }
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="body-copy">Current owner of {orgName}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="manage-users-empty">
              <strong>{hasActiveFilters ? 'No members match these filters.' : 'No members found yet.'}</strong>
              <p className="body-copy">
                {hasActiveFilters
                  ? 'Try clearing the search or filters to see more members.'
                  : 'Members will appear here once the organization has invited or added users.'}
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      {isCreateModalOpen ? (
        <div className="manage-users-modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <section
            className="manage-users-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-users-create-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="manage-users-modal__header">
              <h2 id="manage-users-create-title">Create User for {orgName}</h2>
              <p className="body-copy">This creates a login account and adds the user to the active organization immediately.</p>
            </div>

            <form className="auth-stack" onSubmit={handleCreateUser}>
              {createError ? <FormMessage tone="error">{createError}</FormMessage> : null}

              <AuthField
                label="Username"
                placeholder="new.user"
                icon="users"
                name="username"
                autoComplete="username"
                value={createForm.username}
                onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                disabled={createPending}
                error={Boolean(createError)}
              />
              <AuthField
                label="Email"
                placeholder="name@example.com"
                icon="mail"
                type="email"
                name="email"
                autoComplete="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                disabled={createPending}
                error={Boolean(createError)}
              />
              <label className="manage-users-modal__field">
                <span>Org Role</span>
                <select
                  className="input-inline select-inline"
                  value={createForm.orgRole}
                  onChange={(event) => setCreateForm((current) => ({ ...current, orgRole: event.target.value as OrgRole }))}
                  disabled={createPending}
                >
                  {MANAGEABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <AuthField
                label="Password"
                placeholder="Create password"
                icon="lock"
                type="password"
                name="password"
                autoComplete="new-password"
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                disabled={createPending}
                error={Boolean(createError)}
                allowVisibilityToggle
              />
              <AuthField
                label="Confirm"
                placeholder="Repeat password"
                icon="lock"
                type="password"
                name="confirm_password"
                autoComplete="new-password"
                value={createForm.confirmPassword}
                onChange={(event) => setCreateForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                disabled={createPending}
                error={Boolean(createError)}
                allowVisibilityToggle
              />

              <div className="auth-actions-row">
                <button type="submit" className="button button--primary" disabled={createPending}>
                  {createPending ? 'Creating...' : 'Create User'}
                </button>
                <button type="button" className="button button--ghost" disabled={createPending} onClick={closeCreateModal}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}
