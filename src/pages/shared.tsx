/* eslint-disable react-refresh/only-export-components */
import { SectionCard } from '../components/ui'

export function FormMessage({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info'
  children: string
}) {
  return <div className={`form-message form-message--${tone}`}>{children}</div>
}

export function LoadingSection({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <p className="body-copy">Loading...</p>
    </SectionCard>
  )
}

export function EmptySection({
  title,
  subtitle,
  message,
}: {
  title: string
  subtitle?: string
  message: string
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <p className="body-copy">{message}</p>
    </SectionCard>
  )
}

export function initialsFromUsername(username: string): string {
  return (
    username
      .split(/[^a-zA-Z0-9]+/)
      .map((part) => part[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'BC'
  )
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return 'Now'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const diffSeconds = Math.round((parsed.getTime() - Date.now()) / 1000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]

  for (const [unit, size] of units) {
    if (Math.abs(diffSeconds) >= size || unit === 'minute') {
      return formatter.format(Math.round(diffSeconds / size), unit)
    }
  }

  return formatter.format(diffSeconds, 'second')
}
