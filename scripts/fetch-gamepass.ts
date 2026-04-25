import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as cheerio from 'cheerio'
import type { AnyNode } from 'domhandler'
import type { GamePassEvent } from '../src/types'

const CATEGORY_URL = 'https://news.xbox.com/en-us/xbox-game-pass/'
const OUTPUT_PATH = resolve('src/data/gamepass-events.json')
const IMAGE_OVERRIDES_PATH = resolve('src/data/image-overrides.json')
const ARTICLE_LIMIT = Number(process.env.ARTICLE_LIMIT ?? 8)
const START_DATE = process.env.START_DATE ?? `${new Date().getUTCFullYear()}-01-01`
const ARTICLE_END_DATE = process.env.ARTICLE_END_DATE ?? process.env.END_DATE ?? toIsoDate(new Date())
const EVENT_END_DATE =
  process.env.EVENT_END_DATE ?? process.env.END_DATE ?? toIsoDate(addDays(new Date(), 90))
const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
}
const MONTH_NAMES = Object.keys(MONTHS)
const KNOWN_WAVE_DAYS: Record<string, Record<number, number>> = {
  '2026-01': { 1: 6, 2: 20 },
  '2026-02': { 1: 3, 2: 17 },
  '2026-03': { 1: 3, 2: 17 },
  '2026-04': { 1: 7, 2: 20 },
}
const STOP_HEADINGS = [
  'leaving',
  'game updates',
  'in-game benefits',
  'game pass ultimate perks',
  'free play days',
]

type GamePassEventType = GamePassEvent['eventType']

type ParsedGamePassEvent = Omit<GamePassEvent, 'trailerUrl' | 'playthroughUrl' | 'videoSource'> & {
  articleImageUrl: string | null
  hasExplicitDate: boolean
}

type StoreSearchProduct = {
  title?: string
  pdpUri?: string
  image?: {
    uri?: string
  }
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'xbox-game-pass-calendar/0.1 (+local development)',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return response.text()
}

async function tryFetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'xbox-game-pass-calendar/0.1 (+local development)',
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status}`)
  }

  return response.text()
}

function normalizeText(text: string) {
  return text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function parsePublishedDate($: cheerio.CheerioAPI) {
  const candidates = [
    $('meta[property="article:published_time"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
    $('time').first().attr('datetime'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const parsed = new Date(candidate as string)
    if (!Number.isNaN(parsed.valueOf())) {
      return toIsoDate(parsed)
    }
  }

  const bodyDate = normalizeText($('body').text()).match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i,
  )
  if (bodyDate) {
    const parsed = new Date(bodyDate[0])
    if (!Number.isNaN(parsed.valueOf())) {
      return toIsoDate(parsed)
    }
  }

  return toIsoDate(new Date())
}

function parseMonthDate(value: string, fallbackYear: number) {
  const match = value.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i,
  )

  if (!match) {
    return null
  }

  const month = MONTHS[match[1].toLowerCase()]
  const correction = value.slice((match.index ?? 0) + match[0].length).match(/^\s+(\d{1,2})(?!,)/)
  const day = Number(correction?.[1] ?? match[2])
  const year = match[3] ? Number(match[3]) : fallbackYear

  if (month === undefined || !Number.isInteger(day) || !Number.isInteger(year)) {
    return null
  }

  return toIsoDate(new Date(Date.UTC(year, month, day)))
}

function splitList(value: string) {
  return value
    .replace(/\band\b/g, ',')
    .split(/[,/]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function extractPlans(text: string) {
  const plans = new Set<string>()
  const normalized = text.toLowerCase()

  if (normalized.includes('game pass ultimate')) {
    plans.add('Game Pass Ultimate')
  }
  if (normalized.includes('game pass premium') || /\bpremium\b/i.test(text)) {
    plans.add('Game Pass Premium')
  }
  if (normalized.includes('game pass essential') || /\bessential\b/i.test(text)) {
    plans.add('Game Pass Essential')
  }
  if (normalized.includes('game pass standard') || /\bstandard\b/i.test(text)) {
    plans.add('Game Pass Standard')
  }
  if (normalized.includes('pc game pass')) {
    plans.add('PC Game Pass')
  }
  if (normalized.includes('ea play')) {
    plans.add('EA Play')
  }

  return [...plans]
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function cleanTitle(value: string) {
  return normalizeText(value)
    .replace(/\s*[–—-]\s*$/, '')
    .replace(/^Image:\s*/i, '')
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(game preview|full game release|standard edition|premium edition|xbox series x\|s|xbox one|windows|pc)\b/g, ' ')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isContentImage(url: string) {
  return (
    !url.includes('uhf.microsoft.com') &&
    !url.includes('/favicon') &&
    !url.endsWith('.svg') &&
    /\.(avif|jpe?g|png|webp)(\?|$)/i.test(url)
  )
}

function formatStoreImageUrl(url: string) {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}q=90&w=640&h=360&mode=scale&format=jpg`
}

