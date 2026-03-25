import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { OrgRole } from '../../auth-context'
import { useAuth } from '../../auth-context'
import { DetailPair, ListRow, SectionCard } from '../../components/ui'
import { canPerformIssueAction, type IssueWorkflowActionKey } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { createIssue, deleteIssue, fetchIssue, fetchIssues, performIssueAction, type IssueDetailResponse, type IssuesResponse } from '../../features/issues/api'
import { fetchOrganizationMembers, type OrganizationMember } from '../../features/organizations/api'
import { EmptySection, FormMessage, LoadingSection, formatDateTime } from '../shared'

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function isImageAttachment(attachment: { mime_type: string }) {
  return attachment.mime_type.startsWith('image/')
}

export function ReportsPage() {
  const { activeOrgId, activeScope, lastOrgId, memberships, session } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [createOrgId, setCreateOrgId] = useState(0)
  const [status, setStatus] = useState<'open' | 'closed'>('open')
  const [data, setData] = useState<IssuesResponse | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const fallbackOrgId = activeOrgId || lastOrgId || memberships[0]?.org_id || 0
    setCreateOrgId((current) => current || fallbackOrgId)
  }, [activeOrgId, lastOrgId, memberships])

  const load = useCallback(async (nextStatus = status) => {
    if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || activeScope === 'none') {
      setData(null)
      return
    }
    try {
      const result = await fetchIssues(session.accessToken, activeScope === 'org' ? activeOrgId : null, nextStatus)
      setData(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load issues.'))
    }
  }, [activeOrgId, activeScope, session?.accessToken, status])

  useEffect(() => {
    void load(status)
  }, [load, status])

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachments(Array.from(event.target.files ?? []))
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const targetOrgId = activeScope === 'all' ? createOrgId : activeOrgId
    if (!session?.accessToken || !targetOrgId || !title.trim()) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')
    try {
      await createIssue(session.accessToken, {
        org_id: targetOrgId,
        title: title.trim(),
        description: description.trim(),
        labels: [1],
      }, attachments)
      setTitle('')
      setDescription('')
      setAttachments([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
          {activeScope === 'all' ? (
            <select className="input-inline select-inline" value={createOrgId} onChange={(event) => setCreateOrgId(Number(event.target.value) || 0)}>
              {memberships.map((membership) => (
                <option key={membership.org_id} value={membership.org_id}>
                  {membership.org_name}
                </option>
              ))}
            </select>
          ) : null}
          <input className="input-inline" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Issue title" />
          <textarea className="input-inline textarea-inline" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Issue description" />
          <div className="action-row">
            <button type="button" className="button button--ghost" onClick={() => fileInputRef.current?.click()} disabled={pending}>
              Add Evidence
            </button>
            <span className="body-copy">{attachments.length ? `${attachments.length} file${attachments.length === 1 ? '' : 's'} selected` : 'Images are optional.'}</span>
          </div>
          {attachments.length ? (
            <div className="file-pill-list">
              {attachments.map((file) => (
                <span key={`${file.name}-${file.size}`} className="pill">{file.name} • {formatFileSize(file.size)}</span>
              ))}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            hidden
            onChange={handleAttachmentChange}
          />
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
                detail={`${issue.org_name} • ${issue.author_username} • ${issue.assign_status}`}
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
  const { activeOrgId, activeScope, getMembershipForOrg, session } = useAuth()
  const [data, setData] = useState<IssueDetailResponse | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [selections, setSelections] = useState<Record<string, number>>({})

  const numericIssueId = Number(issueId)

  const load = useCallback(async () => {
    if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || !numericIssueId) {
      setData(null)
      setMembers([])
      return
    }

    try {
      const issueResult = await fetchIssue(session.accessToken, activeScope === 'org' ? activeOrgId : null, numericIssueId)
      setData(issueResult)
      setError('')

      try {
        const membersResult = await fetchOrganizationMembers(session.accessToken, issueResult.issue.org_id)
        setMembers(membersResult.members)
      } catch {
        // Some roles can view an issue without being allowed to list org members.
        setMembers([])
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load issue detail.'))
    }
  }, [activeOrgId, activeScope, numericIssueId, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const memberOptions = (role: OrgRole) => members.filter((member) => member.org_role === role)
  const issueMembership = data ? getMembershipForOrg(data.issue.org_id) : null
  const actionVisibility = data?.issue
    ? (canPerformIssueAction(session, data.issue, issueMembership) as Record<IssueWorkflowActionKey, boolean>)
    : null

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
    if (!session?.accessToken || !data) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    try {
      await deleteIssue(session.accessToken, data.issue.id, data.issue.org_id)
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
              <DetailPair label="Organization" value={data.issue.org_name} />
              <DetailPair label="Author" value={data.issue.author_username} />
              <DetailPair label="Active Role" value={issueMembership?.role ?? 'No org'} />
              <DetailPair label="Created" value={formatDateTime(data.issue.created_at, data.issue.created_at_iso)} />
            </div>
            <p className="body-copy">{data.issue.description || 'No issue description provided.'}</p>
          </SectionCard>

          <SectionCard title="Evidence" subtitle={`${data.issue.attachments.length} file${data.issue.attachments.length === 1 ? '' : 's'}`}>
            {data.issue.attachments.length ? (
              <>
                {data.issue.attachments.filter(isImageAttachment).length ? (
                  <div className="checklist-batch-gallery">
                    {data.issue.attachments.filter(isImageAttachment).map((attachment) => (
                      <a
                        key={attachment.id}
                        className="checklist-batch-gallery__item"
                        href={attachment.file_path || '#'}
                        target={attachment.file_path ? '_blank' : undefined}
                        rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                      >
                        <img src={attachment.file_path} alt={attachment.original_name} loading="lazy" />
                        <span>{attachment.original_name}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
                {data.issue.attachments.filter((attachment) => !isImageAttachment(attachment)).length ? (
                  <div className="checklist-attachment-list">
                    {data.issue.attachments.filter((attachment) => !isImageAttachment(attachment)).map((attachment) => (
                      <a
                        key={attachment.id}
                        className="checklist-attachment"
                        href={attachment.file_path || '#'}
                        target={attachment.file_path ? '_blank' : undefined}
                        rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                      >
                        <strong>{attachment.original_name}</strong>
                        <span>{attachment.mime_type} • {formatFileSize(attachment.file_size)}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="body-copy">No evidence uploaded for this issue yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Workflow Actions">
            <div className="list-stack">
              {actionVisibility?.['assign-dev'] ? (
                <ActionPicker
                  label="Assign Senior Developer"
                  options={memberOptions('Senior Developer')}
                  selected={selections['assign-dev'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-dev': value }))}
                  onRun={() => void runAction('assign-dev', { org_id: data.issue.org_id, dev_id: selections['assign-dev'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['assign-junior'] ? (
                <ActionPicker
                  label="Assign Junior Developer"
                  options={memberOptions('Junior Developer')}
                  selected={selections['assign-junior'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-junior': value }))}
                  onRun={() => void runAction('assign-junior', { org_id: data.issue.org_id, junior_id: selections['assign-junior'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['junior-done'] ? <ActionButton label="Mark Junior Done" onRun={() => void runAction('junior-done', { org_id: data.issue.org_id })} pending={pending} /> : null}
              {actionVisibility?.['assign-qa'] ? (
                <ActionPicker
                  label="Assign QA Tester"
                  options={memberOptions('QA Tester')}
                  selected={selections['assign-qa'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'assign-qa': value }))}
                  onRun={() => void runAction('assign-qa', { org_id: data.issue.org_id, qa_id: selections['assign-qa'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['report-senior-qa'] ? (
                <ActionPicker
                  label="Report to Senior QA"
                  options={memberOptions('Senior QA')}
                  selected={selections['report-senior-qa'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'report-senior-qa': value }))}
                  onRun={() => void runAction('report-senior-qa', { org_id: data.issue.org_id, senior_qa_id: selections['report-senior-qa'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['report-qa-lead'] ? (
                <ActionPicker
                  label="Report to QA Lead"
                  options={memberOptions('QA Lead')}
                  selected={selections['report-qa-lead'] ?? 0}
                  onSelect={(value) => setSelections((current) => ({ ...current, 'report-qa-lead': value }))}
                  onRun={() => void runAction('report-qa-lead', { org_id: data.issue.org_id, qa_lead_id: selections['report-qa-lead'] })}
                  pending={pending}
                />
              ) : null}
              {actionVisibility?.['qa-lead-approve'] ? <ActionButton label="Approve Issue" onRun={() => void runAction('qa-lead-approve', { org_id: data.issue.org_id })} pending={pending} /> : null}
              {actionVisibility?.['qa-lead-reject'] ? <ActionButton label="Reject Issue" onRun={() => void runAction('qa-lead-reject', { org_id: data.issue.org_id })} pending={pending} tone="danger" /> : null}
              {actionVisibility?.['pm-close'] ? <ActionButton label="Close Issue" onRun={() => void runAction('pm-close', { org_id: data.issue.org_id })} pending={pending} /> : null}
              {actionVisibility?.delete ? <ActionButton label="Delete Issue" onRun={() => void handleDelete()} pending={pending} tone="danger" /> : null}
              {!Object.values(actionVisibility ?? {}).some(Boolean) ? <p className="body-copy">No workflow action is available for your role and the current issue state.</p> : null}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
