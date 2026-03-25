import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { DetailPair, SectionCard } from '../../components/ui'
import {
  deleteChecklistItem,
  fetchChecklistItem,
  uploadChecklistItemAttachments,
  updateChecklistItem,
  updateChecklistItemStatus,
  type ChecklistAssigneeOption,
  type ChecklistItemDetailResponse,
} from '../../features/checklist/api'
import { canManageChecklist } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { EmptySection, FormMessage, LoadingSection, formatDateTime } from '../shared'

const CHECKLIST_PRIORITY_OPTIONS = ['low', 'medium', 'high']
const CHECKLIST_REQUIRED_ROLE_OPTIONS = [
  'QA Lead',
  'Senior QA',
  'QA Tester',
  'Project Manager',
  'Senior Developer',
  'Junior Developer',
  'Junior Developer',
  'member',
  'owner',
]
const CHECKLIST_STATUS_OPTIONS = [
  'open',
  'in_progress',
  'passed',
  'failed',
  'blocked',
]

interface ItemDraftState {
  sequenceNo: string
  title: string
  moduleName: string
  submoduleName: string
  description: string
  priority: string
  requiredRole: string
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function buildDraft(data: ChecklistItemDetailResponse): ItemDraftState {
  return {
    sequenceNo: `${data.item.sequence_no}`,
    title: data.item.title,
    moduleName: data.item.module_name,
    submoduleName: data.item.submodule_name ?? '',
    description: data.item.description ?? '',
    priority: data.item.priority,
    requiredRole: data.item.required_role,
  }
}

export function ChecklistItemDetailPage() {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { activeOrgId, activeScope, getMembershipForOrg, session } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [data, setData] = useState<ChecklistItemDetailResponse | null>(null)
  const [draft, setDraft] = useState<ItemDraftState | null>(null)
  const [assignmentUserId, setAssignmentUserId] = useState('0')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSavingAssignment, setIsSavingAssignment] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [isSavingStatus, setIsSavingStatus] = useState(false)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [statusDraft, setStatusDraft] = useState('open')

  const numericItemId = Number(itemId)
  const itemMembership = data ? getMembershipForOrg(data.item.org_id) : null
  const canManageItem = canManageChecklist(session, itemMembership)

