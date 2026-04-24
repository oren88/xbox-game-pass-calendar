import { Monitor, Sparkles } from 'lucide-react'
import type { PlatformFilter } from '../types'

const platformOptions: PlatformFilter[] = ['all', 'Cloud', 'Console', 'PC', 'Handheld']

const platformLabels: Record<PlatformFilter, string> = {
  all: '전체',
  Cloud: 'Cloud',
  Console: 'Console',
  PC: 'PC',
  Handheld: 'Handheld',
}

type FilterBarProps = {
  platform: PlatformFilter
  dayOneOnly: boolean
  onPlatformChange: (platform: PlatformFilter) => void
  onDayOneOnlyChange: (enabled: boolean) => void
}

export function FilterBar({
  platform,
  dayOneOnly,
  onPlatformChange,
  onDayOneOnlyChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar" aria-label="게임 표시 필터">
      <div className="segmented-control" aria-label="플랫폼 필터">
        <Monitor size={16} aria-hidden="true" />
        {platformOptions.map((option) => (
          <button
            type="button"
            key={option}
            className={platform === option ? 'active' : undefined}
            onClick={() => onPlatformChange(option)}
          >
            {platformLabels[option]}
          </button>
        ))}
      </div>
      <label className="switch-control">
        <input
          type="checkbox"
          checked={dayOneOnly}
          onChange={(event) => onDayOneOnlyChange(event.currentTarget.checked)}
        />
        <span aria-hidden="true">
          <Sparkles size={15} />
        </span>
        Day one만
      </label>
    </div>
  )
}
