import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { appRoutes, bottomNavItems, drawerItems, type AppRouteDefinition } from '../app-data'
import { setDemoAuthenticated } from '../demo-auth'
import { useNotifications } from '../notifications-context'
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
  const activeRoute = resolveAppRoute(location.pathname)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { unreadCount } = useNotifications()

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
        <div className="drawer-section">
          {drawerItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => {
                if (item.tone === 'danger') {
                  setDemoAuthenticated(false)
                }
                setIsDrawerOpen(false)
              }}
              className={({ isActive }) =>
                `drawer-link ${isActive ? 'is-active' : ''} ${item.tone === 'danger' ? 'is-danger' : ''}`
              }
            >
              <span className="icon-wrap">
                <Icon name={item.icon} />
              </span>
              <span className="drawer-link__label">{item.label}</span>
            </NavLink>
          ))}
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
            <p className="top-bar__eyebrow">BugCatcher mobile</p>
            <h1>{activeRoute.title}</h1>
            {activeRoute.subtitle ? <p>{activeRoute.subtitle}</p> : null}
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
              to={item.to}
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

function resolveAppRoute(pathname: string): AppRouteDefinition {
  return (
    appRoutes.find((route) => pathname === route.path || pathname.startsWith(`${route.path}/`)) ??
    appRoutes[0]
  )
}