function imageFromElement($: cheerio.CheerioAPI, element: AnyNode, baseUrl: string) {
  let imageUrl: string | null = null

  $(element)
    .find('img')
    .each((_, img) => {
      const raw =
        $(img).attr('src') ??
        $(img).attr('data-src') ??
        $(img).attr('data-original') ??
        $(img).attr('srcset')?.split(',').at(-1)?.trim().split(/\s+/)[0]

      if (!raw) {
        return
      }

      const resolved = new URL(raw, baseUrl).toString()
      if (isContentImage(resolved)) {
        imageUrl = resolved
        return false
      }

      return undefined
    })

  return imageUrl
}

function imageFromMeta($: cheerio.CheerioAPI, baseUrl: string) {
  const raw =
    $('meta[property="og:image"]').attr('content') ??
    $('meta[name="twitter:image"]').attr('content') ??
    $('meta[property="twitter:image"]').attr('content') ??
    $('link[rel="image_src"]').attr('href')

  if (!raw) {
    return null
  }

  const resolved = new URL(raw, baseUrl).toString()
  return isContentImage(resolved) ? resolved : null
}

function productUrlFromElement($: cheerio.CheerioAPI, element: AnyNode, baseUrl: string) {
  let productUrl: string | null = null

  $(element)
    .find('a[href]')
    .each((_, link) => {
      const resolved = new URL($(link).attr('href') ?? '', baseUrl).toString()

      if (
        /^https:\/\/(www\.)?(xbox|microsoft)\.com\//i.test(resolved) ||
        /^https:\/\/apps\.microsoft\.com\//i.test(resolved)
      ) {
        productUrl = resolved
        return false
      }

      return undefined
    })

  return productUrl
}

async function fetchStoreImage(storeUrl: string) {
  try {
    const html = await tryFetchHtml(storeUrl)
    if (!html) {
      return null
    }

    const $ = cheerio.load(html)
    return imageFromMeta($, storeUrl) ?? imageFromElement($, $('body').get(0)!, storeUrl)
  } catch {
    return null
  }
}

function productMatchScore(query: string, candidate: string) {
  const normalizedQuery = normalizeForMatch(query)
  const normalizedCandidate = normalizeForMatch(candidate)

  if (!normalizedQuery || !normalizedCandidate) {
    return 0
  }

  if (normalizedCandidate === normalizedQuery) {
    return 1
  }

  if (
    normalizedCandidate === `${normalizedQuery} standard edition` ||
    normalizedCandidate === `${normalizedQuery} xbox one` ||
    normalizedCandidate === `${normalizedQuery} windows`
  ) {
    return 0.96
  }

  if (normalizedCandidate.startsWith(`${normalizedQuery} `)) {
    return 0.88
  }

  const queryTokens = new Set(normalizedQuery.split(' ').filter((token) => token.length > 1))
  const candidateTokens = new Set(normalizedCandidate.split(' ').filter((token) => token.length > 1))
  const overlap = [...queryTokens].filter((token) => candidateTokens.has(token)).length

  return overlap / Math.max(queryTokens.size, candidateTokens.size, 1)
}

function storeSearchQueries(title: string) {
  const stripped = title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^EA Sports\s+/i, '')
    .replace(/^EA SPORTS\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return [...new Set([title, stripped].filter(Boolean))]
}

function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

function videoLinksForTitle(title: string) {
  return {
    trailerUrl: youtubeSearchUrl(`${title} official trailer`),
    playthroughUrl: youtubeSearchUrl(`${title} gameplay walkthrough`),
    videoSource: 'youtube-search' as const,
  }
}

function extractStoreSearchProducts(html: string) {
  const marker = 'window.__Search__='
  const start = html.indexOf(marker)
  if (start === -1) {
    return []
  }

  const scriptEnd = html.indexOf('</script>', start)
  if (scriptEnd === -1) {
    return []
  }

  const payloadText = html
    .slice(start + marker.length, scriptEnd)
    .trim()
    .replace(/;$/, '')

  try {
    const payload = JSON.parse(payloadText) as {
      shopDepartmentProducts?: {
        cards?: {
          products?: StoreSearchProduct[]
        }
      }
    }

    return payload.shopDepartmentProducts?.cards?.products ?? []
  } catch {
    return []
  }
}

