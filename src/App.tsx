import { useMemo, useState } from 'react'
import './App.css'
import { CalendarView } from './components/CalendarView'
import { EventCard } from './components/EventCard'
import { FilterBar } from './components/FilterBar'
import { MonthControls } from './components/MonthControls'
import rawEvents from './data/gamepass-events.json'
import type { GamePassEvent, PlatformFilter } from './types'
import { sortEvents } from './utils/calendar'

function App() {
  const events = rawEvents as GamePassEvent[]
  const orderedEvents = useMemo(() => sortEvents(events), [events])
  const firstVisibleEvent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return orderedEvents.find((event) => event.date >= today) ?? orderedEvents.at(-1)
  }, [orderedEvents])
  const initialDate = firstVisibleEvent ? new Date(`${firstVisibleEvent.date}T00:00:00`) : new Date()
  const [monthDate, setMonthDate] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(firstVisibleEvent?.date ?? null)
  const [platform, setPlatform] = useState<PlatformFilter>('all')
  const [dayOneOnly, setDayOneOnly] = useState(false)

  const filteredEvents = useMemo(() => {
    return orderedEvents.filter((event) => {
      const platformMatch =
        platform === 'all' ||
        event.platforms.some((item) => {
          if (platform === 'Console') {
            return /console|xbox/i.test(item)
          }

          return item.toLowerCase().includes(platform.toLowerCase())
        })
      const dayOneMatch = !dayOneOnly || event.isDayOne

      return platformMatch && dayOneMatch
    })
  }, [dayOneOnly, orderedEvents, platform])

  const upcomingEvents = filteredEvents
    .filter((event) => event.date >= new Date().toISOString().slice(0, 10))
    .slice(0, 4)
  const panelEvents =
    upcomingEvents.length > 0 ? upcomingEvents : [...filteredEvents].reverse().slice(0, 4)
  const panelLabel = upcomingEvents.length > 0 ? '다가오는 일정' : '최근 입점'

  const changeMonth = (offset: number) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1))
  }

  const goToday = () => {
    const today = new Date()
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today.toISOString().slice(0, 10))
  }

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow">Xbox Wire 기반 로컬 데이터</p>
          <h1>Game Pass 입점 달력</h1>
        </div>
        <p>
          Xbox Wire의 공식 “Coming to Xbox Game Pass” 글에서 추가 예정 게임만 모아
          월간 달력으로 보여줍니다.
        </p>
      </header>

      <section className="toolbar">
        <MonthControls
          monthDate={monthDate}
          onPrevious={() => changeMonth(-1)}
          onNext={() => changeMonth(1)}
          onToday={goToday}
        />
        <FilterBar
          platform={platform}
          dayOneOnly={dayOneOnly}
          onPlatformChange={setPlatform}
          onDayOneOnlyChange={setDayOneOnly}
        />
      </section>

      <div className="content-grid">
        <CalendarView
          monthDate={monthDate}
          events={filteredEvents}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
        <aside className="upcoming-panel" aria-label="Game Pass 게임 요약">
          <div className="panel-heading">
            <p className="eyebrow">{panelLabel}</p>
            <h2>{panelEvents.length}개 표시 중</h2>
          </div>
          <div className="upcoming-list">
            {panelEvents.length > 0 ? (
              panelEvents.map((event) => <EventCard key={event.id} event={event} compact />)
            ) : (
              <p className="empty-state">현재 필터에 맞는 입점 게임이 없습니다.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}

export default App
