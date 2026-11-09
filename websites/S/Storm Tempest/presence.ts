import { ActivityType, getTimestamps } from 'premid'

const presence = new Presence({
  clientId: '1233213267053248633',
})

const STORM_TEMPEST_IMAGE = 'https://cdn.rcd.gg/PreMiD/websites/S/Storm%20Tempest/assets/logo.png'

const browsingTimestamp = Math.floor(Date.now() / 1000)

interface WatchState {
  title: string
  source?: string
  episode?: string
  url: string
  video?: HTMLVideoElement
}

interface PageState {
  name: string
  url: string
}

/**
 * Collapse whitespace and trim a string.
 *
 * @param value Raw text, possibly null or undefined.
 * @returns The normalized text, or `undefined` when empty.
 */
function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()

  return normalized || undefined
}

/**
 * Read the normalized text content of an element.
 *
 * @param element Element to read, or null.
 * @returns The cleaned text, or `undefined` when missing or empty.
 */
function textOf(element: Element | null): string | undefined {
  return clean(element?.textContent)
}

/**
 * Read the normalized value of an element attribute.
 *
 * @param element Element to read, or null.
 * @param attribute Attribute name.
 * @returns The cleaned value, or `undefined` when missing or empty.
 */
function attrOf(
  element: Element | null,
  attribute: string,
): string | undefined {
  return clean(element?.getAttribute(attribute))
}

/**
 * Return the text of the first selector that matches a non-empty element.
 *
 * @param selectors CSS selectors tried in order.
 * @returns The first non-empty text, or `undefined`.
 */
function queryText(selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const value = textOf(document.querySelector(selector))

    if (value) {
      return value
    }
  }

  return undefined
}

/**
 * Return an attribute from the first selector that yields a non-empty value.
 *
 * @param selectors CSS selectors tried in order.
 * @param attribute Attribute name to read.
 * @returns The first non-empty value, or `undefined`.
 */
function queryAttr(
  selectors: string[],
  attribute: string,
): string | undefined {
  for (const selector of selectors) {
    const value = attrOf(document.querySelector(selector), attribute)

    if (value) {
      return value
    }
  }

  return undefined
}

/**
 * Check whether an element is rendered and has a non-zero size.
 *
 * @param element Element to test.
 * @returns `true` when the element is visible on the page.
 */
function isVisible(element: Element): boolean {
  const node = element as HTMLElement
  const style = window.getComputedStyle(node)
  const rect = node.getBoundingClientRect()

  return (
    style.display !== 'none'
    && style.visibility !== 'hidden'
    && rect.width > 0
    && rect.height > 0
  )
}

/**
 * Detect the active source/server from a visibly selected control in the player UI.
 *
 * @returns The selected source name, or `undefined` when none is found.
 */
function sourceFromSelectedControl(): string | undefined {
  const selectors = [
    '[aria-pressed="true"]',
    '[aria-selected="true"]',
    '[aria-checked="true"]',
    '[data-state="active"]',
    '[data-state="selected"]',
    '[data-selected="true"]',
    '.active',
    '.selected',
    '.current',
    '.chosen',
  ]

  const elements = Array.from(
    document.querySelectorAll(selectors.join(',')),
  ).filter(isVisible)

  for (const element of elements) {
    const value = textOf(element)

    if (!value || value.length > 60) {
      continue
    }

    if (
      /^(?:watch|play|next|previous|episode|episodes|server|source|provider|stream|player|dub|sub|quality|auto|default)$/i.test(
        value,
      )
    ) {
      continue
    }

    const parentText = clean(element.parentElement?.textContent) ?? ''

    if (/server|source|provider|stream|player/i.test(parentText)) {
      return value
    }
  }

  return undefined
}

/**
 * Infer the source (Anisto, Mangasto, ...) from the URL path or query string.
 *
 * @returns The source name, or `undefined` when none is recognized.
 */
