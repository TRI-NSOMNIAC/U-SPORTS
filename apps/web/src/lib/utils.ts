import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { EventStatus, Sport, StatDefinition } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Human-readable label for underscore enums (`in_progress` → `In Progress`). */
export function formatEnumLabel(value: string | null | undefined): string {
  if (value == null || value === '') return ''
  return value
    .split('_')
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ''))
    .filter(Boolean)
    .join(' ')
}

/** Guest-friendly labels (no raw enums). */
export function eventPublicLifecycleLabel(status: EventStatus | string): string {
  switch (status) {
    case 'draft':
      return 'Preparing'
    case 'registration':
      return 'Upcoming'
    case 'in_progress':
      return 'Ongoing'
    case 'completed':
      return 'Finished'
    case 'cancelled':
      return 'Cancelled'
    default:
      return formatEnumLabel(status)
  }
}

/** Organizer-facing status badges: distinguishes tryout registration vs tournament “upcoming”. */
export function organizerEventStatusLabel(status: EventStatus | string, isTryout: boolean): string {
  switch (status) {
    case 'registration':
      return isTryout ? 'Open registration' : 'Upcoming'
    case 'draft':
      return 'Draft'
    case 'in_progress':
      return 'Ongoing'
    case 'completed':
      return 'Finished'
    case 'cancelled':
      return 'Cancelled'
    default:
      return formatEnumLabel(status)
  }
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getSportLabel(sport: Sport): string {
  const labels: Record<Sport, string> = {
    basketball: 'Basketball',
    volleyball: 'Volleyball',
    'table-tennis': 'Table Tennis',
  }
  return labels[sport]
}

export function getSportIcon(sport: Sport): string {
  const icons: Record<Sport, string> = {
    basketball: '🏀',
    volleyball: '🏐',
    'table-tennis': '🏓',
  }
  return icons[sport]
}

export function getSportColor(sport: Sport): string {
  const colors: Record<Sport, string> = {
    basketball: '#FF8C00',
    volleyball: '#0066FF',
    'table-tennis': '#00CC66',
  }
  return colors[sport]
}

export function formatStatValue(value: number, definition: StatDefinition): string {
  if (definition.type === 'percentage') return `${value.toFixed(1)}%`
  if (definition.type === 'decimal') return value.toFixed(1)
  return value.toString()
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function applyTheme(primaryColor: string, secondaryColor: string) {
  const root = document.documentElement
  root.style.setProperty('--school-primary', primaryColor)
  root.style.setProperty('--school-secondary', secondaryColor)
}

export function generateStudentEmail(fullName: string, studentDomain: string): string {
  const parts = fullName.trim().split(' ')
  if (parts.length < 2) return ''
  const lastName = parts[parts.length - 1].toLowerCase()
  const firstInitial = parts[0][0].toLowerCase()
  const middleInitial = parts.length > 2 ? parts[1][0].toLowerCase() : ''
  return `${lastName}${firstInitial}${middleInitial}@${studentDomain}`
}

export function generateStaffEmail(fullName: string, staffDomain: string): string {
  return generateStudentEmail(fullName, staffDomain)
}

/** Filter organizer student enrollment lists by name, email, ID, year, or department. */
export function matchesEnrollmentSearch(
  row: {
    full_name: string
    email: string
    student_id?: string | null
    year_level?: string | null
    department?: string | null
  },
  query: string,
): boolean {
  const t = query.trim().toLowerCase()
  if (!t) return true
  return [row.full_name, row.email, row.student_id, row.year_level, row.department].some((x) =>
    String(x ?? '').toLowerCase().includes(t),
  )
}
