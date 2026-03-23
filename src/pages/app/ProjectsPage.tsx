import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { SectionCard, ListRow } from '../../components/ui'
import { canManageProjects } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { createProject, fetchProjects, type ProjectsResponse } from '../../features/projects/api'
import { FormMessage, LoadingSection } from '../shared'

export function ProjectsPage() {
  const { activeOrgId, session } = useAuth()
  const [data, setData] = useState<ProjectsResponse | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!session?.accessToken || !activeOrgId) {
      setData(null)
      return
    }

    try {
      const result = await fetchProjects(session.accessToken, activeOrgId, 'all')
      setData(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load projects.'))
    }
  }, [activeOrgId, session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !activeOrgId || !name.trim()) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      await createProject(session.accessToken, {
        org_id: activeOrgId,
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

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {canManageProjects(session) ? (
        <SectionCard title="Create Project" subtitle="Owner, Project Manager, and QA Lead">
          <form className="auth-stack" onSubmit={handleCreate}>
            <input className="input-inline" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
            <input className="input-inline" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Project code" />
            <textarea className="input-inline textarea-inline" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Project description" />
            <button type="submit" className="button button--primary" disabled={pending || !name.trim()}>
              {pending ? 'Creating...' : 'Create'}
            </button>
          </form>
        </SectionCard>
      ) : null}

      {!data && !error ? <LoadingSection title="Projects" subtitle="Active work" /> : null}

      {data ? (
        <SectionCard title="Projects" subtitle={`${data.projects.length} total`}>
          <div className="list-stack">
            {data.projects.map((project) => (
              <ListRow
                key={project.id}
                icon="projects"
                title={project.name}
                detail={`${project.code || 'No code'} • ${project.status}`}
                action={
                  <Link className="inline-link" to={`/app/projects/${project.id}`}>
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
