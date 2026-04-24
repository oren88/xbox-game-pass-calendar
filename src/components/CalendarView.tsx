import type { GamePassEvent } from '../types'
import { dayLabel, getMonthDays, groupEventsByDate, toDateKey } from '../utils/calendar'
import { EventCard } from './EventCard'

const weekdays = ['일', '월', '화', '수', '목', '금', '토']

type CalendarViewProps = {
  monthDate: Date
  events: GamePassEvent[]
  selectedDate: string | null
  onSelectDate: (date: string) => void
}

export function CalendarView({
  monthDate,
  events,
  selectedDate,
  onSelectDate,
}: CalendarViewProps) {
  const todayKey = toDateKey(new Date())
  const eventsByDate = groupEventsByDate(events)
  const days = getMonthDays(monthDate)

  return (
    <section className="calendar-shell" aria-label="Game Pass 월간 달력">
      <div className="weekday-row" aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {days.map((day) => {
          const dateKey = toDateKey(day)
          const dayEvents = eventsByDate[dateKey] ?? []
          const inMonth = day.getMonth() === monthDate.getMonth()
          const isSelected = selectedDate === dateKey
          const className = [
            'calendar-day',
            inMonth ? '' : 'outside',
            dateKey === todayKey ? 'today' : '',
            isSelected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              type="button"
              className={className}
              key={dateKey}
              onClick={() => onSelectDate(dateKey)}
              aria-label={`${dayLabel.format(day)}, ${dayEvents.length}개 게임`}
            >
              <span className="date-number">{day.getDate()}</span>
              <span className="event-count">{dayEvents.length > 0 ? dayEvents.length : ''}</span>
              <span className="day-events">
                {dayEvents.length > 0 ? (
                  <>
                    <strong>{dayEvents.length}개 입점</strong>
                    <span className="event-dots" aria-hidden="true">
                      {dayEvents.slice(0, 6).map((event) => (
                        <i key={event.id} />
                      ))}
                    </span>
                  </>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
      {selectedDate ? (
        <div className="selected-events">
          <h2>{dayLabel.format(new Date(`${selectedDate}T00:00:00`))}</h2>
          {(eventsByDate[selectedDate] ?? []).length > 0 ? (
            <div className="selected-event-list">
              {(eventsByDate[selectedDate] ?? []).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p>이 날짜에는 표시할 Game Pass 추가 일정이 없습니다.</p>
          )}
        </div>
      ) : null}
    </section>
  )
}
