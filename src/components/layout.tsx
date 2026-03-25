import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { fetchAIChatBootstrap } from '../features/ai-chat/api'
import { useNotifications } from '../features/notifications/context'
import { bottomNavItems, canAccessAiChat, findAppRoute, getSidebarItems } from '../lib/access'
import { useTheme } from '../theme-context'
import { BrandMark, Icon, ThemeToggle } from './ui'

export function AppViewport({ children }: { children: ReactNode }) {
  const { theme } = useTheme()

  return (
    <div className="site-shell" data-theme={theme}>
      <div className="site-shell__orb site-shell__orb--one" aria-hidden="true" />
      <div className="site-shell__orb site-shell__orb--two" aria-hidden="true" />
      <div className="site-shell__grid" aria-hidden="true" />
      <div className="mobile-frame">{children}</div>
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const activeRoute = findAppRoute(location.pathname)
  const isAiChatRoute = location.pathname.startsWith('/app/ai-chat')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isOrgSwitcherOpen, setIsOrgSwitcherOpen] = useState(false)
  const [orgFilter, setOrgFilter] = useState('')
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(false)
  const [showAiChatFab, setShowAiChatFab] = useState(false)
  const orgSwitcherRef = useRef<HTMLDivElement | null>(null)
  const { unreadCount } = useNotifications()
  const {
    activeMembership,
    canUseAllScope,
    defaultAppPath,
    logout,
    memberships,
    selectAllOrganizations,
    selection,
    selectionLabel,
    session,
    setActiveOrg,
    user,
  } = useAuth()
  const drawerItems = getSidebarItems(session)
  const shouldShowOrgFilter = memberships.length >= 6
  const filteredMemberships = useMemo(() => {
    const needle = orgFilter.trim().toLowerCase()
    if (!needle) {
      return memberships
    }
    return memberships.filter((membership) =>
      `${membership.org_name} ${membership.role}`.toLowerCase().includes(needle),
    )
  }, [memberships, orgFilter])

  const describeMembershipRole = (role: string) => (role === 'owner' ? 'Owner' : role)

  const describeMembershipMeta = (membership: { role: string; is_owner: boolean }) => {
    const baseRole = describeMembershipRole(membership.role)
    if (membership.is_owner && membership.role !== 'owner') {
      return `${baseRole} / Owner`
    }
    return baseRole
  }

  useEffect(() => {
    const run = async () => {
      if (!session?.accessToken || !session.activeOrgId || !canAccessAiChat(session)) {
        setShowAiChatFab(false)
        return
      }

      try {
        const bootstrap = await fetchAIChatBootstrap(session.accessToken, session.activeOrgId)
        setShowAiChatFab(Boolean(bootstrap.enabled))
      } catch {
        setShowAiChatFab(false)
      }
    }

    void run()
  }, [session])

  useEffect(() => {
    if (!isDrawerOpen) {
      setIsOrgSwitcherOpen(false)
      setOrgFilter('')
      setIsSwitchingOrg(false)
    }
  }, [isDrawerOpen])

  useEffect(() => {
    if (!isOrgSwitcherOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!orgSwitcherRef.current?.contains(event.target as Node)) {
        setIsOrgSwitcherOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOrgSwitcherOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOrgSwitcherOpen])

  const handleSelectOrg = async (orgId: number) => {
    setIsSwitchingOrg(true)
    const result = await setActiveOrg(orgId)
    setIsSwitchingOrg(false)
    if (result.ok) {
      setIsDrawerOpen(false)
    }
  }

  const handleSelectAll = async () => {
    setIsSwitchingOrg(true)
    const result = await selectAllOrganizations()
    setIsSwitchingOrg(false)
    if (result.ok) {
      setIsDrawerOpen(false)
    }
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`drawer-backdrop ${isDrawerOpen ? 'is-open' : ''}`}
        aria-label="Close navigation drawer"
        onClick={() => setIsDrawerOpen(false)}
      />

      <aside className={`side-drawer ${isDrawerOpen ? 'is-open' : ''}`} aria-hidden={!isDrawerOpen}>
        <div className="side-drawer__header">
          <BrandMark />
        </div>
        {user ? (
          <div className="drawer-usercard">
            <strong>{user.username}</strong>
            <p>{user.email}</p>
            <span>
              {user.role}
              {selection.scope === 'org' && activeMembership ? ` / ${describeMembershipRole(activeMembership.role)}` : ''}
            </span>
            <small>{selectionLabel}</small>
            {(memberships.length > 0 || canUseAllScope) ? (
              <div className="drawer-org-switcher" ref={orgSwitcherRef}>
                <button
                  type="button"
                  className={`drawer-org-switcher__trigger ${isOrgSwitcherOpen ? 'is-open' : ''}`}
                  onClick={() => setIsOrgSwitcherOpen((current) => !current)}
                  disabled={isSwitchingOrg}
                  aria-expanded={isOrgSwitcherOpen}
                  aria-haspopup="menu"
                >
                  <span className="drawer-org-switcher__trigger-icon" aria-hidden="true">
                    <Icon name="organization" />
                  </span>
                  <span className="drawer-org-switcher__trigger-copy">
                    <span>{selection.scope === 'all' ? 'Viewing all organizations' : 'Switch organization'}</span>
                    <strong>{selectionLabel}</strong>
                  </span>
                  <span className="drawer-org-switcher__trigger-chevron" aria-hidden="true">
                    <Icon name="arrow" />
                  </span>
                </button>
                {isOrgSwitcherOpen ? (
                  <div className="drawer-org-switcher__panel" role="menu">
                    <div className="drawer-org-switcher__panel-head">
                      <span>Organization view</span>
                      <strong>{selection.scope === 'all' ? 'Aggregate scope' : 'Choose a workspace'}</strong>
                    </div>
                    {shouldShowOrgFilter ? (
                      <input
                        className="input-inline drawer-org-switcher__filter"
                        value={orgFilter}
                        onChange={(event) => setOrgFilter(event.target.value)}
                        placeholder="Filter organizations"
                      />
                    ) : null}
                    {canUseAllScope ? (
                      <button
                        type="button"
                        className={`drawer-org-switcher__option ${selection.scope === 'all' ? 'is-active' : ''}`}
                        onClick={() => void handleSelectAll()}
                        disabled={isSwitchingOrg}
                        role="menuitemradio"
                        aria-checked={selection.scope === 'all'}
                      >
                        <span className="drawer-org-switcher__option-header">
                          <span className="drawer-org-switcher__option-title">All organizations</span>
                          {selection.scope === 'all' ? <span className="drawer-org-switcher__badge">Active</span> : null}
                        </span>
                        <small>Admin aggregate view</small>
                      </button>
                    ) : null}
                    <div className="drawer-org-switcher__list">
                      {filteredMemberships.length > 0 ? (
                        filteredMemberships.map((membership) => (
                          <button
                            key={membership.org_id}
                            type="button"
                            className={`drawer-org-switcher__option ${selection.scope === 'org' && selection.orgId === membership.org_id ? 'is-active' : ''}`}
                            onClick={() => void handleSelectOrg(membership.org_id)}
                            disabled={isSwitchingOrg}
                            role="menuitemradio"
                            aria-checked={selection.scope === 'org' && selection.orgId === membership.org_id}
                          >
                            <span className="drawer-org-switcher__option-header">
                              <span className="drawer-org-switcher__option-title">{membership.org_name}</span>
                              {selection.scope === 'org' && selection.orgId === membership.org_id ? (
                                <span className="drawer-org-switcher__badge">Active</span>
                              ) : null}
                            </span>
                            <small>{describeMembershipMeta(membership)}</small>
                          </button>
                        ))
                      ) : (
                        <p className="drawer-org-switcher__empty">No organizations match that filter.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="drawer-section">
          {drawerItems.map((item) =>
            item.tone === 'danger' ? (
              <button
                key={item.label}
                type="button"
                className="drawer-link drawer-link--button is-danger"
                onClick={() => {
                  void logout()
                  setIsDrawerOpen(false)
                }}
              >
                <span className="icon-wrap">
                  <Icon name={item.icon} />
                </span>
                <span className="drawer-link__label">{item.label}</span>
              </button>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setIsDrawerOpen(false)}
                className={({ isActive }) => `drawer-link ${isActive ? 'is-active' : ''}`}
              >
                <span className="icon-wrap">
                  <Icon name={item.icon} />
                </span>
                <span className="drawer-link__label">{item.label}</span>
              </NavLink>
            )
          )}
        </div>
      </aside>

      <div className="app-shell__screen">
        <header className="top-bar">
          <button
            type="button"
            className="icon-button"
            aria-label="Open navigation drawer"
            onClick={() => setIsDrawerOpen(true)}
          >
            <Icon name="more" />
          </button>

          <div className="top-bar__titles">
            <p className="top-bar__eyebrow">{selectionLabel}</p>
            <h1>{activeRoute.title}</h1>
            <p>{activeRoute.subtitle}</p>
          </div>

          <div className="top-bar__actions">
            <ThemeToggle />
            <NavLink
              to="/app/notifications"
              className={({ isActive }) => `top-bar__chip top-bar__chip--icon ${isActive ? 'is-active' : ''}`}
              aria-label="Notifications"
            >
              <Icon name="bell" />
              {unreadCount > 0 ? <span className="top-bar__badge">{unreadCount}</span> : null}
            </NavLink>
          </div>
        </header>

        <main className="page-scroll">
          <Outlet />
        </main>

        {showAiChatFab && !isAiChatRoute ? (
          <NavLink
            to="/app/ai-chat"
            className={({ isActive }) => `ai-chat-fab ${isActive ? 'is-active' : ''}`}
            aria-label="Chat with AI"
          >
            <Icon name="chat" />
            <span>AI</span>
          </NavLink>
        ) : null}

        <nav className="bottom-nav" aria-label="Primary">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to === '/app/dashboard' && !activeMembership ? defaultAppPath : item.to}
              className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
              title={item.label}
              data-tooltip={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.shortLabel ?? item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
