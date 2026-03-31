import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { Icon, SectionCard } from '../../components/ui'
import { canManageProjects } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { createProject, fetchProjects, type ProjectSummary, type ProjectsResponse } from '../../features/projects/api'
import { FormMessage, LoadingSection, formatDateTime, formatRelativeTime } from '../shared'

function formatProjectStatusLabel(status: ProjectSummary['status']) {
  return status === 'archived' ? 'Archived' : 'Active'
}

function projectStatusPillClass(status: ProjectSummary['status']) {
  return status === 'active' ? 'pill pill--dark' : 'pill pill--danger'
}

function buildProjectsScopeMeta(data: ProjectsResponse) {
  if (data.org.org_id) {
    return `Active work inside ${data.org.org_name}`
  }

  const orgCount = new Set(data.projects.map((project) => project.org_id)).size
  return orgCount > 1
    ? `Cross-org portfolio across ${orgCount} organizations`
    : 'Cross-org portfolio'
}

function summarizeProjects(projects: ProjectSummary[]) {
  const total = projects.length
  const active = projects.filter((project) => project.status === 'active').length
  const archived = total - active
  const organizations = new Set(projects.map((project) => project.org_id)).size

  return { total, active, archived, organizations }
}

function projectSupportLine(project: ProjectSummary) {
  const parts = [project.code || null, project.description || null].filter(Boolean)
  return parts.length ? parts.join(' | ') : 'No code or description yet.'
}

function ProjectsOverviewCard({ data }: { data: ProjectsResponse }) {
  const summary = useMemo(() => summarizeProjects(data.projects), [data.projects])
  const metaLine = buildProjectsScopeMeta(data)

  return (
    <section className="section-card checklist-batch-hero-card projects-overview-card">
      <div className="section-card__body checklist-batch-hero-card__body">
        <div className="checklist-batch-hero-card__header">
          <div className="checklist-batch-hero-card__copy">
            <p className="eyebrow">{data.org.org_name || 'All organizations'}</p>
            <h2>Projects</h2>
            <p className="checklist-batch-hero-card__meta-line">{metaLine}</p>
          </div>
        </div>

        <div className="checklist-batch-hero-card__chips">
          <span className="pill pill--dark checklist-batch-hero-card__pill">
            <Icon name="projects" />
            Project directory
          </span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="organization" />
            {summary.organizations} org{summary.organizations === 1 ? '' : 's'}
          </span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="activity" />
            {summary.active} active
          </span>
          <span className="pill checklist-batch-hero-card__pill">
            <Icon name="clock" />
            {summary.archived} archived
          </span>
        </div>

        <div className="checklist-batch-hero-card__progress">
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Total</span>
            <strong>{summary.total}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Active</span>
            <strong>{summary.active}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Archived</span>
            <strong>{summary.archived}</strong>
          </article>
          <article className="checklist-batch-hero-card__mini-stat">
            <span>Organizations</span>
            <strong>{summary.organizations}</strong>
          </article>
        </div>
      </div>
    </section>
  )
}

function ProjectListCard({ project }: { project: ProjectSummary }) {
  const updatedLabel = formatRelativeTime(project.updated_at || project.created_at, project.updated_at_iso || project.created_at_iso)

  return (
    <article className="project-list-card">
      <div className="project-list-card__header">
        <span className="icon-wrap project-list-card__icon">
          <Icon name="projects" />
        </span>
        <div className="project-list-card__copy">
          <p className="eyebrow">{project.org_name}</p>
          <strong>{project.name}</strong>
          <p>{projectSupportLine(project)}</p>
        </div>
        <Link className="project-list-card__open" to={`/app/projects/${project.id}`}>
          Open
        </Link>
      </div>

      <div className="project-list-card__chips">
        <span className={projectStatusPillClass(project.status)}>{formatProjectStatusLabel(project.status)}</span>
        <span className="pill">
          <Icon name="shield" />
          {project.code || 'No code'}
        </span>
        <span className="pill">
          <Icon name="clock" />
          {updatedLabel}
        </span>
      </div>

      <div className="project-list-card__meta">
        <span>Created {formatDateTime(project.created_at, project.created_at_iso)}</span>
        <span>Updated {formatDateTime(project.updated_at || project.created_at, project.updated_at_iso || project.created_at_iso)}</span>
      </div>
    </article>
  )
}

