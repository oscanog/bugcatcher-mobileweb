/* eslint-disable react-refresh/only-export-components */
import { SectionCard } from '../components/ui'
import { formatApiChatTime, formatApiDateTime, formatApiRelativeTime } from '../lib/datetime'

export function FormMessage({
  id,
  tone,
  children,
}: {
  id?: string
  tone: 'error' | 'success' | 'info'
  children: string
}) {
  return (
    <div
      id={id}
      className={`form-message form-message--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
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

export function formatDateTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  return formatApiDateTime(value, isoValue)
}

export function formatRelativeTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  return formatApiRelativeTime(value, isoValue)
}

export function formatChatTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  return formatApiChatTime(value, isoValue)
}
