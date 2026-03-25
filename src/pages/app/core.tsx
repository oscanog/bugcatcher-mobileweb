import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { getSidebarItems } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { DetailPair, ListRow, SectionCard, StatCard, StatusTile } from '../../components/ui'
import {
  fetchDashboardSummary,
  type DashboardQaLeadChecklistProject,
  type DashboardQaLeadChecklistRow,
  type DashboardSummaryResponse,
} from '../../features/dashboard/api'
import {
  fetchAiAdminRuntime,
  saveAiAdminModel,
  saveAiAdminProvider,
  saveAiAdminRuntime,
  type AiAdminModel,
  type AiAdminProvider,
  type AiAdminRuntimePayload,
} from '../../features/ai-admin/api'
import { useNotifications } from '../../features/notifications/context'
import {
  createOrganization,
  fetchOrganizations,
  joinOrganization,
  leaveOrganization,
  type OrganizationsResponse,
} from '../../features/organizations/api'
import { EmptySection, FormMessage, LoadingSection, formatRelativeTime, initialsFromUsername } from '../shared'

function DashboardChecklistWorkloadRow({ row }: { row: DashboardQaLeadChecklistRow }) {
  return (
    <ListRow
      icon="checklist"
      title={row.display_name}
      detail={`Assigned ${row.assigned_items} • Open ${row.open_items}`}
      meta={row.is_unassigned ? 'Unassigned queue' : 'QA Tester'}
    />
  )
}

function DashboardChecklistWorkloadProject({ project }: { project: DashboardQaLeadChecklistProject }) {
  return (
    <article className="workload-project">
      <div className="workload-project__header">
        <div className="workload-project__copy">
          <strong>{project.project_name}</strong>
          <p>Active project checklist workload</p>
        </div>
        <div className="workload-project__metrics" aria-label={`${project.project_name} workload totals`}>
          <span className="pill">Assigned {project.assigned_items}</span>
          <span className="pill pill--success">Open {project.open_items}</span>
        </div>
      </div>
      <div className="list-stack">
        {project.testers.map((row) => (
          <DashboardChecklistWorkloadRow key={`${project.project_id}-${row.user_id ?? 'unassigned'}`} row={row} />
        ))}
      </div>
    </article>
  )
}

