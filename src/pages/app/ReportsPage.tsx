import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { OrgRole } from '../../auth-context'
import { useAuth } from '../../auth-context'
import { DetailPair, ListRow, SectionCard } from '../../components/ui'
import { canPerformIssueAction, type IssueWorkflowActionKey } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { createIssue, deleteIssue, fetchIssue, fetchIssues, performIssueAction, type IssueDetailResponse, type IssuesResponse } from '../../features/issues/api'
import { fetchOrganizationMembers, type OrganizationMember } from '../../features/organizations/api'
import { EmptySection, FormMessage, LoadingSection, formatDateTime } from '../shared'

export function ReportsPage() {
  const { activeOrgId, session } = useAuth()
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [data, setData] = useState<IssuesResponse | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async (nextStatus = status) => {
    if (!session?.accessToken || !activeOrgId) {
      setData(null)
      return
    }
    try {
      const result = await fetchIssues(session.accessToken, activeOrgId, nextStatus)
      setData(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load issues.'))
    }
  }, [activeOrgId, session?.accessToken, status])

  useEffect(() => {
    void load(status)
  }, [load, status])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !activeOrgId || !title.trim()) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')
    try {
      await createIssue(session.accessToken, {
        org_id: activeOrgId,
        title: title.trim(),
        description: description.trim(),
        labels: [1],
      })
      setTitle('')
      setDescription('')
      setStatus('open')
      setMessage('Issue created.')
      await load('open')
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to create issue.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <SectionCard title="Create Issue" subtitle="Any authenticated org member can open a bug">
        <form className="auth-stack" onSubmit={handleCreate}>
          <input className="input-inline" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Issue title" />
          <textarea className="input-inline textarea-inline" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Issue description" />
          <button type="submit" className="button button--primary" disabled={pending || !title.trim()}>
            {pending ? 'Creating...' : 'Create'}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Issue Filter">
        <div className="chip-row">
          <button type="button" className={`pill-button ${status === 'open' ? 'is-active' : ''}`} onClick={() => setStatus('open')}>
            Open
          </button>
          <button type="button" className={`pill-button ${status === 'closed' ? 'is-active' : ''}`} onClick={() => setStatus('closed')}>
            Closed
          </button>
        </div>
      </SectionCard>

      {!data && !error ? <LoadingSection title="Issues" subtitle="Workflow queue" /> : null}

      {data ? (
        <SectionCard title="Visible Issues" subtitle={`${data.counts.open} open • ${data.counts.closed} closed`}>
          <div className="list-stack">
            {data.issues.map((issue) => (
              <ListRow
                key={issue.id}
                icon="reports"
                title={issue.title}
                detail={`${issue.author_username} • ${issue.assign_status}`}
                meta={issue.status}
                action={
                  <Link className="inline-link" to={`/app/reports/${issue.id}`}>
                    Open
                  </Link>
                }
              />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

function ActionButton({
  label,
  onRun,
  pending,
  tone = 'default',
}: {
  label: string
  onRun: () => void
  pending: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="action-row">
      <strong>{label}</strong>
      <button type="button" className={`button ${tone === 'danger' ? 'button--ghost' : 'button--primary'}`} disabled={pending} onClick={onRun}>
        {pending ? 'Working...' : label}
      </button>
    </div>
  )
}

function ActionPicker({
  label,
  options,
  selected,
  onSelect,
  onRun,
  pending,
}: {
  label: string
  options: OrganizationMember[]
  selected: number
  onSelect: (value: number) => void
  onRun: () => void
  pending: boolean
}) {
  return (
    <div className="action-row">
      <strong>{label}</strong>
      <div className="action-row__controls">
        <select className="input-inline select-inline" value={selected} onChange={(event) => onSelect(Number(event.target.value))}>
          <option value={0}>Select member</option>
          {options.map((option) => (
            <option key={option.user_id} value={option.user_id}>
              {option.username}
            </option>
          ))}
        </select>
        <button type="button" className="button button--primary" disabled={pending || !selected} onClick={onRun}>
          {pending ? 'Working...' : 'Run'}
        </button>
      </div>
    </div>
  )
}

export function ReportDetailPage() {
  const { issueId } = useParams()
  const navigate = useNavigate()
  const { activeMembership, activeOrgId, session } = useAuth()
  const [data, setData] = useState<IssueDetailResponse | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [selections, setSelections] = useState<Record<string, number>>({})

  const numericIssueId = Number(issueId)

  const load = useCallback(async () => {
    if (!session?.accessToken || !activeOrgId || !numericIssueId) {
      setData(null)
      return
    }

    try {
      const [issueResult, membersResult] = await Promise.all([
        fetchIssue(session.accessToken, activeOrgId, numericIssueId),
        fetchOrganizationMembers(session.accessToken, activeOrgId),
      ])
      setData(issueResult)
      setMembers(membersResult.members)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load issue detail.'))
    }
  }, [activeOrgId, numericIssueId, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const memberOptions = (role: OrgRole) => members.filter((member) => member.org_role === role)
  const actionVisibility = data?.issue ? (canPerformIssueAction(session, data.issue) as Record<IssueWorkflowActionKey, boolean>) : null

  const runAction = async (action: string, payload: Record<string, unknown>) => {
    if (!session?.accessToken || !data) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    try {
      await performIssueAction(session.accessToken, data.issue.id, action, payload)
      setMessage('Issue workflow updated.')
      await load()
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to update issue workflow.'))
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.accessToken || !data || !activeOrgId) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    try {
      await deleteIssue(session.accessToken, data.issue.id, activeOrgId)
      navigate('/app/reports', { replace: true })
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to delete issue.'))
    } finally {
      setPending(false)
    }
  }

  if (!numericIssueId) {
    return <EmptySection title="Issue Detail" message="Issue id is invalid." />
  }

  if (!data && !error) {
    return <LoadingSection title="Issue Detail" subtitle={`Issue #${numericIssueId}`} />
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {data ? (
        <>
          <SectionCard title={data.issue.title} subtitle={data.issue.assign_status}>
            <div className="detail-pairs">
              <DetailPair label="Status" value={data.issue.status} />
              <DetailPair label="Author" value={data.issue.author_username} />
              <DetailPair label="Active Role" value={activeMembership?.role ?? 'No org'} />
              <DetailPair label="Created" value={formatDateTime(data.issue.created_at)} />
            </div>
            <p className="body-copy">{data.issue.description || 'No issue description provided.'}</p>
          </SectionCard>

          <SectionCard title="Workflow Actions">
            <div className="list-stack">
              {actionVisibility?.['assign-dev'] ? (
                <ActionPicker
                  label="Assign Senior Developer"
                  options={memberOptions('Senior Developer')}
                  selected={selections['assign-dev'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-dev': value }))}
                  onRun={() => void runAction('assign-dev', { org_id: activeOrgId, dev_id: selections['assign-dev'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['assign-junior'] ? (
                <ActionPicker
                  label="Assign Junior Developer"
                  options={memberOptions('Junior Developer')}
                  selected={selections['assign-junior'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-junior': value }))}
                  onRun={() => void runAction('assign-junior', { org_id: activeOrgId, junior_id: selections['assign-junior'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['junior-done'] ? <ActionButton label="Mark Junior Done" onRun={() => void runAction('junior-done', { org_id: activeOrgId })} pending={pending} /> : null}
              {actionVisibility?.['assign-qa'] ? (
                <ActionPicker
                  label="Assign QA Tester"
                  options={memberOptions('QA Tester')}
                  selected={selections['assign-qa'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-qa': value }))}
                  onRun={() => void runAction('assign-qa', { org_id: activeOrgId, qa_id: selections['assign-qa'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['report-senior-qa'] ? (
                <ActionPicker
                  label="Report to Senior QA"
                  options={memberOptions('Senior QA')}
                  selected={selections['report-senior-qa'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'report-senior-qa': value }))}
                  onRun={() => void runAction('report-senior-qa', { org_id: activeOrgId, senior_qa_id: selections['report-senior-qa'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['report-qa-lead'] ? (
                <ActionPicker
                  label="Report to QA Lead"
                  options={memberOptions('QA Lead')}
                  selected={selections['report-qa-lead'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'report-qa-lead': value }))}
                  onRun={() => void runAction('report-qa-lead', { org_id: activeOrgId, qa_lead_id: selections['report-qa-lead'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['qa-lead-approve'] ? <ActionButton label="Approve Issue" onRun={() => void runAction('qa-lead-approve', { org_id: activeOrgId })} pending={pending} /> : null}
              {actionVisibility?.['qa-lead-reject'] ? <ActionButton label="Reject Issue" onRun={() => void runAction('qa-lead-reject', { org_id: activeOrgId })} pending={pending} tone="danger" /> : null}
              {actionVisibility?.['pm-close'] ? <ActionButton label="Close Issue" onRun={() => void runAction('pm-close', { org_id: activeOrgId })} pending={pending} /> : null}
              {actionVisibility?.delete ? <ActionButton label="Delete Issue" onRun={() => void handleDelete()} pending={pending} tone="danger" /> : null}
              {!Object.values(actionVisibility ?? {}).some(Boolean) ? <p className="body-copy">No workflow action is available for your role and the current issue state.</p> : null}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