export function ProjectsPage() {
  const { activeOrgId, activeScope, getMembershipForOrg, lastOrgId, memberships, session } = useAuth()
  const [data, setData] = useState<ProjectsResponse | null>(null)
  const [createOrgId, setCreateOrgId] = useState(0)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const manageableMemberships = memberships.filter((membership) => canManageProjects(session, membership))

  useEffect(() => {
    const fallbackOrgId = activeOrgId || lastOrgId || manageableMemberships[0]?.org_id || 0
    setCreateOrgId((current) => current || fallbackOrgId)
  }, [activeOrgId, lastOrgId, manageableMemberships])

  const load = useCallback(async () => {
    if (!session?.accessToken || (activeScope === 'org' && !activeOrgId) || activeScope === 'none') {
      setData(null)
      return
    }

    try {
      const result = await fetchProjects(session.accessToken, activeScope === 'org' ? activeOrgId : null, 'all')
      setData(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load projects.'))
    }
  }, [activeOrgId, activeScope, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const targetOrgId = activeScope === 'all' ? createOrgId : activeOrgId
    if (!session?.accessToken || !targetOrgId || !name.trim()) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      await createProject(session.accessToken, {
        org_id: targetOrgId,
        name: name.trim(),
        code: code.trim(),
        description: description.trim(),
        status: 'active',
      })
      setName('')
      setCode('')
      setDescription('')
      setMessage('Project created.')
      await load()
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to create project.'))
    } finally {
      setPending(false)
    }
  }

  const createMembership = getMembershipForOrg(activeScope === 'all' ? createOrgId : activeOrgId)
  const canCreateProject = activeScope === 'all'
    ? manageableMemberships.length > 0 && canManageProjects(session, createMembership)
    : canManageProjects(session, createMembership)

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success" onDismiss={() => setMessage('')}>{message}</FormMessage> : null}
      {error ? <FormMessage tone="error" onDismiss={() => setError('')}>{error}</FormMessage> : null}

      {!data && !error ? <LoadingSection title="Projects" subtitle="Active work" /> : null}

      {data ? (
        <>
          <ProjectsOverviewCard data={data} />

          <SectionCard title="Project Directory" subtitle={`${data.projects.length} project${data.projects.length === 1 ? '' : 's'}`}>
            {data.projects.length ? (
              <div className="projects-card-grid">
                {data.projects.map((project) => (
                  <ProjectListCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <p className="body-copy">No projects have been created for this scope yet.</p>
            )}
          </SectionCard>

          {canCreateProject ? (
            <SectionCard title="Create Project" subtitle="Add a new project without leaving the page">
              <div className="projects-manage-shell">
                <div className="projects-manage-shell__copy">
                  <p className="eyebrow">Project setup</p>
                  <p className="body-copy">Capture the project name, code, and context so the team can start attaching checklist batches right away.</p>
                </div>

                <form className="projects-form-card" onSubmit={handleCreate}>
                  {activeScope === 'all' ? (
                    <label className="projects-form-card__field">
                      <span>Organization</span>
                      <select
                        className="input-inline select-inline"
                        value={createOrgId}
                        onChange={(event) => setCreateOrgId(Number(event.target.value) || 0)}
                      >
                        {manageableMemberships.map((membership) => (
                          <option key={membership.org_id} value={membership.org_id}>
                            {membership.org_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

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
                      placeholder="Describe what this project covers for QA, PM, and stakeholders."
                    />
                  </label>

                  <div className="auth-actions-row">
                    <button type="submit" className="button button--primary" disabled={pending || !name.trim()}>
                      {pending ? 'Creating...' : 'Create Project'}
                    </button>
                  </div>
                </form>
              </div>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