function sourceFromUrl(): string | undefined {
  const sources: Record<string, string> = {
    anisto: 'Anisto',
    mangasto: 'Mangasto',
    movisto: 'Movisto',
    booksto: 'Booksto',
    novelsto: 'Novelsto',
    codesto: 'Codesto',
    tvsto: 'Tvsto',
    toolsto: 'Toolsto',
    gamesto: 'Gamesto',
    studysto: 'Studysto',
  }

  for (const part of document.location.pathname.split('/').filter(Boolean)) {
    const source = sources[part.toLowerCase()]

    if (source) {
      return source
    }
  }

  const params = new URLSearchParams(document.location.search)

  for (const key of ['source', 'server', 'provider']) {
    const value = clean(params.get(key))

    if (value) {
      return value
    }
  }

  return undefined
}

/**
 * Extract an episode number from a string such as `S1E5`, `Episode 5` or `#5`.
 *
 * @param value Text to search.
 * @returns The episode number as a string, or `undefined`.
 */
function extractEpisode(value: string | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const patterns = [
    /\bS\d{1,2}\s*E(\d{1,4})\b/i,
    /\bEpisode\s*(\d{1,4})\b/i,
    /\bEp\.?\s*(\d{1,4})\b/i,
    /(?:^|\s)#(\d{1,4})(?:\s|$)/,
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return undefined
}

/**
 * Find the current episode number from the URL, page title or DOM.
 *
 * @returns The episode number, or `undefined` when unknown.
 */
function getEpisode(): string | undefined {
  const candidates = [
    document.location.pathname,
    document.location.search,
    document.title,
    queryText([
      '[data-episode]',
      '[class*="episode"]',
      '[id*="episode"]',
      '[aria-label*="Episode" i]',
    ]),
    queryAttr(['[data-episode]'], 'data-episode'),
  ]

  for (const candidate of candidates) {
    const episode = extractEpisode(candidate)

    if (episode) {
      return episode
    }
  }

  return undefined
}

/**
 * Remove a trailing episode suffix (e.g. `- Episode 5`) from a title.
 *
 * @param value Title text.
 * @returns The title without the episode suffix.
 */
function stripEpisode(value: string): string {
  return value
    .replace(
      /\s*[-|•·]\s*(?:Episode|Ep\.?)\s*\d{1,4}\s*$/i,
      '',
    )
    .trim()
}

/**
 * Resolve the title of the anime being watched from meta tags, headings or the document title.
 *
 * @returns The title, or `undefined` when only generic site names are found.
 */
function getAnimeTitle(): string | undefined {
  const candidates = [
    queryAttr(
      [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ],
      'content',
    ),
    queryText([
      'main h1',
      'article h1',
      '[data-anime-title]',
      '[class*="anime-title"]',
      '[class*="show-title"]',
      '[class*="series-title"]',
    ]),
    document.title,
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const title = clean(stripEpisode(candidate))

    if (
      title
      && !/^(?:storm|stormd|storm tempest|anisto|mangasto|movisto|anime|watch anime)$/i.test(
        title,
      )
    ) {
      return title
    }
  }

  return undefined
}

/**
 * Find the active (loaded and not ended) video element on the page.
 *
 * @returns The video element, or `undefined`.
 */
function getVideo(): HTMLVideoElement | undefined {
  return Array.from(
    document.querySelectorAll<HTMLVideoElement>('video'),
  ).find(video => !video.ended && video.readyState > 0)
}

/**
 * Decide whether the current page is a watch/player page.
 *
 * @returns `true` when the URL or DOM indicates playback.
 */
function isWatchPage(): boolean {
  const path = document.location.pathname.toLowerCase().replace(/\/+$/, '')
  const knownRoute
    = /^\/(?:movisto|tvsto|anisto)\/watch$/.test(path)
      || path === '/watch'
      || path === '/anime'

  if (knownRoute) {
    return true
  }

  const video = getVideo()

  if (!video || !isVisible(video)) {
    return false
  }

  const rect = video.getBoundingClientRect()

  return rect.width >= 320 && rect.height >= 180
}

/**
 * Collect everything needed to describe the current watch session.
 *
 * @returns The title, source, episode, URL and video element.
 */
function getWatchState(): WatchState {
  return {
    title: getAnimeTitle() ?? 'Unknown Anime',
    source: sourceFromSelectedControl() ?? sourceFromUrl(),
    episode: getEpisode(),
    url: document.location.href,
    video: getVideo(),
  }
}

/**
 * Map the current path to a friendly section name (Anime, Manga, Movies, ...).
 *
 * @returns The page name, falling back to `Storm Tempest`.
 */
function getPageName(): string {
  const pathname = document.location.pathname
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) {
    return 'Home'
  }

  const firstSegment = segments[0]

  if (!firstSegment) {
    return 'Home'
  }

  const pageNames: Record<string, string> = {
    anisto: 'Anime',
    mangasto: 'Manga',
    movisto: 'Movies',
    novelsto: 'Novels',
    booksto: 'Books',
    tvsto: 'Live TV',
    gamesto: 'Games',
    codesto: 'Code Tools',
    toolsto: 'Tools',
    studysto: 'Study',
  }

  const pageName = pageNames[firstSegment.toLowerCase()]

  if (pageName) {
    return pageName
  }

  const title = clean(document.title)

  if (
    title
    && !/^(?:storm|stormd|storm tempest)$/i.test(title)
  ) {
    return stripEpisode(title)
  }

  return 'Storm Tempest'
}

