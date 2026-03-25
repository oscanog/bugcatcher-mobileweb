import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { DetailPair, ListRow, SectionCard } from '../../components/ui'
import { canManageChecklist } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { fetchChecklistBatch, fetchChecklistBatches, type ChecklistAttachment, type ChecklistBatchDetailResponse, type ChecklistBatchesResponse } from '../../features/checklist/api'
import { EmptySection, FormMessage, LoadingSection } from '../shared'

function isImageAttachment(attachment: ChecklistAttachment) {
  return (attachment.mime_type || '').startsWith('image/')
}

export function ChecklistPage() {
  const { activeOrgId, activeScope, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchesResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || activeScope === 'none') {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatches(session.accessToken, activeScope === 'org' ? activeOrgId : null)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batches.'))
      }
    }
    void run()
  }, [activeOrgId, activeScope, session?.accessToken])

  if (!data && !error) {
    return <LoadingSection title="Checklist" subtitle="Batch tracking" />
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {canManageChecklist(session) ? (
        <SectionCard title="Manager Scope" subtitle="Owner, Project Manager, and QA Lead">
          <p className="body-copy">Checklist CRUD is backed by the legacy API and ready for deeper dynamic expansion.</p>
        </SectionCard>
      ) : null}
      {data ? (
        <SectionCard title="Checklist Batches" subtitle={`${data.batches.length} batch${data.batches.length === 1 ? '' : 'es'}`}>
          <div className="list-stack">
            {data.batches.map((batch) => (
              <ListRow
                key={batch.id}
                icon="checklist"
                title={batch.title}
                detail={`${batch.org_name || batch.project_name} • ${batch.project_name} • ${batch.module_name}${batch.submodule_name ? ` / ${batch.submodule_name}` : ''}`}
                meta={`${batch.status} • ${batch.total_items ?? 0} items`}
                action={
                  <Link className="inline-link" to={`/app/checklist/batches/${batch.id}`}>
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

export function ChecklistBatchDetailPage() {
  const { batchId } = useParams()
  const { activeOrgId, activeScope, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchDetailResponse | null>(null)
  const [error, setError] = useState('')

  const numericBatchId = Number(batchId)

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || !numericBatchId) {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatch(session.accessToken, activeScope === 'org' ? activeOrgId : null, numericBatchId)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batch detail.'))
      }
    }
    void run()
  }, [activeOrgId, activeScope, numericBatchId, session?.accessToken])

  if (!numericBatchId) {
    return <EmptySection title="Checklist Detail" message="Batch id is invalid." />
  }

  if (!data && !error) {
    return <LoadingSection title="Checklist Detail" subtitle={`Batch #${numericBatchId}`} />
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {data ? (
        <>
          <SectionCard title={data.batch.title} subtitle={data.batch.project_name}>
            <div className="detail-pairs">
              <DetailPair label="Module" value={data.batch.module_name} />
              <DetailPair label="Organization" value={data.batch.org_name || 'Organization'} />
              <DetailPair label="Submodule" value={data.batch.submodule_name || 'None'} />
              <DetailPair label="Status" value={data.batch.status} />
              <DetailPair label="QA Lead" value={data.batch.qa_lead_name || 'Unassigned'} />
            </div>
          </SectionCard>

          <SectionCard title="Screenshots" subtitle={`${data.attachments.length} file${data.attachments.length === 1 ? '' : 's'}`}>
            {data.attachments.length ? (
              <>
                {data.attachments.filter(isImageAttachment).length ? (
                  <div className="checklist-batch-gallery">
                    {data.attachments.filter(isImageAttachment).map((attachment) => (
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
                {data.attachments.filter((attachment) => !isImageAttachment(attachment)).length ? (
                  <div className="checklist-attachment-list">
                    {data.attachments.filter((attachment) => !isImageAttachment(attachment)).map((attachment) => (
                      <a
                        key={attachment.id}
                        className="checklist-attachment"
                        href={attachment.file_path || '#'}
                        target={attachment.file_path ? '_blank' : undefined}
                        rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                      >
                        <strong>{attachment.original_name}</strong>
                        <span>{attachment.uploaded_by_name || 'Unknown uploader'}</span>
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="body-copy">No AI-chat screenshots or batch attachments have been saved for this checklist batch yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Items">
            <div className="list-stack">
              {data.items.map((item) => (
                <ListRow
                  key={item.id}
                  icon="checklist"
                  title={item.title}
                  detail={`${item.org_name || data.batch.org_name || 'Organization'} • ${item.required_role} • ${item.status}`}
                  meta={item.assigned_to_name || 'Unassigned'}
                  action={
                    <div className="list-row__actions">
                      <span className="pill">{item.priority}</span>
                      {item.issue_id ? (
                        <Link className="inline-link" to={`/app/reports/${item.issue_id}`}>
                          Linked Issue
                        </Link>
                      ) : null}
                      <Link className="inline-link" to={`/app/checklist/items/${item.id}`}>
                        Open
                      </Link>
                    </div>
                  }
                />
              ))}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
