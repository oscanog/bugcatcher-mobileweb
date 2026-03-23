import { useCallback, useEffect, useState } from 'react'
import type { OrgRole } from '../../auth-context'
import { useAuth } from '../../auth-context'
import { SectionCard } from '../../components/ui'
import { getErrorMessage } from '../../lib/api'
import { fetchOrganizationMembers, removeOrganizationMember, transferOrganizationOwner, updateOrganizationMemberRole, type OrganizationMember } from '../../features/organizations/api'
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
  const { activeOrgId, session } = useAuth()
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [draftRoles, setDraftRoles] = useState<Record<number, string>>({})
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

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <SectionCard title="Owner Gate" subtitle="This page is restricted to active organization owners.">
        <p className="body-copy">Owners can change roles, transfer ownership, and remove members.</p>
      </SectionCard>

      <SectionCard title="Members">
        <div className="list-stack">
          {members.map((member) => (
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
                          setMessage('Ownership transferred.')
                        })
                      }
                    >
                      Make Owner
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
                  <span className="body-copy">Current owner</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
