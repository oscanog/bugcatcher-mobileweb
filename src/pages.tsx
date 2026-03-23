import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  dashboardPie,
  dashboardStats,
  dashboardTrend,
  issuesSummary,
  landingFeatures,
  leaderboard,
  openClawSections,
  organizations,
  profileSummary,
  projects,
  reports,
  type OpenClawSectionData,
} from './app-data'
import { AuthLayout } from './components/auth-layout'
import { BrandMark, AuthField, DetailPair, Icon, ListRow, SectionCard, StatCard, StatusTile, ThemeToggle } from './components/ui'
import { LegacyHeroAnimation } from './components/legacy-hero-animation'
import { isDemoAuthenticated, setDemoAuthenticated } from './demo-auth'
import { useNotifications } from './notifications-context'

const LEGACY_LANDING_BG =
  'https://i.pinimg.com/1200x/b2/13/65/b21365c035ff1cfa52edc492affa885b.jpg'

export function LandingPage() {
  const [isSignedIn] = useState(() => isDemoAuthenticated())
  const navigate = useNavigate()
  const startPath = isSignedIn ? '/app/dashboard' : '/login'

  return (
    <div className="landing-page">
      <header className="landing-header">
        <BrandMark />
        <div className="landing-header__actions">
          <ThemeToggle />
          <button type="button" className="landing-link" onClick={() => navigate('/login')}>
            Login
          </button>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" style={{ '--hero-bg': `url(${LEGACY_LANDING_BG})` } as CSSProperties}>
          <div className="landing-hero__overlay" />
          <div className="landing-hero__content">
            <LegacyHeroAnimation />
            <p className="landing-hero__eyebrow">BugCatcher Platform</p>
            <h1>
              Track Bugs Like a <span>Pro</span>
            </h1>
            <p>Simple issue tracking for projects, teams, and daily progress visibility.</p>
            <div className="landing-hero__actions">
              <Link to={startPath} className="button button--primary">
                Get Started
              </Link>
              <a href="#why-bugcatcher" className="button button--ghost">
                Learn More
              </a>
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <article className="landing-stat">
            <strong>∞</strong>
            <span>Bugs Caught</span>
          </article>
          <article className="landing-stat">
            <strong>100%</strong>
            <span>Tracking</span>
          </article>
          <article className="landing-stat">
            <strong>0</strong>
            <span>Bugs Escape</span>
          </article>
        </section>

        <section className="landing-features" id="why-bugcatcher">
          <div className="landing-section-head">
            <h2>Why Choose BugCatcher?</h2>
            <p>Everything teams need for clean issue flow.</p>
          </div>
          <div className="landing-feature-grid">
            {landingFeatures.map((feature) => (
              <article key={feature.title} className="landing-feature-card">
                <span className="landing-feature-card__icon">
                  <Icon name={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© 2026 BugCatcher. Built for students, by students.</p>
      </footer>
    </div>
  )
}

export function LoginPage() {
  return (
    <AuthLayout
      title="Login"
      subtitle="Super admin access"
      navLabel="Sign Up"
      navTo="/signup"
      footer={
        <p>
          No account? <Link to="/signup">Sign Up</Link>
        </p>
      }
    >
      <AuthField label="Email" placeholder="superadmin@local.dev" icon="mail" type="email" />
      <AuthField label="Password" placeholder="Enter password" icon="lock" type="password" />

      <div className="auth-actions-row">
        <Link className="button button--primary" to="/app/dashboard" onClick={() => setDemoAuthenticated(true)}>
          Login
        </Link>
        <Link className="button button--ghost" to="/forgot-password">
          Forgot
        </Link>
      </div>
    </AuthLayout>
  )
}

export function SignupPage() {
  return (
    <AuthLayout
      title="Sign Up"
      subtitle="Create account"
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Have account? <Link to="/login">Login</Link>
        </p>
      }
    >
      <AuthField label="Username" placeholder="superadmin" icon="users" />
      <AuthField label="Email" placeholder="superadmin@local.dev" icon="mail" type="email" />
      <AuthField label="Password" placeholder="Create password" icon="lock" type="password" />
      <AuthField label="Confirm" placeholder="Repeat password" icon="lock" type="password" />
      <div className="auth-actions-row">
        <Link className="button button--primary" to="/app/dashboard" onClick={() => setDemoAuthenticated(true)}>
          Create
        </Link>
      </div>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot Password"
      subtitle="Send OTP"
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Back to <Link to="/login">Login</Link>
        </p>
      }
    >
      <AuthField label="Email" placeholder="superadmin@local.dev" icon="mail" type="email" />
      <div className="auth-actions-row">
        <Link className="button button--primary" to="/forgot-password/verify">
          Send OTP
        </Link>
      </div>
    </AuthLayout>
  )
}

export function ForgotPasswordVerifyPage() {
  return (
    <AuthLayout
      title="OTP Verify"
      subtitle="6-digit code"
      navLabel="Login"
      navTo="/login"
      footer={
        <p>
          Need new code? <Link to="/forgot-password">Retry</Link>
        </p>
      }
    >
      <div className="otp-preview">
        {['3', '8', '2', '1', '4', '7'].map((digit, index) => (
          <span key={`${digit}-${index}`}>{digit}</span>
        ))}
      </div>

      <AuthField label="New Password" placeholder="New password" icon="lock" type="password" />
      <AuthField label="Confirm" placeholder="Repeat password" icon="lock" type="password" />
      <div className="auth-actions-row">
        <Link className="button button--primary" to="/forgot-password/success">
          Reset
        </Link>
      </div>
    </AuthLayout>
  )
}

export function ForgotPasswordSuccessPage() {
  return (
    <AuthLayout title="Reset Success" subtitle="Password updated" navLabel="Login" navTo="/login">
      <div className="success-panel">
        <div className="success-panel__icon">
          <Icon name="checklist" />
        </div>
        <div>
          <h3>All set</h3>
          <p>Use your new password.</p>
        </div>
      </div>
      <div className="auth-actions-row">
        <Link className="button button--primary" to="/login">
          Login
        </Link>
        <Link className="button button--ghost" to="/app/dashboard" onClick={() => setDemoAuthenticated(true)}>
          Demo
        </Link>
      </div>
    </AuthLayout>
  )
}

export function DashboardPage() {
  const pieFill = `conic-gradient(
    ${dashboardPie[0].color} 0% ${dashboardPie[0].value}%,
    ${dashboardPie[1].color} ${dashboardPie[0].value}% ${dashboardPie[0].value + dashboardPie[1].value}%,
    ${dashboardPie[2].color} ${dashboardPie[0].value + dashboardPie[1].value}% 100%
  )`

  const maxBarValue = Math.max(
    ...dashboardTrend.flatMap((entry) => [entry.issues, entry.projects, entry.checklist]),
  )
  const barHeight = (value: number) => `${Math.max(12, (value / maxBarValue) * 100)}%`
  const leaderboardRoles = ['Junior Developer', 'Project Manager', 'QA Tester', 'QA Lead']

  return (
    <div className="page-stack">
      <SectionCard title="Live Summary" subtitle="Today">
        <div className="dashboard-hero">
          <div className="dashboard-hero__chart">
            <div className="pie-chart pie-chart--compact" style={{ '--pie-fill': pieFill } as CSSProperties}>
              <div className="pie-chart__center">
                <strong>37</strong>
                <span>Issues</span>
              </div>
            </div>
          </div>

          <div className="dashboard-hero__trend">
            {dashboardTrend.slice(0, 6).map((entry) => (
              <div key={entry.day} className="mini-trend__group">
                <span
                  className="mini-trend__bar mini-trend__bar--issues"
                  style={{ '--bar-height': barHeight(entry.issues) } as CSSProperties}
                />
                <span
                  className="mini-trend__bar mini-trend__bar--projects"
                  style={{ '--bar-height': barHeight(entry.projects) } as CSSProperties}
                />
                <span
                  className="mini-trend__bar mini-trend__bar--checklist"
                  style={{ '--bar-height': barHeight(entry.checklist) } as CSSProperties}
                />
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="stats-grid">
        {dashboardStats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <SectionCard title="Leaderboard" subtitle="Top local performers">
        <div className="leaderboard leaderboard--legacy">
          {leaderboard.map((entry, index) => {
            const rank = index + 1
            const initials = entry.name
              .split(' ')
              .map((part) => part[0] ?? '')
              .join('')
              .slice(0, 1)
              .toUpperCase()
            const tierClass =
              rank === 1 ? 'is-gold' : rank === 2 ? 'is-silver' : rank === 3 ? 'is-bronze' : 'is-standard'

            return (
              <article key={entry.name} className={`leaderboard__row leaderboard__row--legacy ${tierClass}`}>
                <div className="leaderboard__left">
                  <span className="leaderboard__rank-tag">#{rank}</span>
                  <span className="leaderboard__avatar-wrap">
                    <span className="leaderboard__avatar">{initials}</span>
                    {rank === 1 ? (
                      <span className="leaderboard__crown" aria-hidden="true">
                        {'\u{1F451}'}
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="leaderboard__content">
                  <strong>{entry.name}</strong>
                  <p>{leaderboardRoles[index] ?? 'Contributor'}</p>
                </div>

                <div className="leaderboard__score">
                  <strong>{entry.issuesClosed} closed</strong>
                  <small>
                    {entry.projectsMoved} proj | {entry.checklistRate}% chk
                  </small>
                </div>
              </article>
            )
          })}
        </div>
      </SectionCard>

      <SectionCard title="Workload Split">
        <div className="pie-layout">
          <div className="pie-chart" style={{ '--pie-fill': pieFill } as CSSProperties}>
            <div className="pie-chart__center">
              <strong>100%</strong>
              <span>Today</span>
            </div>
          </div>
          <div className="pie-legend">
            {dashboardPie.map((segment) => (
              <div key={segment.label} className="pie-legend__item">
                <span className="pie-legend__dot" style={{ '--dot-color': segment.color } as CSSProperties} />
                <p>{segment.label}</p>
                <strong>{segment.value}%</strong>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="7-Day Trend">
        <div className="trend-chart">
          {dashboardTrend.map((entry) => (
            <div key={entry.day} className="trend-chart__group">
              <div className="trend-chart__bars">
                <span
                  className="trend-chart__bar trend-chart__bar--issues"
                  style={{ '--bar-height': barHeight(entry.issues) } as CSSProperties}
                />
                <span
                  className="trend-chart__bar trend-chart__bar--projects"
                  style={{ '--bar-height': barHeight(entry.projects) } as CSSProperties}
                />
                <span
                  className="trend-chart__bar trend-chart__bar--checklist"
                  style={{ '--bar-height': barHeight(entry.checklist) } as CSSProperties}
                />
              </div>
              <small>{entry.day}</small>
            </div>
          ))}
        </div>
        <div className="trend-legend">
          <span>
            <i className="trend-legend__dot trend-legend__dot--issues" />
            Issues
          </span>
          <span>
            <i className="trend-legend__dot trend-legend__dot--projects" />
            Projects
          </span>
          <span>
            <i className="trend-legend__dot trend-legend__dot--checklist" />
            Checklist
          </span>
        </div>
      </SectionCard>
    </div>
  )
}

export function OrganizationsPage() {
  return (
    <div className="page-stack">
      <div className="stack-grid stack-grid--organizations">
        <SectionCard title="Create Organization">
          <AuthField label="Organization" placeholder="e.g. Team Alpha" icon="organization" />
          <div className="button-row">
            <button type="button" className="button button--primary">
              Create
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Join Organization">
          <label className="auth-field">
            <span>Select</span>
            <div className="auth-field__input">
              <span className="auth-field__icon">
                <Icon name="search" />
              </span>
              <select defaultValue="Local Dev Org">
                <option>Local Dev Org</option>
                <option>Campus QA Council</option>
                <option>Pilot Support Ops</option>
              </select>
            </div>
          </label>
        </SectionCard>
      </div>

      <SectionCard title="Your Org">
        <div className="chip-row">
          {organizations.map((organization) => (
            <span key={organization.name} className="pill pill--success">
              {organization.name}
            </span>
          ))}
        </div>
      </SectionCard>

      {organizations.map((organization) => (
        <SectionCard key={organization.name} title={organization.name} subtitle={organization.summary}>
          <div className="detail-pairs">
            <DetailPair label="Owner" value={organization.owner} />
            <DetailPair label="Members" value={`${organization.members}`} />
            <DetailPair label="Projects" value={`${organization.projects}`} />
            <DetailPair label="Status" value={organization.status} />
          </div>
          <div className="button-row">
            <button type="button" className="button button--ghost">
              Open
            </button>
            <button type="button" className="button button--danger">
              Delete
            </button>
          </div>
        </SectionCard>
      ))}
    </div>
  )
}

export function ProjectsPage() {
  return (
    <div className="page-stack">
      <SectionCard title="Project Filter">
        <div className="chip-row">
          <span className="pill pill--dark">All</span>
          <span className="pill">Attention</span>
          <span className="pill">Shipping</span>
          <span className="pill">AI</span>
        </div>
      </SectionCard>

      {projects.map((project) => (
        <SectionCard key={project.name} title={project.name} subtitle={project.focus}>
          <div className="detail-pairs">
            <DetailPair label="Lead" value={project.lead} />
            <DetailPair label="Issues" value={`${project.openIssues}`} />
            <DetailPair label="Blockers" value={`${project.blockers}`} />
            <DetailPair label="Timeline" value={project.dueLabel} />
          </div>
          <div className="progress-rail">
            <span style={{ width: `${Math.max(18, 100 - project.blockers * 22 - project.openIssues)}%` }} />
          </div>
        </SectionCard>
      ))}
    </div>
  )
}

export function ReportsPage() {
  const issueLoad = [
    { label: 'Critical', count: 13, tone: 'critical', note: 'Escalate now' },
    { label: 'High', count: 21, tone: 'high', note: 'Needs owner' },
    { label: 'Medium', count: 24, tone: 'medium', note: 'Queue active' },
    { label: 'Low', count: 14, tone: 'low', note: 'Can wait' },
  ]
  const issueLoadMax = Math.max(...issueLoad.map((item) => item.count))

  return (
    <div className="page-stack">
      <SectionCard title="Issue Filter">
        <div className="chip-row">
          <span className="pill pill--dark">All</span>
          <span className="pill">Critical</span>
          <span className="pill">Assigned</span>
          <span className="pill">Stale</span>
        </div>
      </SectionCard>

      <div className="stats-grid">
        {issuesSummary.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <SectionCard title="Issue Load">
        <div className="issue-load">
          {issueLoad.map((item) => (
            <div key={item.label} className="issue-load__row">
              <div className="issue-load__meta">
                <strong>{item.label}</strong>
                <span>{item.note}</span>
              </div>
              <div className="issue-load__rail">
                <span
                  className={`issue-load__fill issue-load__fill--${item.tone}`}
                  style={{ width: `${(item.count / issueLoadMax) * 100}%` } as CSSProperties}
                />
              </div>
              <div className="issue-load__count">
                <strong>{item.count}</strong>
                <small>issues</small>
              </div>
            </div>
          ))}
          <div className="issue-load__footer">
            <span>72 open total</span>
            <span>13 critical</span>
          </div>
        </div>
      </SectionCard>

      {reports.map((report) => (
        <SectionCard key={report.title} title={report.title} subtitle={report.range}>
          <p className="body-copy">{report.insight}</p>
          <div className="report-footer">
            <span className={`pill ${report.status === 'Open' ? 'pill--danger' : report.status === 'Watch' ? 'pill--dark' : 'pill--success'}`}>
              {report.status}
            </span>
            <button type="button" className="button button--ghost">
              {report.cta}
            </button>
          </div>
        </SectionCard>
      ))}
    </div>
  )
}

export function SuperAdminPage() {
  const actions = ['Approve runtime reload', 'Assign backup owner', 'Review discord route']

  return (
    <div className="page-stack">
      <SectionCard title="Control Center">
        <div className="mini-grid">
          <StatusTile title="Escalations" value="03" note="1 overdue" tone="alert" />
          <StatusTile title="Approvals" value="11" note="Ready queue" tone="steel" />
        </div>
      </SectionCard>

      <SectionCard title="Priority">
        <div className="bullet-stack">
          {actions.map((item) => (
            <div key={item} className="bullet-row">
              <span className="bullet-row__marker" />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

export function OpenClawPage() {
  const [activeSection, setActiveSection] = useState<OpenClawSectionData['key']>('runtime')
  const currentSection =
    openClawSections.find((section) => section.key === activeSection) ?? openClawSections[0]

  return (
    <div className="page-stack">
      <SectionCard title="Sections">
        <div className="chip-row">
          {openClawSections.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`pill-button ${section.key === currentSection.key ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.key)}
            >
              {section.title}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={currentSection.title} subtitle={currentSection.description}>
        <div className="report-footer">
          <span className="pill pill--dark">{currentSection.badge}</span>
          <button type="button" className="button button--ghost">
            Reload
          </button>
        </div>
        <div className="list-stack">
          {currentSection.items.map((item) => (
            <ListRow key={item} icon="spark" title={item} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Snapshot">
        <div className="mini-grid">
          <StatusTile title="Desired" value="v24" note="ahead by 1" tone="steel" />
          <StatusTile title="Discord" value="Connected" note="synced" tone="success" />
          <StatusTile title="Pending" value="#104" note="queued" tone="alert" />
        </div>
      </SectionCard>
    </div>
  )
}

export function ManageUsersPage() {
  const users: Array<[string, string, string]> = [
    ['superadmin', 'super_admin', '2m'],
    ['qa.captain', 'org_owner', '14m'],
    ['support.lead', 'manager', '32m'],
    ['triage.bot', 'service', '1h'],
  ]

  return (
    <div className="page-stack">
      <SectionCard title="Users">
        <div className="list-stack">
          {users.map(([name, role, time]) => (
            <ListRow
              key={name}
              icon="users"
              title={name}
              detail={role}
              meta={time}
              action={
                <button type="button" className="inline-link">
                  Review
                </button>
              }
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

export function ChecklistPage() {
  const checklistItems: Array<[string, string]> = [
    ['Mobile shell QA', 'Ready'],
    ['Auth copy sync', 'Review'],
    ['OpenClaw labels', 'In progress'],
    ['README handoff', 'Done'],
  ]

  return (
    <div className="page-stack">
      <SectionCard title="Checklist">
        <div className="list-stack">
          {checklistItems.map(([title, status]) => (
            <ListRow
              key={title}
              icon="checklist"
              title={title}
              detail={status}
              action={<span className="pill pill--success">{status}</span>}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

export function DiscordLinksPage() {
  const links: Array<[string, string, string]> = [
    ['BugCatcher HQ', 'qa-intake', 'Healthy'],
    ['Support Collective', 'ops-alerts', 'Healthy'],
    ['Partner Sandbox', 'pilot-bugs', 'Refresh'],
  ]

  return (
    <div className="page-stack">
      <SectionCard title="Discord Link">
        <div className="list-stack">
          {links.map(([guild, channel, health]) => (
            <ListRow
              key={`${guild}-${channel}`}
              icon="discord"
              title={guild}
              detail={channel}
              action={<span className={`pill ${health === 'Healthy' ? 'pill--success' : 'pill--dark'}`}>{health}</span>}
            />
          ))}
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

export function ProfilePage() {
  return (
    <div className="page-stack">
      <SectionCard title="Super Admin">
        <div className="profile-hero">
          <div className="profile-hero__avatar">SA</div>
          <div className="profile-hero__copy">
            <strong>superadmin</strong>
            <p>superadmin@local.dev</p>
          </div>
          <span className="pill pill--success">Online</span>
        </div>
      </SectionCard>

      <div className="stats-grid">
        {profileSummary.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <SectionCard title="Quick Actions">
        <div className="list-stack">
          <ListRow icon="shield" title="Super Admin" detail="Global access" action={<span className="pill pill--dark">Open</span>} />
          <ListRow icon="users" title="Manage Users" detail="Roles + invites" action={<span className="pill">Review</span>} />
          <ListRow icon="settings" title="Settings" detail="App defaults" action={<span className="pill">Edit</span>} />
        </div>
      </SectionCard>

      <SectionCard title="Session">
        <div className="detail-pairs">
          <DetailPair label="Role" value="super_admin" />
          <DetailPair label="Org" value="Local Dev Org" />
          <DetailPair label="Last Active" value="2m ago" />
          <DetailPair label="Device" value="Mobile Web" />
        </div>
      </SectionCard>
    </div>
  )
}

export function NotificationsPage() {
  const { notifications, unreadCount, markAllAsRead } = useNotifications()
  const readCount = notifications.length - unreadCount
  const priorityCount = notifications.filter(
    (notification) => !notification.read && notification.tone === 'alert',
  ).length

  return (
    <div className="page-stack">
      <SectionCard title="Today">
        <div className="stats-grid">
          <StatCard stat={{ label: 'Unread', value: `${unreadCount}`, note: 'new', tone: 'alert' }} />
          <StatCard stat={{ label: 'Read', value: `${readCount}`, note: 'seen', tone: 'success' }} />
          <StatCard stat={{ label: 'Priority', value: `${priorityCount}`, note: 'need action', tone: 'steel' }} />
        </div>
      </SectionCard>

      <SectionCard
        title="In App Notifications"
        headerAlign="center"
        action={
          <button type="button" className="button button--ghost button--tiny" onClick={markAllAsRead}>
            Mark all read
          </button>
        }
      >
        <div className="list-stack">
          {notifications.map((item) => (
            <ListRow
              key={item.id}
              icon={item.tone === 'alert' ? 'alert' : item.tone === 'success' ? 'checklist' : 'activity'}
              title={item.title}
              detail={item.detail}
              meta={item.time}
              tone={item.tone}
              readState={item.read ? 'read' : 'unread'}
              action={
                <span className={`notif-chip ${item.read ? 'is-read' : 'is-unread'}`}>
                  {item.read ? 'Read' : 'Unread'}
                </span>
              }
            />
          ))}
        </div>
      </SectionCard>
    </div>
  )
}






