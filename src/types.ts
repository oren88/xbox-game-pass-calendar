export type GamePassEvent = {
  id: string
  title: string
  date: string
  platforms: string[]
  plans: string[]
  isDayOne: boolean
  imageUrl: string | null
  imageSource: 'xbox-wire' | 'store' | 'store-search' | 'article' | 'override' | null
  storeUrl?: string
  trailerUrl: string
  playthroughUrl: string
  videoSource: 'youtube-search'
  sourceUrl: string
  sourceTitle: string
  sourcePublishedAt: string
}

export type PlatformFilter = 'all' | 'Cloud' | 'Console' | 'PC' | 'Handheld'
