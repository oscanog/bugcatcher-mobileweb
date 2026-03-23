import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { getSidebarItems } from '../../lib/access'
import { getErrorMessage } from '../../lib/api'
import { DetailPair, ListRow, SectionCard, StatCard, StatusTile } from '../../components/ui'
import { fetchDashboardSummary, type DashboardSummaryResponse } from '../../features/dashboard/api'
import {
  createDiscordLinkCode,
  fetchDiscordLink,
  unlinkDiscord,
  type DiscordLinkResponse,
} from '../../features/discord/api'
import { useNotifications } from '../../features/notifications/context'
import {
  createOrganization,
  fetchOrganizations,
  joinOrganization,
  leaveOrganization,
  type OrganizationsResponse,
} from '../../features/organizations/api'
import {
  fetchOpenClawRuntime,
  requestOpenClawReload,
  type OpenClawRuntimePayload,
} from '../../features/openclaw/api'
import { EmptySection, FormMessage, LoadingSection, formatDateTime, formatRelativeTime, initialsFromUsername } from '../shared'

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
  const { error, isLoading, notifications, unreadCount, markAllAsRead, openNotification } = useNotifications()
  const readCount = notifications.length - unreadCount
  const priorityCount = notifications.filter((notification) => !notification.read_at && notification.severity === 'alert').length

  const handleOpen = async (notificationId: number) => {
    const nextPath = await openNotification(notificationId)
    navigate(nextPath)
  }

  return (
    <div className="page-stack">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

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

export function DiscordLinksPage() {
  const { session } = useAuth()
  const [data, setData] = useState<DiscordLinkResponse | null>(null)
  const [linkCode, setLinkCode] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!session?.accessToken) {
      setData(null)
      return
    }

    try {
      const result = await fetchDiscordLink(session.accessToken)
      setData(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load Discord link status.'))
    }
  }, [session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreateCode = async () => {
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')

    try {
      const result = await createDiscordLinkCode(session.accessToken)
      setLinkCode(result.code)
      setMessage(`Code ready until ${formatDateTime(result.expires_at)}.`)
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to create a Discord link code.'))
    } finally {
      setPending(false)
    }
  }

  const handleUnlink = async () => {
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setError('')
    setMessage('')

    try {
      await unlinkDiscord(session.accessToken)
      setLinkCode('')
      await load()
      setMessage('Discord link removed.')
    } catch (actionError) {
      setError(getErrorMessage(actionError, 'Unable to remove Discord link.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      <SectionCard title="Discord Link" subtitle="Connect your BugCatcher account to OpenClaw">
        {data?.link ? (
          <div className="detail-pairs">
            <DetailPair label="Discord User" value={data.link.discord_username || data.link.discord_global_name || data.link.discord_user_id} />
            <DetailPair label="Linked At" value={formatDateTime(data.link.linked_at)} />
            <DetailPair label="Last Seen" value={formatDateTime(data.link.last_seen_at)} />
          </div>
        ) : (
          <p className="body-copy">No Discord account is linked yet. Generate a code and send it to OpenClaw in Discord.</p>
        )}
      </SectionCard>

      <SectionCard title="Link Flow">
        <div className="bullet-stack">
          <div className="bullet-row"><span className="bullet-row__marker" /><p>Create a one-time code below.</p></div>
          <div className="bullet-row"><span className="bullet-row__marker" /><p>Send <span className="pill">{linkCode || 'link YOURCODE'}</span> to OpenClaw.</p></div>
          <div className="bullet-row"><span className="bullet-row__marker" /><p>OpenClaw will confirm the account binding in DM.</p></div>
        </div>
      </SectionCard>

      <SectionCard title="Actions">
        <div className="auth-actions-row">
          <button type="button" className="button button--primary" disabled={pending} onClick={() => void handleCreateCode()}>
            {pending ? 'Preparing...' : 'Generate Code'}
          </button>
          {data?.link ? (
            <button type="button" className="button button--ghost" disabled={pending} onClick={() => void handleUnlink()}>
              Unlink
            </button>
          ) : null}
        </div>
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
  const [runtime, setRuntime] = useState<OpenClawRuntimePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken) {
        setRuntime(null)
        return
      }

      try {
        const result = await fetchOpenClawRuntime(session.accessToken)
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
              <StatusTile title="Providers" value={`${runtime.runtime.providers.length}`} note="configured" tone="steel" />
              <StatusTile title="Models" value={`${runtime.runtime.models.length}`} note="available" tone="success" />
              <StatusTile title="Channels" value={`${runtime.runtime.channels.length}`} note="linked" tone="alert" />
            </div>
          </SectionCard>

          <SectionCard title="Runtime State">
            <div className="detail-pairs">
              <DetailPair label="Config Version" value={runtime.control_plane.config_version} />
              <DetailPair label="Gateway" value={runtime.runtime_status.gateway_state} />
              <DetailPair label="Discord" value={runtime.runtime_status.discord_state} />
              <DetailPair label="Last Update" value={formatDateTime(runtime.runtime_status.updated_at)} />
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}

export function OpenClawPage() {
  const { session } = useAuth()
  const [runtime, setRuntime] = useState<OpenClawRuntimePayload | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    if (!session?.accessToken) {
      setRuntime(null)
      return
    }

    try {
      const result = await fetchOpenClawRuntime(session.accessToken)
      setRuntime(result)
      setError('')
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load OpenClaw runtime.'))
    }
  }, [session?.accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const handleReload = async () => {
    if (!session?.accessToken) {
      return
    }

    setPending(true)
    setMessage('')
    setError('')

    try {
      const result = await requestOpenClawReload(session.accessToken)
      setMessage(`Reload request #${result.reload_request_id} queued.`)
      await load()
    } catch (reloadError) {
      setError(getErrorMessage(reloadError, 'Unable to request runtime reload.'))
    } finally {
      setPending(false)
    }
  }

  if (!runtime && !error) {
    return <LoadingSection title="OpenClaw" subtitle="Runtime control" />
  }

  return (
    <div className="page-stack">
      {message ? <FormMessage tone="success">{message}</FormMessage> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {runtime ? (
        <>
          <SectionCard
            title="Runtime"
            subtitle={`Config ${runtime.control_plane.config_version}`}
            action={
              <button type="button" className="button button--ghost button--tiny" disabled={pending} onClick={() => void handleReload()}>
                {pending ? 'Queuing...' : 'Reload'}
              </button>
            }
          >
            <div className="detail-pairs">
              <DetailPair label="Enabled" value={runtime.runtime.runtime.is_enabled ? 'Yes' : 'No'} />
              <DetailPair label="Gateway" value={runtime.runtime.runtime_status.gateway_state} />
              <DetailPair label="Discord" value={runtime.runtime.runtime_status.discord_state} />
              <DetailPair label="Last Reload" value={formatDateTime(runtime.runtime.runtime_status.last_reload_at)} />
            </div>
          </SectionCard>

          <SectionCard title="Providers">
            <div className="list-stack">
              {runtime.runtime.providers.map((provider) => (
                <ListRow
                  key={provider.id}
                  icon="spark"
                  title={provider.display_name}
                  detail={provider.provider_type}
                  action={<span className={`pill ${provider.is_enabled ? 'pill--success' : ''}`}>{provider.is_enabled ? 'Enabled' : 'Disabled'}</span>}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Models">
            <div className="list-stack">
              {runtime.runtime.models.map((model) => (
                <ListRow
                  key={model.id}
                  icon="activity"
                  title={model.display_name}
                  detail={model.model_id}
                  action={<span className={`pill ${model.is_default ? 'pill--success' : ''}`}>{model.is_default ? 'Default' : 'Available'}</span>}
                />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Channels">
            <div className="list-stack">
              {runtime.runtime.channels.length ? (
                runtime.runtime.channels.map((channel) => (
                  <ListRow
                    key={channel.id}
                    icon="discord"
                    title={channel.guild_id}
                    detail={channel.channel_id}
                    action={<span className={`pill ${channel.is_enabled ? 'pill--success' : ''}`}>{channel.is_enabled ? 'Live' : 'Disabled'}</span>}
                  />
                ))
              ) : (
                <p className="body-copy">No Discord channels are configured yet.</p>
              )}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}