async function fetchStoreSearchMatch(title: string) {
  for (const query of storeSearchQueries(title)) {
    const searchUrl = `https://www.microsoft.com/en-us/search/shop/games?q=${encodeURIComponent(query)}`
    const html = await tryFetchHtml(searchUrl)
    if (!html) {
      continue
    }

    const products = extractStoreSearchProducts(html)
      .map((product) => ({
        product,
        score: product.title ? productMatchScore(query, product.title) : 0,
      }))
      .filter(({ product, score }) => score >= 0.82 && product.image?.uri)
      .sort((a, b) => b.score - a.score)

    const match = products[0]?.product
    if (match?.image?.uri) {
      return {
        imageUrl: formatStoreImageUrl(match.image.uri),
        storeUrl: match.pdpUri,
      }
    }
  }

  return null
}

async function loadImageOverrides() {
  try {
    return JSON.parse(await readFile(IMAGE_OVERRIDES_PATH, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

function extractArticleLinks(html: string) {
  const $ = cheerio.load(html)
  const urls = new Set<string>()

  $('a').each((_, element) => {
    const title = normalizeText($(element).text())
    const href = $(element).attr('href')

    if (!href) {
      return
    }

    if (/coming (to|soon to) xbox game pass/i.test(title)) {
      urls.add(new URL(href, CATEGORY_URL).toString())
    }
  })

  return [...urls].slice(0, ARTICLE_LIMIT)
}

function buildWaveArticleUrls(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  const urls: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))

  while (cursor <= end) {
    const year = cursor.getUTCFullYear()
    const monthIndex = cursor.getUTCMonth()
    const monthName = MONTH_NAMES[monthIndex]
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    const knownDays = KNOWN_WAVE_DAYS[monthKey]

    for (const wave of [1, 2]) {
      const candidateDays = knownDays?.[wave]
        ? [knownDays[wave]]
        : [1, 2, 3, 4, 5, 6, 7, 14, 15, 16, 17, 18, 19, 20]

      for (const day of candidateDays) {
        urls.push(
          `https://news.xbox.com/en-us/${year}/${String(monthIndex + 1).padStart(
            2,
            '0',
          )}/${String(day).padStart(2, '0')}/xbox-game-pass-${monthName}-${year}-wave-${wave}/`,
        )
      }
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return urls
}

function parseEntry(text: string, fallbackYear: number, defaultDate: string) {
  const withDate = text.match(
    /^(.+?)\s+\(([^)]+)\)\s*[–—-]\s*([^.!]+?)(?:[.!])?(?=\s*(?:Game Pass|Now with|Available|The full release|A year of updates)|\s{2,}|$)/,
  )
  const withoutDate = text.match(
    /^(.+?)\s+\(([^)]+)\)\s*(?=Game Pass|Now with|Available|The full release|A year of updates|$)/,
  )
  const entry = withDate ?? withoutDate

  if (!entry) {
    return null
  }

  const title = cleanTitle(entry[1])
  const platforms = splitList(entry[2])
  const parsedDate = withDate ? parseMonthDate(entry[3], fallbackYear) ?? defaultDate : defaultDate

  return {
    title,
    platforms,
    date: parsedDate,
    hasExplicitDate: Boolean(withDate),
  }
}

function eventTypeFromHeading(heading: string): GamePassEventType | null {
  const normalized = heading.toLowerCase()

  if (normalized.includes('available today')) {
    return 'available-today'
  }
  if (normalized.includes('coming soon')) {
    return 'coming-soon'
  }
  if (normalized.includes('in case you missed it')) {
    return 'missed'
  }

  return null
}

function inDateRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate
}

function shouldStopSection(heading: string) {
  const normalized = heading.toLowerCase()
  return STOP_HEADINGS.some((stopHeading) => normalized.includes(stopHeading))
}

function parseArticle(html: string, sourceUrl: string) {
  const $ = cheerio.load(html)
  const sourceTitle = normalizeText($('h1').first().text()) || 'Xbox Wire Game Pass update'
  const sourcePublishedAt = parsePublishedDate($)
  const fallbackYear = new Date(`${sourcePublishedAt}T00:00:00Z`).getUTCFullYear()
  const articleImageUrl = imageFromMeta($, sourceUrl) ?? imageFromElement($, $('main, article, body').get(0)!, sourceUrl)
  const events: ParsedGamePassEvent[] = []

  $('h2, h3').each((_, heading) => {
    const headingText = normalizeText($(heading).text())
    const eventType = eventTypeFromHeading(headingText)

    if (!eventType) {
      return
    }

    const defaultDate = sourcePublishedAt
    let pendingImage = imageFromElement($, heading, sourceUrl)
    let lastEvent: ParsedGamePassEvent | null = null

    $(heading)
      .nextUntil('h2, h3')
      .each((__, node) => {
        const nodeHeading = normalizeText($(node).text())

        if (/^h[2-3]$/i.test(node.type) && shouldStopSection(nodeHeading)) {
          return false
        }

        const nodeImage = imageFromElement($, node, sourceUrl)
        if (nodeImage) {
          if (lastEvent && !lastEvent.imageUrl) {
            lastEvent.imageUrl = nodeImage
            lastEvent.imageSource = 'xbox-wire'
          } else {
            pendingImage = nodeImage
          }
        }

        const text = normalizeText($(node).text())

        if (!text || shouldStopSection(text)) {
          return text ? false : undefined
        }

        const parsed = parseEntry(text, fallbackYear, defaultDate)
        if (parsed) {
          const plans = extractPlans(text)
          const isDayOne = /available day one|day one with xbox game pass/i.test(text)
          const event: ParsedGamePassEvent = {
            id: eventId(parsed.title, parsed.date),
            title: parsed.title,
            date: parsed.date,
            eventType,
            isSurprise: false,
            hasExplicitDate: parsed.hasExplicitDate,
            platforms: parsed.platforms,
            plans,
            isDayOne,
            imageUrl: pendingImage,
            imageSource: pendingImage ? 'xbox-wire' : null,
            storeUrl: productUrlFromElement($, node, sourceUrl) ?? undefined,
            sourceUrl,
            sourceTitle,
            sourcePublishedAt,
            articleImageUrl,
          }

          events.push(event)
          lastEvent = event
          pendingImage = null
          return undefined
        }

        if (lastEvent) {
          const plans = extractPlans(text)
          if (plans.length > 0) {
            lastEvent.plans = [...new Set([...lastEvent.plans, ...plans])]
          }
          if (/available day one|day one with xbox game pass/i.test(text)) {
            lastEvent.isDayOne = true
          }
        }

        return undefined
      })
  })

  return events
}

function eventId(title: string, date: string) {
  return `${slugify(title)}-${date}`
}

function eventMatchKey(event: Pick<ParsedGamePassEvent, 'title' | 'date'>) {
  return `${normalizeForMatch(event.title)}|${event.date}`
}

function normalizeImplicitMissedDates(events: ParsedGamePassEvent[]) {
  return events.map((event) => {
    if (event.eventType !== 'missed' || event.hasExplicitDate) {
      return event
    }

    const priorEvent = events
      .filter(
        (candidate) =>
          candidate !== event &&
          normalizeForMatch(candidate.title) === normalizeForMatch(event.title) &&
          candidate.eventType !== 'missed' &&
          candidate.date <= event.sourcePublishedAt &&
          candidate.sourcePublishedAt <= event.sourcePublishedAt,
      )
      .sort((a, b) => b.date.localeCompare(a.date))[0]

    if (!priorEvent) {
      return event
    }

    return {
      ...event,
      date: priorEvent.date,
      id: eventId(event.title, priorEvent.date),
    }
  })
}

function markSurpriseEvents(events: ParsedGamePassEvent[]) {
  const comingSoonAnnouncements = new Map<string, string[]>()

  for (const event of events) {
    if (event.eventType !== 'coming-soon') {
      continue
    }

    const key = eventMatchKey(event)
    const dates = comingSoonAnnouncements.get(key) ?? []
    dates.push(event.sourcePublishedAt)
    comingSoonAnnouncements.set(key, dates)
  }

  return events.map((event) => {
    if (event.eventType === 'coming-soon') {
      return event
    }

    const previousAnnouncements = comingSoonAnnouncements.get(eventMatchKey(event)) ?? []
    const wasPreviouslyAnnounced = previousAnnouncements.some(
      (publishedAt) => publishedAt < event.sourcePublishedAt,
    )

    return {
      ...event,
      isSurprise: !wasPreviouslyAnnounced,
    }
  })
}

function mergeUnique<T>(left: T[], right: T[]) {
  return [...new Set([...left, ...right])]
}

function shouldReplaceDuplicate(existing: ParsedGamePassEvent, incoming: ParsedGamePassEvent) {
  if (incoming.isSurprise !== existing.isSurprise) {
    return incoming.isSurprise
  }

  if (existing.eventType === 'coming-soon' && incoming.eventType !== 'coming-soon') {
    return false
  }

  if (incoming.eventType === 'available-today' && existing.eventType === 'missed') {
    return true
  }

  return incoming.sourcePublishedAt > existing.sourcePublishedAt
}

function dedupeEvents(events: ParsedGamePassEvent[]) {
  const byId = new Map<string, ParsedGamePassEvent>()

  for (const event of events) {
    const existing = byId.get(event.id)

    if (!existing) {
      byId.set(event.id, event)
      continue
    }

    const preferred = shouldReplaceDuplicate(existing, event) ? event : existing
    const fallback = preferred === event ? existing : event

    byId.set(event.id, {
      ...preferred,
      platforms: mergeUnique(preferred.platforms, fallback.platforms),
      plans: mergeUnique(preferred.plans, fallback.plans),
      isDayOne: preferred.isDayOne || fallback.isDayOne,
      isSurprise: preferred.isSurprise || fallback.isSurprise,
      imageUrl: preferred.imageUrl ?? fallback.imageUrl,
      imageSource: preferred.imageSource ?? fallback.imageSource,
      storeUrl: preferred.storeUrl ?? fallback.storeUrl,
      articleImageUrl: preferred.articleImageUrl ?? fallback.articleImageUrl,
      hasExplicitDate: preferred.hasExplicitDate || fallback.hasExplicitDate,
    })
  }

  return [...byId.values()].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date)
    return dateOrder === 0 ? a.title.localeCompare(b.title) : dateOrder
  })
}

