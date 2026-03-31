import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { Icon, SectionCard } from '../../components/ui'
import { canManageProjects } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { fetchProject, setProjectStatus, updateProject, type ChecklistBatchSummary, type ProjectDetailResponse, type ProjectSummary } from '../../features/projects/api'
import { FormMessage, LoadingSection, formatDateTime } from '../shared'

function formatProjectStatusLabel(status: ProjectSummary['status']) {
  return status === 'archived' ? 'Archived' : 'Active'
}

function projectStatusPillClass(status: ProjectSummary['status']) {
  return status === 'active'
    ? 'pill pill--dark checklist-batch-hero-card__pill'
    : 'pill pill--danger checklist-batch-hero-card__pill'
}

function formatBatchStatusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function parseCount(value: string | number | null | undefined) {
  return Number(value || 0)
}

function projectMetaLine(project: ProjectSummary) {
  const parts = [project.code || null, project.description || null].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'No project code or description yet.'
}

function summarizeBatchItems(batches: ChecklistBatchSummary[]) {
  return batches.reduce(
    (totals, batch) => ({
      open: totals.open + parseCount(batch.open_items),
      progress: totals.progress + parseCount(batch.in_progress_items),
      done: totals.done + parseCount(batch.passed_items) + parseCount(batch.failed_items),
      blocked: totals.blocked + parseCount(batch.blocked_items),
    }),
    { open: 0, progress: 0, done: 0, blocked: 0 },
  )
}

function batchSupportLine(batch: ChecklistBatchSummary) {
  const location = [batch.module_name, batch.submodule_name || null].filter(Boolean).join(' | ')
  return location || 'No module or submodule'
}

function batchDoneCount(batch: ChecklistBatchSummary) {
  return parseCount(batch.passed_items) + parseCount(batch.failed_items)
}

function ProjectHeroCard({ project, batches }: { project: ProjectSummary; batches: ChecklistBatchSummary[] }) {
  const totals = useMemo(() => summarizeBatchItems(batches), [batches])

  return (
    <section className="section-card checklist-batch-hero-card project-detail-hero-card">
      <div className="section-card__body checklist-batch-hero-card__body">
        <div className="checklist-batch-hero-card__header">
          <div className="checklist-batch-hero-card__copy">
            <p className="eyebrow">{project.org_name}</p>
            <h2>{project.name}</h2>
            <p className="checklist-batch-hero-card__meta-line">{projectMetaLine(project)}</p>
          </div>
        </div>

        <div className="checklist-batch-hero-card__chips">
          <span className={projectStatusPillClass(project.status)}>{formatProjectStatusLabel(project.status)}</span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="checklist" />
            {batches.length} batch{batches.length === 1 ? '' : 'es'}
          </span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="clock" />
            Created {formatDateTime(project.created_at, project.created_at_iso)}
          </span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="activity" />
            Updated {formatDateTime(project.updated_at || project.created_at, project.updated_at_iso || project.created_at_iso)}
          </span>
        </div>

        <div className="checklist-batch-hero-card__progress">
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Open</span>
            <strong>{totals.open}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Progress</span>
            <strong>{totals.progress}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Done</span>
            <strong>{totals.done}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Blocked</span>
            <strong>{totals.blocked}</strong>
          </article>
        </div>
      </div>
    </section>
  )
}

function ProjectBatchCard({ batch }: { batch: ChecklistBatchSummary }) {
  return (
    <article className="project-batch-card">
      <div className="project-batch-card__header">
        <span className="icon-wrap project-batch-card__icon">
          <Icon name="checklist" />
        </span>
        <div className="project-batch-card__copy">
          <p className="eyebrow">{batch.org_name || 'Checklist batch'}</p>
          <strong>{batch.title}</strong>
          <p>{batchSupportLine(batch)}</p>
        </div>
        <Link className="project-list-card__open" to={`/app/checklist/batches/${batch.id}`}>
          Open
        </Link>
      </div>

      <div className="project-batch-card__chips">
        <span className="pill pill--dark">{formatBatchStatusLabel(batch.status)}</span>
        <span className="pill">{batch.total_items} items</span>
        <span className="pill">{parseCount(batch.open_items) + parseCount(batch.in_progress_items) + parseCount(batch.blocked_items)} active</span>
        <span className="pill">{batchDoneCount(batch)} done</span>
      </div>
    </article>
  )
}

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
        status: data.project.status,
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
      {message ? <FormMessage tone="success" onDismiss={() => setMessage('')}>{message}</FormMessage> : null}
      {error ? <FormMessage tone="error" onDismiss={() => setError('')}>{error}</FormMessage> : null}

      {data ? (
        <>
          <ProjectHeroCard project={data.project} batches={data.batches} />

          {canEditProject ? (
            <SectionCard title="Project Management" subtitle="Update the project profile and lifecycle">
              <div className="projects-manage-shell">
                <div className="projects-manage-shell__copy">
                  <p className="eyebrow">Project controls</p>
                  <p className="body-copy">Keep naming, shorthand, and scope clean so checklist batches stay organized for the whole team.</p>
                </div>

                <form className="projects-form-card" onSubmit={handleSave}>
                  <label className="projects-form-card__field">
                    <span>Project name</span>
                    <input className="input-inline" value={name} onChange={(event) => setName(event.target.value)} placeholder="Landing page redesign" />
                  </label>

                  <label className="projects-form-card__field">
                    <span>Project code</span>
                    <input className="input-inline" value={code} onChange={(event) => setCode(event.target.value)} placeholder="LP-REDESIGN" />
                  </label>

                  <label className="projects-form-card__field">
                    <span>Description</span>
                    <textarea
                      className="input-inline textarea-inline"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Describe the working area, page set, or release scope for this project."
                    />
                  </label>

                  <div className="auth-actions-row">
                    <button type="submit" className="button button--primary" disabled={pending || !name.trim()}>
                      {pending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      className="button button--ghost"
                      disabled={pending}
                      onClick={() => void handleStatus(data.project.status === 'active' ? 'archived' : 'active')}
                    >
                      {data.project.status === 'active' ? 'Archive Project' : 'Activate Project'}
                    </button>
                  </div>
                </form>
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Checklist Batches" subtitle={`${data.batches.length} linked batch${data.batches.length === 1 ? '' : 'es'}`}>
            {data.batches.length ? (
              <div className="projects-card-grid">
                {data.batches.map((batch) => (
                  <ProjectBatchCard key={batch.id} batch={batch} />
                ))}
              </div>
            ) : (
              <p className="body-copy">No checklist batches have been attached to this project yet.</p>
            )}
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
