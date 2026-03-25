import { useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import type { IconName, StatCardData } from '../app-data'
import { useTheme } from '../theme-context'

export function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-mark__icon" aria-hidden="true">
        <img className="brand-mark__logo" src="/favicon.svg" alt="" />
      </span>
      <span className="brand-mark__text">BugCatcher</span>
    </div>
  )
}

export function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="4" width="7" height="7" rx="2" />
        <rect x="14" y="4" width="7" height="11" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="18" width="7" height="3" rx="1.5" />
      </>
    ),
    organization: (
      <>
        <path d="M5 20V9l7-4 7 4v11" />
        <path d="M9 20v-5h6v5" />
      </>
    ),
    projects: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
    reports: (
      <>
        <path d="M5 19V10" />
        <path d="M12 19V6" />
        <path d="M19 19v-9" />
      </>
    ),
    more: (
      <>
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
      </>
    ),
    bell: (
      <>
        <path d="M7 10a5 5 0 1 1 10 0v4l1.5 2.5H5.5L7 14z" />
        <path d="M10 18a2 2 0 0 0 4 0" />
      </>
    ),
    shield: <path d="M12 3l7 3v5c0 4.6-2.8 7.7-7 10-4.2-2.3-7-5.4-7-10V6l7-3Z" />,
    checklist: (
      <>
        <path d="M7 7h11" />
        <path d="M7 12h11" />
        <path d="M7 17h11" />
        <path d="M4.5 7.5l1.5 1.5 2.5-3" />
        <path d="M4.5 12.5l1.5 1.5 2.5-3" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="9" r="3" />
        <circle cx="16.5" cy="10.5" r="2.5" />
        <path d="M4 19c1.2-3 3.7-4.5 7-4.5 2.2 0 4.2.7 5.7 2.2" />
      </>
    ),
    spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4v2M12 18v2M20 12h-2M6 12H4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7 6.3 6.3" />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" />
        <path d="M13 8l4 4-4 4" />
        <path d="M9 12h8" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="M13 6l6 6-6 6" />
      </>
    ),
    activity: <path d="M4 13h4l2-5 4 10 2-5h4" />,
    alert: (
      <>
        <path d="M12 4 3.5 19h17L12 4Z" />
        <path d="M12 10v4" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="3" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="3" />
        <path d="m5 8 7 5 7-5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="5" />
        <path d="m17 17 4 4" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 7.5v4.8l3 1.8" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    'eye-off': (
      <>
        <path d="M3 3 21 21" />
        <path d="M10.6 6.3A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.5 17.5 0 0 1-4.2 4.8" />
        <path d="M8.1 8.2A17.1 17.1 0 0 0 2.5 12s3.5 6 9.5 6c1.2 0 2.4-.2 3.4-.6" />
        <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      </>
    ),
    chat: (
      <>
        <path d="M5 6.5h14a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 19 17.5H11l-4.5 3v-3H5A2.5 2.5 0 0 1 2.5 15V9A2.5 2.5 0 0 1 5 6.5Z" />
        <path d="M8 11h8M8 14h5" />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function AuthField({
  label,
  placeholder,
  icon,
  type = 'text',
  disabled = false,
  error,
  allowVisibilityToggle = false,
  ...inputProps
}: {
  label: string
  placeholder: string
  icon: IconName
  type?: 'text' | 'email' | 'password'
  disabled?: boolean
  error?: boolean
  allowVisibilityToggle?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'children'>) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const supportsVisibilityToggle = type === 'password' && allowVisibilityToggle
  const resolvedType = supportsVisibilityToggle && isPasswordVisible ? 'text' : type
  const toggleLabel = `${isPasswordVisible ? 'Hide' : 'Show'} ${label.toLowerCase()}`

  return (
    <label className="auth-field">
      <span>{label}</span>
      <div className={`auth-field__input ${error ? 'is-error' : ''}`}>
        <span className="auth-field__icon">
          <Icon name={icon} />
        </span>
        <input
          type={resolvedType}
          placeholder={placeholder}
          disabled={disabled}
          {...inputProps}
        />
        {supportsVisibilityToggle ? (
          <button
            type="button"
            className="auth-field__toggle"
            onClick={() => setIsPasswordVisible((current) => !current)}
            aria-label={toggleLabel}
            aria-pressed={isPasswordVisible}
            disabled={disabled}
          >
            <Icon name={isPasswordVisible ? 'eye-off' : 'eye'} />
          </button>
        ) : null}
      </div>
    </label>
  )
}

export function SectionCard({
  title,
  subtitle,
  action,
  headerAlign = 'start',
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  headerAlign?: 'start' | 'center'
  children: ReactNode
}) {
  return (
    <section className="section-card">
      <div className={`section-card__header section-card__header--${headerAlign}`}>
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action ? <div className="section-card__action">{action}</div> : null}
      </div>
      <div className="section-card__body">{children}</div>
    </section>
  )
}

export function StatCard({ stat }: { stat: StatCardData }) {
  return (
    <article className={`stat-card stat-card--${stat.tone}`}>
      <p>{stat.label}</p>
      <div className="stat-card__metric">
        <strong>{stat.value}</strong>
        <span>{stat.note}</span>
      </div>
    </article>
  )
}

export function StatusTile({
  title,
  value,
  note,
  tone,
}: {
  title: string
  value: string
  note: string
  tone: StatCardData['tone']
}) {
  return (
    <article className={`status-tile status-tile--${tone}`}>
      <p>{title}</p>
      <div className="stat-card__metric">
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </article>
  )
}

export function ListRow({
  icon,
  title,
  detail,
  meta,
  tone = 'default',
  readState,
  action,
}: {
  icon: IconName
  title: string
  detail?: string
  meta?: string
  tone?: 'default' | 'success' | 'alert'
  readState?: 'read' | 'unread'
  action?: ReactNode
}) {
  const stateClass = readState ? `list-row--${readState}` : ''
  return (
    <article className={`list-row list-row--${tone} ${stateClass}`}>
      <span className="icon-wrap">
        <Icon name={icon} />
      </span>
      <div className="list-row__body">
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      <div className="list-row__aside">
        {meta ? <small>{meta}</small> : null}
        {action}
      </div>
    </article>
  )
}

export function DetailPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-pair">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextTheme = theme === 'light' ? 'dark' : 'light'

  return (
    <button
      type="button"
      className={`theme-toggle ${theme === 'dark' ? 'is-dark' : ''}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb">
          <svg
            className="theme-toggle__icon theme-toggle__icon--sun"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3" />
          </svg>
          <svg
            className="theme-toggle__icon theme-toggle__icon--moon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
          </svg>
        </span>
      </span>
      <span className="theme-toggle__label">{theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
