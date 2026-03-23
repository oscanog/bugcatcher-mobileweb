import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark, ThemeToggle } from './ui'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  navLabel,
  navTo,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  navLabel: string
  navTo: string
}) {
  return (
    <div className="auth-screen">
      <header className="landing-header auth-screen__header">
        <Link to="/" className="auth-screen__brand-link" aria-label="Go to landing page">
          <BrandMark />
        </Link>
        <div className="landing-header__actions">
          <ThemeToggle />
          <Link to={navTo} className="landing-link">
            {navLabel}
          </Link>
        </div>
      </header>

      <div className="auth-card">
        <div className="auth-card__header">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="auth-form">{children}</div>
        {footer ? <div className="auth-card__footer">{footer}</div> : null}
      </div>
    </div>
  )
}
