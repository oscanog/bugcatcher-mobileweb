import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { DetailPair, ListRow, SectionCard } from '../../components/ui'
import { canManageProjects } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { fetchProject, setProjectStatus, updateProject, type ProjectDetailResponse } from '../../features/projects/api'
import { FormMessage, LoadingSection, formatDateTime } from '../shared'

export function ProjectDetailPage() {
  const { projectId } = useParams()
  const { activeOrgId, activeScope, getMembershipForOrg, session } = useAuth()
  const [data, setData] = useState<ProjectDetailResponse | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const numericProjectId = Number(projectId)

  const load = useCallback(async () => {
    if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || !numericProjectId) {
      setData(null)
      return
    }

    try {
      const result = await fetchProject(session.accessToken, activeScope === 'org' ? activeOrgId : null, numericProjectId)
      setData(result)
      setName(result.project.name)
      setCode(result.project.code || '')
      setDescription(result.project.description || '')
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load project detail.'))
    }
  }, [activeOrgId, activeScope, numericProjectId, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !data || !numericProjectId || !name.trim()) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    try {
      await updateProject(session.accessToken, numericProjectId, {
        org_id: data.project.org_id,
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        status: data?.project.status ?? 'active',
      })
      setMessage('Project updated.')
      await load()
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to update project.'))
    } finally {
      setPending(false)
    }
  }

  const handleStatus = async (nextStatus: 'active' | 'archived') => {
    if (!session?.accessToken || !data || !numericProjectId) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')
    try {
      await setProjectStatus(session.accessToken, numericProjectId, data.project.org_id, nextStatus)
      setMessage(nextStatus === 'archived' ? 'Project archived.' : 'Project activated.')
      await load()
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to update project status.'))
    } finally {
      setPending(false)
    }
  }

  if (!data && !error) {
    return <LoadingSection title="Project Detail" subtitle={`Project #${numericProjectId || '-'}`} />
  }

  const projectMembership = data ? getMembershipForOrg(data.project.org_id) : null
  const canEditProject = canManageProjects(session, projectMembership)

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {data ? (
        <>
          <SectionCard title={data.project.name} subtitle={data.project.code || 'No project code'}>
            <div className="detail-pairs">
              <DetailPair label="Status" value={data.project.status} />
              <DetailPair label="Organization" value={data.project.org_name} />
              <DetailPair label="Created" value={formatDateTime(data.project.created_at)} />
              <DetailPair label="Updated" value={formatDateTime(data.project.updated_at || data.project.created_at)} />
              <DetailPair label="Batches" value={`${data.batches.length}`} />
            </div>
          </SectionCard>

          {canEditProject ? (
            <SectionCard title="Update Project">
              <form className="auth-stack" onSubmit={handleSave}>
                <input className="input-inline" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
                <input className="input-inline" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Project code" />
                <textarea className="input-inline textarea-inline" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Project description" />
                <div className="auth-actions-row">
                  <button type="submit" className="button button--primary" disabled={pending || !name.trim()}>
                    {pending ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pending}
                    onClick={() => void handleStatus(data.project.status === 'active' ? 'archived' : 'active')}
                  >
                    {data.project.status === 'active' ? 'Archive' : 'Activate'}
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          <SectionCard title="Checklist Batches">
            <div className="list-stack">
              {data.batches.map((batch) => (
                <ListRow
                  key={batch.id}
                  icon="checklist"
                  title={batch.title}
                  detail={`${batch.module_name}${batch.submodule_name ? ` / ${batch.submodule_name}` : ''}`}
                  meta={`${batch.status} • ${batch.total_items} items`}
                  action={
                    <Link className="inline-link" to={`/app/checklist/batches/${batch.id}`}>
                      Open
                    </Link>
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