async function applyImageFallbacks(events: ParsedGamePassEvent[]) {
  const overrides = await loadImageOverrides()

  for (const event of events) {
    const override = overrides[event.id] ?? overrides[event.title]
    if (override) {
      event.imageUrl = override
      event.imageSource = 'override'
      continue
    }

    if (!event.imageUrl && event.storeUrl) {
      const storeImage = await fetchStoreImage(event.storeUrl)
      if (storeImage) {
        event.imageUrl = storeImage
        event.imageSource = 'store'
      }
    }

    if (!event.imageUrl) {
      const storeSearchMatch = await fetchStoreSearchMatch(event.title)
      if (storeSearchMatch) {
        event.imageUrl = storeSearchMatch.imageUrl
        event.imageSource = 'store-search'
        event.storeUrl = event.storeUrl ?? storeSearchMatch.storeUrl
      }
    }

    if (!event.imageUrl && event.isDayOne && event.articleImageUrl) {
      event.imageUrl = event.articleImageUrl
      event.imageSource = 'article'
    }
  }

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    eventType: event.eventType,
    isSurprise: event.isSurprise,
    platforms: event.platforms,
    plans: event.plans,
    isDayOne: event.isDayOne,
    imageUrl: event.imageUrl,
    imageSource: event.imageSource,
    ...(event.storeUrl ? { storeUrl: event.storeUrl } : {}),
    ...videoLinksForTitle(event.title),
    sourceUrl: event.sourceUrl,
    sourceTitle: event.sourceTitle,
    sourcePublishedAt: event.sourcePublishedAt,
  }))
}

