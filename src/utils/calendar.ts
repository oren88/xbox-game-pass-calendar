import type { GamePassEvent } from '../types'

export const monthLabel = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
})

export const dayLabel = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

export const shortDateLabel = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
})

export function getMonthDays(monthDate: Date) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function groupEventsByDate(events: GamePassEvent[]) {
  return events.reduce<Record<string, GamePassEvent[]>>((groups, event) => {
    groups[event.date] = [...(groups[event.date] ?? []), event]
    return groups
  }, {})
}

export function sortEvents(events: GamePassEvent[]) {
  return [...events].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date)
    return dateOrder === 0 ? a.title.localeCompare(b.title) : dateOrder
  })
}
