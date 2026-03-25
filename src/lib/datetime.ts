export const APP_TIMEZONE = 'Asia/Singapore'
export const APP_UTC_OFFSET_MINUTES = 8 * 60

const LEGACY_SQL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function parseLegacySqlDate(value: string): Date | null {
  const match = LEGACY_SQL_DATETIME_PATTERN.exec(value.trim())
  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match
  const utcTimestamp =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) -
    APP_UTC_OFFSET_MINUTES * 60 * 1000

  const parsed = new Date(utcTimestamp)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseIsoLikeDate(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseApiDate(value: string | null | undefined, isoValue?: string | null | undefined): Date | null {
  const preferredIso = typeof isoValue === 'string' ? isoValue.trim() : ''
  if (preferredIso) {
    const parsedIso = parseIsoLikeDate(preferredIso)
    if (parsedIso) {
      return parsedIso
    }
  }

  const rawValue = typeof value === 'string' ? value.trim() : ''
  if (!rawValue) {
    return null
  }

  const parsedLegacy = parseLegacySqlDate(rawValue)
  if (parsedLegacy) {
    return parsedLegacy
  }

  return parseIsoLikeDate(rawValue)
}

export function formatApiDateTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  if (!value && !isoValue) {
    return 'Not set'
  }

  const parsed = parseApiDate(value, isoValue)
  if (!parsed) {
    return value || isoValue || 'Not set'
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function formatApiRelativeTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  if (!value && !isoValue) {
    return 'Now'
  }

  const parsed = parseApiDate(value, isoValue)
  if (!parsed) {
    return value || isoValue || 'Now'
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

export function formatApiChatTime(value: string | null | undefined, isoValue?: string | null | undefined): string {
  if (!value && !isoValue) {
    return ''
  }

  const parsed = parseApiDate(value, isoValue)
  if (!parsed) {
    return value || isoValue || ''
  }

  const diffSeconds = Math.floor((Date.now() - parsed.getTime()) / 1000)
  if (diffSeconds < 60) {
    return 'just now'
  }

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  return new Intl.DateTimeFormat(undefined, {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  }).format(parsed)
}

export function formatAppLiveDateTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)

  const readPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  const month = readPart('month').toLowerCase()
  const day = readPart('day')
  const year = readPart('year')
  const hour = readPart('hour')
  const minute = readPart('minute')
  const dayPeriod = readPart('dayPeriod').toUpperCase()

  return `${month} ${day}, ${year} - ${hour}:${minute}${dayPeriod}`
}

export function getAppHour(date: Date = new Date()): number {
  const hourPart = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .find((part) => part.type === 'hour')

  const parsedHour = Number(hourPart?.value ?? '0')
  return Number.isFinite(parsedHour) ? parsedHour : 0
}

export function getGreetingPeriod(date: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = getAppHour(date)
  if (hour >= 5 && hour <= 11) {
    return 'morning'
  }
  if (hour >= 12 && hour <= 17) {
    return 'afternoon'
  }
  return 'evening'
}

export function getFirstName(value: string | null | undefined): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return 'Teammate'
  }

  const firstToken = trimmed.split(/[\s._-]+/).find(Boolean)
  return firstToken || trimmed
}
