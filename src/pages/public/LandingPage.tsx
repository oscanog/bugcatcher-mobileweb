import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { landingFeatures } from '../../app-data'
import { useAuth } from '../../auth-context'
import { Icon, ThemeToggle, BrandMark } from '../../components/ui'
import { LegacyHeroAnimation } from '../../components/legacy-hero-animation'

const LEGACY_LANDING_BG =
  'https://i.pinimg.com/1200x/b2/13/65/b21365c035ff1cfa52edc492affa885b.jpg'

export function LandingPage() {
  const { defaultAppPath, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const startPath = isAuthenticated ? defaultAppPath : '/login'

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
                {isAuthenticated ? 'Continue' : 'Get Started'}
              </Link>
              <a href="#why-bugcatcher" className="button button--ghost">
                Learn More
              </a>
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <article className="landing-stat">
            <strong>&infin;</strong>
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
        <p>&copy; 2026 BugCatcher. Built for students, by students.</p>
      </footer>
    </div>
  )
}
