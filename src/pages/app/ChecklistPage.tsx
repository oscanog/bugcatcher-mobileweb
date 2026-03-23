import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { DetailPair, ListRow, SectionCard } from '../../components/ui'
import { canManageChecklist } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { fetchChecklistBatch, fetchChecklistBatches, type ChecklistBatchDetailResponse, type ChecklistBatchesResponse } from '../../features/checklist/api'
import { EmptySection, FormMessage, LoadingSection } from '../shared'

export function ChecklistPage() {
  const { activeOrgId, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchesResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || !activeOrgId) {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatches(session.accessToken, activeOrgId)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batches.'))
      }
    }
    void run()
  }, [activeOrgId, session?.accessToken])

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
                detail={`${batch.project_name} • ${batch.module_name}${batch.submodule_name ? ` / ${batch.submodule_name}` : ''}`}
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
  const { activeOrgId, session } = useAuth()
  const [data, setData] = useState<ChecklistBatchDetailResponse | null>(null)
  const [error, setError] = useState('')

  const numericBatchId = Number(batchId)

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || !activeOrgId || !numericBatchId) {
        setData(null)
        return
      }
      try {
        const result = await fetchChecklistBatch(session.accessToken, activeOrgId, numericBatchId)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load checklist batch detail.'))
      }
    }
    void run()
  }, [activeOrgId, numericBatchId, session?.accessToken])

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
              <DetailPair label="Submodule" value={data.batch.submodule_name || 'None'} />
              <DetailPair label="Status" value={data.batch.status} />
              <DetailPair label="QA Lead" value={data.batch.qa_lead_name || 'Unassigned'} />
            </div>
          </SectionCard>

          <SectionCard title="Items">
            <div className="list-stack">
              {data.items.map((item) => (
                <ListRow
                  key={item.id}
                  icon="checklist"
                  title={item.title}
                  detail={`${item.required_role} • ${item.status}`}
                  meta={item.assigned_to_name || 'Unassigned'}
                  action={
                    item.issue_id ? (
                      <Link className="inline-link" to={`/app/reports/${item.issue_id}`}>
                        Linked Issue
                      </Link>
                    ) : (
                      <span className="pill">{item.priority}</span>
                    )
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
