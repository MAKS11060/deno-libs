import {DOMParser, Element} from 'jsr:@b-fuze/deno-dom'
import {CustomFetch} from '../../web/types.ts'
import {parseDateString} from '../utils.ts'

type FetchOptions = CustomFetch & {
  skipOriginCheck?: boolean
  headers?: HeadersInit
}

export const origin = ['https://hdrezka.me', 'https://hdrezka.ag']

export const MediaType = ['films', 'series', 'animation', 'cartoons'] as const

export type HdrezkaMediaType = (typeof MediaType)[number]

export const isValidUrl = (url: string | URL): boolean => {
  try {
    const parsedUrl = new URL(url)
    return origin.includes(parsedUrl.origin)
  } catch (error) {
    console.error('Invalid URL:', error)
    return false
  }
}

export const parseContentPage = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'text/html')
  const contentMain = doc.body.querySelector('.b-content__main')

  const title = contentMain?.querySelector('.b-post__title')?.textContent.trim()
  const titleOrig = contentMain?.querySelector('.b-post__origtitle')?.textContent.trim()

  // poster
  const postInfoTableLeft = contentMain?.querySelector('.b-post__infotable_left')
  const posterLg = postInfoTableLeft?.querySelector('a')?.getAttribute('href')
  const posterSm = postInfoTableLeft?.querySelector('img')?.getAttribute('src')

  // info
  const postInfo = contentMain?.querySelector('.b-post__info')!

  // table rows
  const postEntries = Array.from(postInfo.querySelectorAll('tbody > tr'), (e) => [
    e.querySelector('h2')?.textContent,
    e,
  ])
  const post = Object.fromEntries(postEntries) as Record<string, Element>

  // score
  const scoreEntries = Array.from(post['Рейтинги'].querySelectorAll('.b-post__info_rates'), (e) => {
    return [
      e.querySelector('a')?.textContent!,
      {
        score: parseFloat(e.querySelector('span')?.textContent!),
        count: parseInt(e.querySelector('i')?.textContent?.match(/\d+/g)?.join('') || '0'),
      },
    ]
  })

  // slogan
  const slogan = post['Слоган']?.querySelector('td:nth-child(2)')?.textContent || null

  // release date
  const releaseDate = parseDateString(post['Дата выхода']?.querySelector('td:nth-child(2)')?.textContent)

  // country
  const country = post['Страна']?.querySelector('td:nth-child(2)')?.textContent || null

  // genres
  const genreStr = post['Жанр']?.querySelector('td:nth-child(2)')?.textContent || ''
  const genres = genreStr?.split(',').map((v) => v.trim())

  // dubs
  const dubsStr = post['В переводе']?.querySelector('td:nth-child(2)')?.textContent
  const dubs = dubsStr?.split(',').map((v) => v.trim()) || []

  // duration in min
  const durationStr = post['Время']?.querySelector('td:nth-child(2)')?.textContent || ''
  const duration = parseInt(durationStr.split(' ', 1).join(''))

  // post['Режиссер']?.textContent || null
  // post['Возраст']?.textContent || null
  // post['Из серии']?.textContent || null
  // post['В ролях актеры']?.textContent || null
  // console.log(post)

  // description
  const description = contentMain?.querySelector('.b-post__description_text')?.textContent?.trim() || null

  // local rating
  const ratingEl = contentMain?.querySelector('.b-post__rating')
  const votes = ratingEl?.querySelector('.votes > span')?.textContent || null
  const num = ratingEl?.querySelector('.num')?.textContent || null
  if (votes && num) scoreEntries.push(['hdrezka', {score: +num, count: +votes}])

  // related content
  const related = Array.from(contentMain?.querySelectorAll('.b-post__partcontent_item:not(.current)')!, (e) => {
    return {
      title: e.querySelector('.title')?.textContent,
      href: e.getAttribute('data-url'),
    }
  })

  // episodes
  const episodesTable = contentMain?.querySelectorAll('.b-post__schedule .b-post__schedule_table tbody tr') || []
  const episodes = Array.from(episodesTable, (e) => {
    // console.log(e.textContent)
    // const [season, , episode] = ().split(' ', 4)!
    const season_episode = e.querySelector('.td-1')?.textContent.split(' ', 4) || []
    const title = e.querySelector('.td-2 b')?.textContent || null
    const titleAlt = e.querySelector('.td-2 span')?.textContent || null
    const airDate = e.querySelector('.td-4')?.textContent

    return {
      season: parseInt(season_episode[0]),
      episodes: parseInt(season_episode[2]),
      airDate: parseDateString(airDate),
      title,
      titleAlt,
    }
  }).filter((v) => v.season)

  return {
    title,
    titleOrig,
    poster: {lg: posterLg, md: posterSm},
    score: Object.fromEntries(scoreEntries),
    slogan,
    releaseDate,
    country,
    genres,
    dubs,
    duration,
    description,
    related,
    episodes,
  }
}