export function DashboardPage() {
  const { activeMembership, activeOrgId, session } = useAuth()
  const [data, setData] = useState<DashboardSummaryResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || !activeOrgId) {
        setData(null)
        return
      }

      try {
        const result = await fetchDashboardSummary(session.accessToken, activeOrgId)
        setData(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load dashboard summary.'))
      }
    }

    void run()
  }, [activeOrgId, session?.accessToken])

  if (!activeMembership) {
    return <EmptySection title="Dashboard" message="Set an active organization first." />
  }

  if (!data && !error) {
    return <LoadingSection title="Dashboard" subtitle={activeMembership.org_name} />
  }

  const trendMax = Math.max(1, ...(data?.trend ?? []).flatMap((entry) => [entry.issues, entry.projects, entry.checklist]))
  const barHeight = (value: number) => `${Math.max(12, (value / trendMax) * 100)}%`

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {data ? (
        <>
          <SectionCard title="Live Summary" subtitle={`${data.org.org_name} • ${data.scope}`}>
            <div className="stats-grid">
              <StatCard stat={{ label: 'Open Issues', value: `${data.summary.open_issues}`, note: 'active', tone: 'alert' }} />
              <StatCard stat={{ label: 'Projects', value: `${data.summary.active_projects}`, note: 'active', tone: 'steel' }} />
              <StatCard stat={{ label: 'Checklist', value: `${data.summary.checklist_open_items}`, note: 'open items', tone: 'success' }} />
            </div>
          </SectionCard>

          {data.qa_lead_checklist ? (
            <>
              <SectionCard title="QA Tester Workload" subtitle="Assigned and open checklist items">
                <div className="list-stack">
                  {data.qa_lead_checklist.org_totals.map((row) => (
                    <DashboardChecklistWorkloadRow key={row.user_id ?? 'unassigned'} row={row} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="By Project" subtitle="Active project breakdown">
                {data.qa_lead_checklist.projects.length > 0 ? (
                  <div className="list-stack">
                    {data.qa_lead_checklist.projects.map((project) => (
                      <DashboardChecklistWorkloadProject key={project.project_id} project={project} />
                    ))}
                  </div>
                ) : (
                  <p className="body-copy">No active project checklist workload is assigned to QA Testers right now.</p>
                )}
              </SectionCard>
            </>
          ) : null}

          <SectionCard title="7-Day Trend">
            <div className="trend-chart">
              {data.trend.map((entry) => (
                <div key={entry.day} className="trend-chart__group">
                  <div className="trend-chart__bars">
                    <span className="trend-chart__bar trend-chart__bar--issues" style={{ '--bar-height': barHeight(entry.issues) } as CSSProperties} />
                    <span className="trend-chart__bar trend-chart__bar--projects" style={{ '--bar-height': barHeight(entry.projects) } as CSSProperties} />
                    <span className="trend-chart__bar trend-chart__bar--checklist" style={{ '--bar-height': barHeight(entry.checklist) } as CSSProperties} />
                  </div>
                  <small>{entry.day}</small>
                </div>
              ))}
            </div>
            <div className="trend-legend">
              <span><i className="trend-legend__dot trend-legend__dot--issues" />Issues</span>
              <span><i className="trend-legend__dot trend-legend__dot--projects" />Projects</span>
              <span><i className="trend-legend__dot trend-legend__dot--checklist" />Checklist</span>
            </div>
          </SectionCard>

          <SectionCard title="Recent Issues" subtitle="Newest visible items">
            <div className="list-stack">
              {data.recent_issues.map((issue) => (
                <ListRow
                  key={issue.id}
                  icon="reports"
                  title={issue.title}
                  detail={`${issue.author_username} • ${issue.assign_status}`}
                  action={
                    <Link className="inline-link" to={`/app/reports/${issue.id}`}>
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

export function OrganizationsPage() {
  const { activeMembership, activeOrgId, memberships, refreshSession, session, setActiveOrg, user } = useAuth()
  const [remote, setRemote] = useState<OrganizationsResponse | null>(null)
  const [createName, setCreateName] = useState('')
  const [pendingOrgId, setPendingOrgId] = useState<number | null>(null)
  const [pendingCreate, setPendingCreate] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!session?.accessToken) {
      setRemote(null)
      return
    }

    try {
      const result = await fetchOrganizations(session.accessToken)
      setRemote(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load organizations.'))
    }
  }, [session?.accessToken])

  useEffect(() => {
    void load()
  }, [activeOrgId, load])

  const switchOrg = async (orgId: number) => {
    setPendingOrgId(orgId)
    setError('')
    setMessage('')

    const result = await setActiveOrg(orgId)

    setPendingOrgId(null)
    if (!result.ok) {
      setError(result.error ?? 'Unable to switch organization.')
      return
    }

    setMessage('Active organization updated.')
    await refreshSession()
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken || !createName.trim()) {
      return
    }

    setPendingCreate(true)
    setError('')
    setMessage('')

    try {
      const result = await createOrganization(session.accessToken, createName.trim())
      await setActiveOrg(result.active_org_id ?? result.org_id)
      await refreshSession()
      await load()
      setCreateName('')
      setMessage('Organization created.')
    } catch (createError) {
      setError(getErrorMessage(createError, 'Unable to create organization.'))
    } finally {
      setPendingCreate(false)
    }
  }

  const handleJoin = async (orgId: number) => {
    if (!session?.accessToken) {
      return
    }

    setPendingOrgId(orgId)
    setError('')
    setMessage('')

    try {
      const result = await joinOrganization(session.accessToken, orgId)
      await setActiveOrg(result.active_org_id ?? result.org_id)
      await refreshSession()
      await load()
      setMessage('Organization joined.')
    } catch (joinError) {
      setError(getErrorMessage(joinError, 'Unable to join organization.'))
    } finally {
      setPendingOrgId(null)
    }
  }

  const handleLeave = async (orgId: number) => {
    if (!session?.accessToken) {
      return
    }

    setPendingOrgId(orgId)
    setError('')
    setMessage('')

    try {
      await leaveOrganization(session.accessToken, orgId)
      await refreshSession()
      await load()
      setMessage('Organization updated.')
    } catch (leaveError) {
      setError(getErrorMessage(leaveError, 'Unable to leave organization.'))
    } finally {
      setPendingOrgId(null)
    }
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <SectionCard title="Active Organization" subtitle="Current session context">
        {activeMembership ? (
          <div className="detail-pairs">
            <DetailPair label="Name" value={activeMembership.org_name} />
            <DetailPair label="Org Role" value={activeMembership.role} />
            <DetailPair label="System Role" value={user?.role ?? 'user'} />
            <DetailPair label="Org ID" value={`${activeOrgId}`} />
          </div>
        ) : (
          <p className="body-copy">
            No active organization is set yet. Join or create one below to unlock organization pages.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Create Organization" subtitle="Owner role is assigned automatically">
        <form className="inline-form" onSubmit={handleCreate}>
          <input
            className="auth-field__input input-inline"
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Organization name"
            disabled={pendingCreate}
          />
          <button type="submit" className="button button--primary" disabled={pendingCreate || !createName.trim()}>
            {pendingCreate ? 'Creating...' : 'Create'}
          </button>
        </form>
      </SectionCard>

      <SectionCard
        title="Memberships"
        subtitle={`${memberships.length} organization${memberships.length === 1 ? '' : 's'}`}
      >
        {memberships.length > 0 ? (
          <div className="list-stack">
            {memberships.map((membership) => (
              <ListRow
                key={membership.org_id}
                icon="organization"
                title={membership.org_name}
                detail={`${membership.role}${membership.is_owner ? ' • Owner' : ''}`}
                meta={membership.org_id === activeOrgId ? 'Active' : `Org #${membership.org_id}`}
                action={
                  <div className="list-row__actions">
                    {membership.org_id === activeOrgId ? (
                      <span className="pill pill--success">Active</span>
                    ) : (
                      <button
                        type="button"
                        className="inline-link"
                        disabled={pendingOrgId === membership.org_id}
                        onClick={() => void switchOrg(membership.org_id)}
                      >
                        {pendingOrgId === membership.org_id ? 'Switching...' : 'Use'}
                      </button>
                    )}
                    {!membership.is_owner ? (
                      <button
                        type="button"
                        className="inline-link"
                        disabled={pendingOrgId === membership.org_id}
                        onClick={() => void handleLeave(membership.org_id)}
                      >
                        Leave
                      </button>
                    ) : null}
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <p className="body-copy">Your account is not attached to an organization yet.</p>
        )}
      </SectionCard>

      <SectionCard title="Joinable Organizations" subtitle="Available memberships">
        {remote?.joinable_organizations.length ? (
          <div className="list-stack">
            {remote.joinable_organizations.map((organization) => (
              <ListRow
                key={organization.id}
                icon="organization"
                title={organization.name}
                detail={`Owner: ${organization.owner_name}`}
                meta={`${organization.member_count} members`}
                action={
                  <button
                    type="button"
                    className="inline-link"
                    disabled={pendingOrgId === organization.id}
                    onClick={() => void handleJoin(organization.id)}
                  >
                    {pendingOrgId === organization.id ? 'Joining...' : 'Join'}
                  </button>
                }
              />
            ))}
          </div>
        ) : (
          <p className="body-copy">No extra organizations are available right now.</p>
        )}
      </SectionCard>
    </div>
  )
}

export function ProfilePage() {
  const { activeMembership, memberships, session, user } = useAuth()

  const quickActions = useMemo(
    () =>
      getSidebarItems(session)
        .filter((item) => item.key !== 'logout' && item.key !== 'settings')
        .slice(0, 3),
    [session],
  )

  return (
    <div className="page-stack">
      <SectionCard title={user?.role === 'super_admin' ? 'Super Admin' : 'Profile'}>
        <div className="profile-hero">
          <div className="profile-hero__avatar">{initialsFromUsername(user?.username ?? 'User')}</div>
          <div className="profile-hero__copy">
            <strong>{user?.username ?? 'Unknown user'}</strong>
            <p>{user?.email ?? 'No email'}</p>
          </div>
          <span className="pill pill--success">Online</span>
        </div>
      </SectionCard>

      <div className="stats-grid">
        <StatCard stat={{ label: 'System', value: user?.role ?? 'user', note: 'role', tone: 'steel' }} />
        <StatCard stat={{ label: 'Teams', value: `${memberships.length}`, note: 'memberships', tone: 'success' }} />
        <StatCard stat={{ label: 'Org Role', value: activeMembership?.role ?? 'No org', note: activeMembership?.org_name ?? 'set org', tone: 'alert' }} />
      </div>

      <SectionCard title="Quick Actions">
        <div className="list-stack">
          {quickActions.map((item) => (
            <ListRow
              key={item.key}
              icon={item.icon}
              title={item.label}
              detail={item.to}
              action={
                <Link to={item.to} className="inline-link">
                  Open
                </Link>
              }
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Session">
        <div className="detail-pairs">
          <DetailPair label="System Role" value={user?.role ?? 'user'} />
          <DetailPair label="Org Role" value={activeMembership?.role ?? 'No active org'} />
          <DetailPair label="Org" value={activeMembership?.org_name ?? 'No active org'} />
          <DetailPair label="Device" value="Mobile Web" />
        </div>
      </SectionCard>
    </div>
  )
}

export function NotificationsPage() {
  const navigate = useNavigate()
  const { connectionHint, connectionState, error, isLoading, notifications, unreadCount, markAllAsRead, openNotification } =
    useNotifications()
  const readCount = notifications.length - unreadCount
  const priorityCount = notifications.filter((notification) => !notification.read_at && notification.severity === 'alert').length

  const handleOpen = async (notificationId: number) => {
    const nextPath = await openNotification(notificationId)
    navigate(nextPath)
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      {connectionHint ? <FormMessage tone={connectionState === 'connected' ? 'success' : 'info'}>{connectionHint}</FormMessage> : null}

      <SectionCard title="Today">
        <div className="stats-grid">
          <StatCard stat={{ label: 'Unread', value: `${unreadCount}`, note: 'new', tone: 'alert' }} />
          <StatCard stat={{ label: 'Read', value: `${Math.max(0, readCount)}`, note: 'seen', tone: 'success' }} />
          <StatCard stat={{ label: 'Priority', value: `${priorityCount}`, note: 'need action', tone: 'steel' }} />
        </div>
      </SectionCard>

      <SectionCard
        title="In App Notifications"
        headerAlign="center"
        action={
          <button type="button" className="button button--ghost button--tiny" onClick={() => void markAllAsRead()}>
            Mark all read
          </button>
        }
      >
        {isLoading ? (
          <p className="body-copy">Loading inbox…</p>
        ) : (
          <div className="list-stack">
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className="list-row list-row--button"
                onClick={() => void handleOpen(item.id)}
              >
                <ListRow
                  icon={item.severity === 'alert' ? 'alert' : item.severity === 'success' ? 'checklist' : 'activity'}
                  title={item.title}
                  detail={item.body}
                  meta={formatRelativeTime(item.created_at)}
                  tone={item.severity}
                  readState={item.read_at ? 'read' : 'unread'}
                  action={<span className={`notif-chip ${item.read_at ? 'is-read' : 'is-unread'}`}>{item.read_at ? 'Read' : 'Unread'}</span>}
                />
              </button>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export function SettingsPage() {
  const settings: Array<[string, boolean]> = [
    ['Compact cards', true],
    ['Auto close drawer', true],
    ['Phone frame mode', true],
    ['Realtime refresh', false],
  ]

  return (
    <div className="page-stack">
      <SectionCard title="Settings">
        <div className="settings-list">
          {settings.map(([label, checked]) => (
            <label key={label} className="toggle-row">
              <span>
                <strong>{label}</strong>
              </span>
              <span className={`toggle ${checked ? 'is-on' : ''}`} aria-hidden="true">
                <span />
              </span>
            </label>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

export function SuperAdminPage() {
  const { session } = useAuth()
  const [runtime, setRuntime] = useState<AiAdminRuntimePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken) {
        setRuntime(null)
        return
      }

      try {
        const result = await fetchAiAdminRuntime(session.accessToken)
        setRuntime(result)
        setError('')
      } catch (loadError) {
        setError(getErrorMessage(loadError, 'Unable to load super admin summary.'))
      }
    }

    void run()
  }, [session?.accessToken])

  if (!runtime && !error) {
    return <LoadingSection title="Super Admin" subtitle="Control center" />
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {runtime ? (
        <>
          <SectionCard title="Control Center">
            <div className="mini-grid">
              <StatusTile title="AI Chat" value={runtime.runtime.is_enabled ? 'On' : 'Off'} note="built-in" tone="steel" />
              <StatusTile title="Providers" value={`${runtime.providers.length}`} note="configured" tone="success" />
              <StatusTile title="Models" value={`${runtime.models.length}`} note="available" tone="alert" />
            </div>
          </SectionCard>

          <SectionCard title="Runtime State">
            <div className="detail-pairs">
              <DetailPair label="Assistant" value={runtime.runtime.assistant_name || 'BugCatcher AI'} />
              <DetailPair
                label="Default Provider"
                value={runtime.providers.find((provider) => provider.id === runtime.runtime.default_provider_config_id)?.display_name || 'Not set'}
              />
              <DetailPair
                label="Default Model"
                value={runtime.models.find((model) => model.id === runtime.runtime.default_model_id)?.display_name || 'Not set'}
              />
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}

export function AIAdminPage() {
  const { session } = useAuth()
  const [runtime, setRuntime] = useState<AiAdminRuntimePayload | null>(null)
  const [runtimeForm, setRuntimeForm] = useState({
    is_enabled: true,
    default_provider_config_id: 0,
    default_model_id: 0,
    assistant_name: 'BugCatcher AI',
    system_prompt: '',
  })
  const [providerForm, setProviderForm] = useState({
    provider_key: 'deepseek',
    display_name: 'DeepSeek',
    provider_type: 'openai-compatible',
    base_url: 'https://api.deepseek.com',
    api_key: '',
    is_enabled: true,
  })
  const [modelForm, setModelForm] = useState({
    provider_config_id: 0,
    remote_model_id: 'deepseek-chat',
    display_name: 'DeepSeek Chat',
    supports_vision: false,
    supports_json_output: false,
    is_enabled: true,
    is_default: true,
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const syncRuntime = useCallback((result: AiAdminRuntimePayload) => {
    setRuntime(result)
    setRuntimeForm({
      is_enabled: result.runtime.is_enabled,
      default_provider_config_id: result.runtime.default_provider_config_id ?? 0,
      default_model_id: result.runtime.default_model_id ?? 0,
      assistant_name: result.runtime.assistant_name || 'BugCatcher AI',
      system_prompt: result.runtime.system_prompt || '',
    })
    setModelForm((current) => ({
      ...current,
      provider_config_id:
        current.provider_config_id > 0 ? current.provider_config_id : (result.runtime.default_provider_config_id ?? result.providers[0]?.id ?? 0),
    }))
  }, [])

  const load = useCallback(async () => {
    if (!session?.accessToken) {
      setRuntime(null)
      return
    }

    try {
      const result = await fetchAiAdminRuntime(session.accessToken)
      syncRuntime(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load AI admin settings.'))
    }
  }, [session?.accessToken, syncRuntime])

  useEffect(() => {
    void load()
  }, [load])

  const handleSaveRuntime = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      await saveAiAdminRuntime(session.accessToken, {
        is_enabled: runtimeForm.is_enabled,
        default_provider_config_id: runtimeForm.default_provider_config_id || null,
        default_model_id: runtimeForm.default_model_id || null,
        assistant_name: runtimeForm.assistant_name.trim(),
        system_prompt: runtimeForm.system_prompt.trim(),
      })
      setMessage('Built-in AI settings saved.')
      await load()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save built-in AI settings.'))
    } finally {
      setPending(false)
    }
  }

  const handleSaveProvider = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      await saveAiAdminProvider(session.accessToken, providerForm)
      setMessage('Provider saved.')
      setProviderForm((current) => ({ ...current, api_key: '' }))
      await load()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save the AI provider.'))
    } finally {
      setPending(false)
    }
  }

  const handleSaveModel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      await saveAiAdminModel(session.accessToken, modelForm)
      setMessage('Model saved.')
      await load()
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Unable to save the AI model.'))
    } finally {
      setPending(false)
    }
  }

  if (!runtime && !error) {
    return <LoadingSection title="AI Admin" subtitle="Built-in assistant" />
  }

  const providers = runtime?.providers ?? []
  const models = runtime?.models ?? []

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {runtime ? (
        <>
          <SectionCard title="Built-in AI Runtime" subtitle="Shared by the in-app checklist drafting chat">
            <div className="detail-pairs">
              <DetailPair label="Enabled" value={runtime.runtime.is_enabled ? 'Yes' : 'No'} />
              <DetailPair
                label="Default Provider"
                value={providers.find((provider) => provider.id === runtime.runtime.default_provider_config_id)?.display_name || 'Not set'}
              />
              <DetailPair
                label="Default Model"
                value={models.find((model) => model.id === runtime.runtime.default_model_id)?.display_name || 'Not set'}
              />
              <DetailPair label="Assistant" value={runtime.runtime.assistant_name || 'BugCatcher AI'} />
            </div>
          </SectionCard>

          <SectionCard title="Providers">
            <div className="list-stack">
              {providers.map((provider) => (
                <ListRow
                  key={provider.id}
                  icon="spark"
                  title={provider.display_name}
                  detail={`${provider.provider_type}${provider.base_url ? ` • ${provider.base_url}` : ''}`}
                  action={
                    <div className="list-row__actions">
                      <span className={`pill ${provider.is_enabled ? 'pill--success' : ''}`}>{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>
                      {provider.api_key ? <span className="pill">Key saved</span> : null}
                    </div>
                  }
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Models">
            <div className="list-stack">
              {models.map((model) => (
                <ListRow
                  key={model.id}
                  icon="activity"
                  title={model.display_name}
                  detail={`${model.model_id}${model.supports_vision ? ' • Vision' : ''}`}
                  action={
                    <div className="list-row__actions">
                      <span className={`pill ${model.is_default ? 'pill--success' : ''}`}>{model.is_default ? 'Default' : 'Available'}</span>
                      <span className="pill">{model.is_enabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  }
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Built-in AI Chat" subtitle="Used by the in-app AI checklist drafting flow">
            <form className="auth-stack" onSubmit={handleSaveRuntime}>
              <label className="toggle-row">
                <span>
                  <strong>Enable built-in AI chat</strong>
                </span>
                <input
                  type="checkbox"
                  checked={runtimeForm.is_enabled}
                  onChange={(event) => setRuntimeForm((current) => ({ ...current, is_enabled: event.target.checked }))}
                />
              </label>
              <input
                className="input-inline"
                value={runtimeForm.assistant_name}
                onChange={(event) => setRuntimeForm((current) => ({ ...current, assistant_name: event.target.value }))}
                placeholder="Assistant display name"
              />
              <select
                className="input-inline select-inline"
                value={runtimeForm.default_provider_config_id}
                onChange={(event) =>
                  setRuntimeForm((current) => ({
                    ...current,
                    default_provider_config_id: Number(event.target.value),
                  }))
                }
              >
                <option value={0}>Select provider</option>
                {providers.map((provider: AiAdminProvider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
              <select
                className="input-inline select-inline"
                value={runtimeForm.default_model_id}
                onChange={(event) =>
                  setRuntimeForm((current) => ({
                    ...current,
                    default_model_id: Number(event.target.value),
                  }))
                }
              >
                <option value={0}>Select model</option>
                {models.map((model: AiAdminModel) => (
                  <option key={model.id} value={model.id}>
                    {model.display_name}
                  </option>
                ))}
              </select>
              <textarea
                className="input-inline textarea-inline"
                value={runtimeForm.system_prompt}
                onChange={(event) => setRuntimeForm((current) => ({ ...current, system_prompt: event.target.value }))}
                placeholder="Optional system prompt"
              />
              <button type="submit" className="button button--primary" disabled={pending}>
                {pending ? 'Saving...' : 'Save Built-in AI Settings'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Add Provider" subtitle="API keys stay masked after save">
            <form className="auth-stack" onSubmit={handleSaveProvider}>
              <input
                className="input-inline"
                value={providerForm.display_name}
                onChange={(event) => setProviderForm((current) => ({ ...current, display_name: event.target.value }))}
                placeholder="Display name"
              />
              <input
                className="input-inline"
                value={providerForm.provider_key}
                onChange={(event) => setProviderForm((current) => ({ ...current, provider_key: event.target.value }))}
                placeholder="Provider key"
              />
              <input
                className="input-inline"
                value={providerForm.provider_type}
                onChange={(event) => setProviderForm((current) => ({ ...current, provider_type: event.target.value }))}
                placeholder="Provider type"
              />
              <input
                className="input-inline"
                value={providerForm.base_url}
                onChange={(event) => setProviderForm((current) => ({ ...current, base_url: event.target.value }))}
                placeholder="Base URL"
              />
              <input
                className="input-inline"
                value={providerForm.api_key}
                onChange={(event) => setProviderForm((current) => ({ ...current, api_key: event.target.value }))}
                placeholder="API key"
                type="password"
              />
              <button type="submit" className="button button--primary" disabled={pending}>
                {pending ? 'Saving...' : 'Save Provider'}
              </button>
            </form>
          </SectionCard>

          <SectionCard title="Add Model" subtitle="Choose the model AI chat will use">
            <form className="auth-stack" onSubmit={handleSaveModel}>
              <select
                className="input-inline select-inline"
                value={modelForm.provider_config_id}
                onChange={(event) => setModelForm((current) => ({ ...current, provider_config_id: Number(event.target.value) }))}
              >
                <option value={0}>Select provider</option>
                {providers.map((provider: AiAdminProvider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name}
                  </option>
                ))}
              </select>
              <input
                className="input-inline"
                value={modelForm.display_name}
                onChange={(event) => setModelForm((current) => ({ ...current, display_name: event.target.value }))}
                placeholder="Display name"
              />
              <input
                className="input-inline"
                value={modelForm.remote_model_id}
                onChange={(event) => setModelForm((current) => ({ ...current, remote_model_id: event.target.value }))}
                placeholder="Remote model id"
              />
              <label className="toggle-row">
                <span>
                  <strong>Supports vision</strong>
                </span>
                <input
                  type="checkbox"
                  checked={modelForm.supports_vision}
                  onChange={(event) => setModelForm((current) => ({ ...current, supports_vision: event.target.checked }))}
                />
              </label>
              <button type="submit" className="button button--primary" disabled={pending || modelForm.provider_config_id <= 0}>
                {pending ? 'Saving...' : 'Save Model'}
              </button>
            </form>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
