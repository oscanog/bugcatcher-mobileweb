import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { useNotifications } from '../features/notifications/context'
import { bottomNavItems, findAppRoute, getSidebarItems } from '../lib/access'
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { unreadCount } = useNotifications()
  const { activeMembership, defaultAppPath, logout, session, user } = useAuth()
  const drawerItems = getSidebarItems(session)

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
              {activeMembership ? ` / ${activeMembership.role}` : ''}
            </span>
            {activeMembership ? <small>{activeMembership.org_name}</small> : <small>No active organization</small>}
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
            <p className="top-bar__eyebrow">{activeMembership ? activeMembership.org_name : 'No active organization'}</p>
            <h1>{activeRoute.title}</h1>
            <p>
              {activeRoute.subtitle}
              {user ? ` | ${user.username} (${user.role}${activeMembership ? ` / ${activeMembership.role}` : ''})` : ''}
            </p>
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