export const parseSearchPage = (text: string) => {
  const doc = new DOMParser().parseFromString(text, 'text/html')

  return Array.from(doc.querySelectorAll('li'), (e) => {
    const title = e.querySelector('.enty')
    const titleOrig = title?.nextSibling?.textContent.trim()
    return {
      title: title?.textContent,
      titleOrig,
      href: e.querySelector('a')?.getAttribute('href'),
    }
  })
}

/**
 * @example
 * ```ts
 * const fetch = await createCachedFetch({
 *   name: 'hdrezka',
 *   ttl: 60 * 60 * 24 * 30,
 *   log: true,
 * })
 *
 * const uri = 'https://hdrezka.me/films/adventures/1171-nazad-v-buduschee-1985.html'
 * const data = await getContentPage(uri, {fetch})
 * console.log(data)
 * ```
 */
export const getContentPage = async (uri: string, options?: FetchOptions) => {
  if (!options?.skipOriginCheck && !isValidUrl(uri)) throw new Error('Invalid URI Origin')

  try {
    const type = new URL(uri).pathname
      .split('/', 2)
      .filter((v) => v)[0]
      .toLowerCase() as HdrezkaMediaType

    if (!MediaType.includes(type)) {
      throw new Error(`Unknown media type: '${type}'`)
    }

    const _fetch = options?.fetch ?? fetch
    const response = await _fetch(uri, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0',
        ...options?.headers,
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: ${response.statusText}`)
    }

    const text = await response.text()
    return {type, ...parseContentPage(text)}
  } catch (error) {
    console.error('Error parsing page:', error)
    throw error
  }
}

export const search = async (
  query: string,
  options?: CustomFetch & {
    /**
     * @default hdrezka.me
     * - hdrezka.ag
     */
    host?: string
    skipOriginCheck?: boolean
  }
) => {
  const body = new FormData()
  body.set('q', query)

  const uri = new URL('https://hdrezka.me/engine/ajax/search.php')
  if (options?.host) uri.host = options.host
  if (!options?.skipOriginCheck && isValidUrl(uri)) throw new Error('Invalid URI Origin')

  try {
    const _fetch = options?.fetch ?? fetch
    const response = await _fetch(uri, {method: 'POST', body})
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: ${response.statusText}`)
    }

    const text = await response.text()
    return parseSearchPage(text)
  } catch (error) {
    console.error('Error parsing page:', error)
    throw error
  }
}

enum SearchGenre {
  films = 1,
  series = 2,
  cartoons = 3,
  anime = 82,
}

type SearchPageFilter =
  | {
      type: 'films' | 'series' | 'cartoons' | 'anime'
      filter?: 'last' | 'popular' | 'soon' | 'watching'
    }
  | {
      type: 'new'
      filter?: 'last' | 'popular' | 'watching'
      genre?: SearchGenre //'1' | '2' | '3' | '82'
    }
  | {
      type: 'announce'
    }

type SearchPageOptions = CustomFetch &
  SearchPageFilter & {
    /** @default 1 */
    page?: number
  }

export const searchPage = async (options: SearchPageOptions) => {
  const uri = new URL(`/${options.type}/page/${options.page ?? 1}/`, 'https://hdrezka.me')
  if (
    options.type === 'films' ||
    options.type === 'series' ||
    options.type === 'cartoons' ||
    options.type === 'anime'
  ) {
    if (options.filter) uri.searchParams.set('filter', options.filter)
  }
  if (options.type === 'new') {
    if (options.filter) uri.searchParams.set('filter', options.filter)
    if (options.genre) uri.searchParams.set('genre', SearchGenre[options.genre])
  }

  try {
    const _fetch = options?.fetch ?? fetch
    const response = await _fetch(uri)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${uri}: ${response.statusText}`)
    }

    const text = await response.text()
    const doc = new DOMParser().parseFromString(text, 'text/html')

    const itemsEl = doc.querySelector('.b-content__inline_items')
    const items = Array.from(itemsEl?.querySelectorAll('.b-content__inline_item') ?? [], (el) => {
      const id = el.getAttribute('data-id')
      const url = el.getAttribute('data-url')

      const img = el.querySelector('.b-content__inline_item-cover img')?.getAttribute('src') ?? null

      const title = el.querySelector('.b-content__inline_item-link a')?.textContent
      const linkText = el.querySelector('.b-content__inline_item-link div')?.textContent

      const [yearRange, ...tags] = linkText?.split(',').map((v) => v.trim()) ?? []
      const [yearStart, yearEnd = null] = yearRange.split('-').map((v) => (isNaN(parseInt(v)) ? null : parseInt(v)))

      return {
        id,
        title,
        tags,
        yearStart,
        yearEnd,
        img,
        url,
      }
    })

    return items
  } catch (error) {
    console.error('Error parsing page:', error)
    throw error
  }
}
