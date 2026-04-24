import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { monthLabel } from '../utils/calendar'

type MonthControlsProps = {
  monthDate: Date
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}

export function MonthControls({
  monthDate,
  onPrevious,
  onNext,
  onToday,
}: MonthControlsProps) {
  return (
    <div className="month-controls" aria-label="달력 월 이동">
      <button type="button" className="icon-button" onClick={onPrevious} aria-label="이전 달">
        <ChevronLeft size={18} />
      </button>
      <h2>{monthLabel.format(monthDate)}</h2>
      <button type="button" className="icon-button" onClick={onNext} aria-label="다음 달">
        <ChevronRight size={18} />
      </button>
      <button type="button" className="today-button" onClick={onToday}>
        <RotateCcw size={16} />
        오늘
      </button>
    </div>
  )
}
