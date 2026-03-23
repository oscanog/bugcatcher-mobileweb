export type IconName =
  | 'dashboard'
  | 'organization'
  | 'projects'
  | 'reports'
  | 'more'
  | 'bell'
  | 'shield'
  | 'checklist'
  | 'discord'
  | 'users'
  | 'spark'
  | 'settings'
  | 'logout'
  | 'arrow'
  | 'activity'
  | 'alert'
  | 'lock'
  | 'mail'
  | 'search'
  | 'globe'

export interface NavItem {
  label: string
  shortLabel?: string
  to: string
  icon: IconName
}

export interface StatCardData {
  label: string
  value: string
  note: string
  tone: 'steel' | 'success' | 'alert'
}

export interface LandingFeatureData {
  title: string
  description: string
  icon: IconName
}

export const landingFeatures: LandingFeatureData[] = [
  {
    title: 'Create Issues',
    description: 'Log bugs fast with clear details and ownership.',
    icon: 'checklist',
  },
  {
    title: 'Organize with Labels',
    description: 'Group bugs by priority and workflow stage.',
    icon: 'organization',
  },
  {
    title: 'Team Collaboration',
    description: 'Assign tasks and track progress across roles.',
    icon: 'users',
  },
]