/**
 * Collect the name and URL of the page being browsed.
 *
 * @returns The current page state.
 */
function getPageState(): PageState {
  return {
    name: getPageName(),
    url: document.location.href,
  }
}

/**
 * Compute Discord start/end timestamps from the video playback position.
 *
 * @param video Active video element, if any.
 * @returns Timestamps while playing; an empty object when paused, ended or invalid.
 */
function getPlaybackTimestamps(
  video: HTMLVideoElement | undefined,
): {
  startTimestamp?: number
  endTimestamp?: number
} {
  if (
    !video
    || video.paused
    || video.ended
    || !Number.isFinite(video.duration)
    || video.duration <= 0
    || !Number.isFinite(video.currentTime)
  ) {
    return {}
  }

  const [startTimestamp, endTimestamp] = getTimestamps(
    Math.floor(video.currentTime),
    Math.floor(video.duration),
  )

  return {
    startTimestamp,
    endTimestamp,
  }
}

/**
 * Build the presence payload shown while watching.
 *
 * @param watch Current watch state.
 * @returns Presence data for the watching activity.
 */
function buildWatchActivity(watch: WatchState): PresenceData {
  const source = watch.source ?? 'Unknown Source'
  const episode = watch.episode
    ? `Episode ${watch.episode}`
    : 'Episode ?'

  return {
    type: ActivityType.Watching,
    details: 'Watching Storm Tempest',
    state: `${source}\n${watch.title} - ${episode}`,
    largeImageKey: STORM_TEMPEST_IMAGE,
    buttons: [
      {
        label: 'Open Storm Tempest',
        url: watch.url,
      },
    ],
    ...getPlaybackTimestamps(watch.video),
  }
}

/**
 * Build the presence payload shown while browsing.
 *
 * @param page Current page state.
 * @returns Presence data for the browsing activity.
 */
function buildPageActivity(page: PageState): PresenceData {
  return {
    type: ActivityType.Watching,
    details: `Browsing ${page.name}`,
    state: 'Storm Tempest',
    largeImageKey: STORM_TEMPEST_IMAGE,
    startTimestamp: browsingTimestamp,
    buttons: [
      {
        label: 'Storm Tempest',
        url: page.url,
      },
    ],
  }
}

/**
 * Refresh the Discord activity: the watch view on player pages, the browsing view elsewhere.
 */
presence.on('UpdateData', async () => {
  if (isWatchPage()) {
    presence.setActivity(
      buildWatchActivity(getWatchState()),
    )

    return
  }

  presence.setActivity(
    buildPageActivity(getPageState()),
  )
})