async function main() {
  let categoryLinks: string[] = []
  try {
    const categoryHtml = await fetchHtml(CATEGORY_URL)
    categoryLinks = extractArticleLinks(categoryHtml)
  } catch (error) {
    console.warn(
      `Skipping category discovery: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const articleUrls = [
    ...new Set([
      ...buildWaveArticleUrls(START_DATE, ARTICLE_END_DATE),
      ...categoryLinks,
    ]),
  ]

  if (articleUrls.length === 0) {
    throw new Error('No Xbox Wire Game Pass update articles were found.')
  }

  const eventGroups = await Promise.all(
    articleUrls.map(async (url) => {
      const html = await tryFetchHtml(url)
      return html ? parseArticle(html, url) : []
    }),
  )
  const parsedEvents = dedupeEvents(
    markSurpriseEvents(normalizeImplicitMissedDates(eventGroups.flat())),
  ).filter((event) => inDateRange(event.date, START_DATE, EVENT_END_DATE))
  const events = await applyImageFallbacks(parsedEvents)

  if (events.length === 0) {
    throw new Error('No Game Pass events were parsed from Xbox Wire articles.')
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(events, null, 2)}\n`)
  console.log(
    `Wrote ${events.length} events between ${START_DATE} and ${EVENT_END_DATE} from ${articleUrls.length} candidate Xbox Wire articles through ${ARTICLE_END_DATE}.`,
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
