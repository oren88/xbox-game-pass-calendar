import { CalendarDays, ExternalLink, Gamepad2, ImageOff, Play } from 'lucide-react'
import type { GamePassEvent } from '../types'
import { shortDateLabel } from '../utils/calendar'

type EventCardProps = {
  event: GamePassEvent
  compact?: boolean
}

const eventTypeLabels: Record<GamePassEvent['eventType'], string> = {
  'coming-soon': '예고',
  'available-today': '오늘 입점',
  missed: '놓친 입점',
}

export function EventCard({ event, compact = false }: EventCardProps) {
  const imageClassName =
    event.imageSource === 'store' || event.imageSource === 'store-search'
      ? 'event-image contain'
      : 'event-image'

  return (
    <article className={compact ? 'event-card compact' : 'event-card'}>
      <div className={imageClassName} aria-hidden="true">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="image-placeholder">
            <ImageOff size={24} />
            {event.isDayOne ? <small>공식 이미지 확인 중</small> : null}
          </span>
        )}
      </div>
      <div className="event-body">
        <div className="event-kicker">
          <span>
            <CalendarDays size={14} />
            {shortDateLabel.format(new Date(`${event.date}T00:00:00`))}
          </span>
          <strong className={`event-type ${event.eventType}`}>{eventTypeLabels[event.eventType]}</strong>
          {event.isSurprise ? <strong className="surprise-badge">깜짝</strong> : null}
          {event.isDayOne ? <strong>Day one</strong> : null}
        </div>
        <h3>{event.title}</h3>
        <p>{event.platforms.join(', ')}</p>
        <p className="plans">{event.plans.length > 0 ? event.plans.join(' / ') : 'Game Pass'}</p>
        {event.imageSource === 'article' ? (
          <p className="image-note">개별 이미지 대신 Xbox Wire 대표 이미지</p>
        ) : null}
        <div className="event-links">
          <a href={event.trailerUrl} target="_blank" rel="noreferrer">
            <Play size={14} />
            트레일러
          </a>
          <a href={event.playthroughUrl} target="_blank" rel="noreferrer">
            <Gamepad2 size={14} />
            플레이 영상
          </a>
          <a href={event.sourceUrl} target="_blank" rel="noreferrer">
            원문
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </article>
  )
}