  const load = useCallback(async () => {
    if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || !numericItemId) {
      setData(null)
      return
    }

    const result = await fetchChecklistItem(session.accessToken, activeScope === 'org' ? activeOrgId : null, numericItemId)
    setData(result)
    setDraft(buildDraft(result))
    setAssignmentUserId(`${result.item.assigned_to_user_id ?? 0}`)
    setStatusDraft(result.item.status)
  }, [activeOrgId, activeScope, numericItemId, session?.accessToken])

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || !activeOrgId || !numericItemId) {
        setData(null)
        return
      }

      try {
        await load()
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist item detail.'))
      }
    }

    void run()
  }, [activeOrgId, load, numericItemId, session?.accessToken])

  if (!numericItemId) {
    return <EmptySection title="Checklist Item" message="Checklist item id is invalid." />
  }

  if (!data && !error) {
    return <LoadingSection title="Checklist Item" subtitle={`Item #${numericItemId}`} />
  }

  const assignableTesters = data?.assignable_testers ?? []
  const hasAssignmentChanged = Number(assignmentUserId) !== (data?.item.assigned_to_user_id ?? 0)
  const selectedAssignee = assignableTesters.find((member) => member.user_id === (data?.item.assigned_to_user_id ?? 0))

  const handleAssignmentSave = async () => {
    if (!session?.accessToken || !data || !hasAssignmentChanged) {
      return
    }

    setIsSavingAssignment(true)
    setError('')
    setMessage('')

    try {
      await updateChecklistItem(session.accessToken, data.item.org_id, data.item.id, {
        assigned_to_user_id: Number(assignmentUserId) || 0,
      })
      await load()
      setMessage(Number(assignmentUserId) > 0 ? 'Checklist item assigned to QA Tester.' : 'Checklist item unassigned.')
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save checklist assignment.'))
    } finally {
      setIsSavingAssignment(false)
    }
  }

  const handleEditSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !data || !draft) {
      return
    }

    setIsSavingEdit(true)
    setError('')
    setMessage('')

    try {
      await updateChecklistItem(session.accessToken, data.item.org_id, data.item.id, {
        sequence_no: Math.max(1, Number(draft.sequenceNo) || data.item.sequence_no),
        title: draft.title.trim(),
        module_name: draft.moduleName.trim(),
        submodule_name: draft.submoduleName.trim(),
        description: draft.description.trim(),
        priority: draft.priority,
        required_role: draft.requiredRole,
      })
      await load()
      setMessage('Checklist item updated.')
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to update checklist item.'))
    } finally {
      setIsSavingEdit(false)
    }
  }

  const handleStatusSave = async () => {
    if (!session?.accessToken || !data) {
      return
    }

    if (statusDraft === data.item.status) {
      return
    }

    setIsSavingStatus(true)
    setError('')
    setMessage('')

    try {
      await updateChecklistItemStatus(session.accessToken, data.item.org_id, data.item.id, statusDraft)
      await load()
      setMessage('Status updated.')
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to update status.'))
    } finally {
      setIsSavingStatus(false)
    }
  }

  const handleDelete = async () => {
    if (!session?.accessToken || !data) {
      return
    }

    const confirmed = window.confirm(`Delete checklist item "${data.item.title}"?`)
    if (!confirmed) {
      return
    }

    setIsDeleting(true)
    setError('')
    setMessage('')

    try {
      await deleteChecklistItem(session.accessToken, data.item.org_id, data.item.id)
      navigate(`/app/checklist/batches/${data.item.batch_id}`, { replace: true })
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete checklist item.'))
      setIsDeleting(false)
    }
  }

  const handleAttachmentUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!session?.accessToken || !data || !numericItemId || files.length === 0) {
      return
    }

    setIsUploadingAttachments(true)
    setError('')
    setMessage('')
    try {
      const result = await uploadChecklistItemAttachments(session.accessToken, data.item.org_id, numericItemId, files)
      setData((current) => current ? { ...current, attachments: result.attachments } : current)
      setMessage(result.uploaded_count === 1 ? '1 attachment uploaded.' : `${result.uploaded_count} attachments uploaded.`)
      await load()
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, 'Unable to upload attachments.'))
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setIsUploadingAttachments(false)
    }
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {data ? (
        <>
          <SectionCard
            title={data.item.title}
            subtitle={`${data.item.project_name || 'Checklist item'} • ${data.item.batch_title || `Batch #${data.item.batch_id}`}`}
            action={canManageItem ? (
              <Link className="inline-link" to={`/app/checklist/batches/${data.item.batch_id}`}>
                Back to batch
              </Link>
            ) : null}
          >
            <div className="detail-pairs">
              <DetailPair label="Sequence" value={`${data.item.sequence_no}`} />
              <DetailPair label="Organization" value={data.item.org_name || 'Organization'} />
              <DetailPair label="Status" value={data.item.status} />
              <DetailPair label="Priority" value={data.item.priority} />
              <DetailPair label="Required Role" value={data.item.required_role} />
              <DetailPair label="Module" value={data.item.module_name} />
              <DetailPair label="Submodule" value={data.item.submodule_name || 'None'} />
              <DetailPair label="Assignee" value={data.item.assigned_to_name || 'Unassigned'} />
              <DetailPair label="Linked Issue" value={data.item.issue_id ? `#${data.item.issue_id}` : 'None'} />
            </div>
          </SectionCard>

          <SectionCard title="Description" subtitle={data.item.full_title}>
            <p className="body-copy">{data.item.description || 'No description added yet.'}</p>
          </SectionCard>

          <SectionCard title="Workflow" subtitle="Update item status">
            <div className="action-row">
              <select
                className="select-inline"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                disabled={isSavingStatus}
              >
                {CHECKLIST_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button button--primary"
                onClick={() => void handleStatusSave()}
                disabled={isSavingStatus || statusDraft === data.item.status}
              >
                {isSavingStatus ? 'Updating...' : 'Update Status'}
              </button>
            </div>
            {data.item.issue_id ? (
              <p className="checklist-detail-note" style={{marginTop: '10px'}}>
                Linked issue #{data.item.issue_id} exists.
                <Link className="inline-link" to={`/app/reports/${data.item.issue_id}`} style={{marginLeft: '10px'}}>
                  Open linked issue
                </Link>
              </p>
            ) : null}
          </SectionCard>

          <SectionCard title="Attachments" subtitle={`${data.attachments.length} file${data.attachments.length === 1 ? '' : 's'}`}>
            <div className="checklist-detail-actions" style={{ marginBottom: '16px' }}>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                multiple
                accept="image/*,video/mp4,video/webm,video/quicktime"
                onChange={(event) => void handleAttachmentUpload(event)}
              />
              <button
                type="button"
                className="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAttachments}
              >
                {isUploadingAttachments ? 'Uploading...' : 'Upload Evidence'}
              </button>
            </div>
            {data.attachments.length ? (
              <div className="checklist-attachment-list">
                {data.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    className="checklist-attachment"
                    href={attachment.file_path || '#'}
                    target={attachment.file_path ? '_blank' : undefined}
                    rel={attachment.file_path ? 'noreferrer' : undefined}
                  >
                    <strong>{attachment.original_name}</strong>
                    <span>
                      {attachment.uploaded_by_name || 'Unknown uploader'}
                      {attachment.file_size ? ` • ${formatFileSize(attachment.file_size)}` : ''}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="body-copy">No attachments uploaded for this item.</p>
            )}
          </SectionCard>

          <SectionCard title="History">
            <div className="detail-pairs">
              <DetailPair label="Created By" value={data.item.created_by_name} />
              <DetailPair label="Updated By" value={data.item.updated_by_name || 'Not updated'} />
              <DetailPair label="Created At" value={formatDateTime(data.item.created_at)} />
              <DetailPair label="Updated At" value={formatDateTime(data.item.updated_at)} />
              <DetailPair label="Started At" value={formatDateTime(data.item.started_at)} />
              <DetailPair label="Completed At" value={formatDateTime(data.item.completed_at)} />
            </div>
          </SectionCard>

          <SectionCard title="Related Links">
            <div className="checklist-detail-actions">
              <p className="checklist-detail-note">Batch status: {data.item.batch_status || 'Unknown'}</p>
              {data.item.batch_page_url ? (
                <a className="inline-link" href={data.item.batch_page_url} target="_blank" rel="noreferrer noopener">
                  Open tested page
                </a>
              ) : (
                <p className="body-copy">No tested page link was saved for this checklist batch yet.</p>
              )}
            </div>
          </SectionCard>

          {canManageItem ? (
            <>
              <SectionCard title="Assign QA Tester" subtitle={selectedAssignee ? `${selectedAssignee.username} is assigned` : 'Unassigned'}>
                <div className="action-row">
                  <select
                    className="select-inline"
                    value={assignmentUserId}
                    onChange={(event) => setAssignmentUserId(event.target.value)}
                    disabled={isSavingAssignment}
                  >
                    <option value="0">Unassigned</option>
                    {assignableTesters.map((member: ChecklistAssigneeOption) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.username}
                      </option>
                    ))}
                  </select>
                  {assignableTesters.length === 0 ? (
                    <p className="body-copy">No QA Tester members are available in this organization.</p>
                  ) : null}
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => void handleAssignmentSave()}
                    disabled={isSavingAssignment || !hasAssignmentChanged}
                  >
                    {isSavingAssignment ? 'Saving...' : 'Save assignment'}
                  </button>
                </div>
              </SectionCard>

              <SectionCard title="Edit Item" subtitle="Manager-only fields">
                {draft ? (
                  <form className="inline-form" onSubmit={handleEditSave}>
                    <input
                      className="input-inline"
                      type="number"
                      min="1"
                      value={draft.sequenceNo}
                      onChange={(event) => setDraft((current) => (current ? { ...current, sequenceNo: event.target.value } : current))}
                      placeholder="Sequence number"
                      disabled={isSavingEdit}
                    />
                    <input
                      className="input-inline"
                      value={draft.title}
                      onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                      placeholder="Checklist item title"
                      disabled={isSavingEdit}
                    />
                    <input
                      className="input-inline"
                      value={draft.moduleName}
                      onChange={(event) => setDraft((current) => (current ? { ...current, moduleName: event.target.value } : current))}
                      placeholder="Module"
                      disabled={isSavingEdit}
                    />
                    <input
                      className="input-inline"
                      value={draft.submoduleName}
                      onChange={(event) => setDraft((current) => (current ? { ...current, submoduleName: event.target.value } : current))}
                      placeholder="Submodule"
                      disabled={isSavingEdit}
                    />
                    <select
                      className="select-inline"
                      value={draft.priority}
                      onChange={(event) => setDraft((current) => (current ? { ...current, priority: event.target.value } : current))}
                      disabled={isSavingEdit}
                    >
                      {CHECKLIST_PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select-inline"
                      value={draft.requiredRole}
                      onChange={(event) => setDraft((current) => (current ? { ...current, requiredRole: event.target.value } : current))}
                      disabled={isSavingEdit}
                    >
                      {CHECKLIST_REQUIRED_ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="textarea-inline"
                      value={draft.description}
                      onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                      placeholder="Description"
                      disabled={isSavingEdit}
                    />
                    <button type="submit" className="button button--primary" disabled={isSavingEdit}>
                      {isSavingEdit ? 'Saving...' : 'Save changes'}
                    </button>
                  </form>
                ) : null}
              </SectionCard>

              <SectionCard title="Delete Item" subtitle="This action cannot be undone.">
                <div className="checklist-detail-danger">
                  <p className="body-copy">Delete this checklist item if it should no longer appear in the batch.</p>
                  <button type="button" className="button button--danger" disabled={isDeleting} onClick={() => void handleDelete()}>
                    {isDeleting ? 'Deleting...' : 'Delete item'}
                  </button>
                </div>
              </SectionCard>
            </>
          ) : null}

        </>
      ) : null}
    </div>
  )
}
