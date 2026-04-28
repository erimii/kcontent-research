// ============================================================
// Soompi RSS 크롤러 (FlixPatrol 대체)
// - flixpatrol.com은 sandbox IP를 차단함 → Soompi RSS로 교체
// - Soompi: 1998년부터 운영된 K-콘텐츠 전문 영문 미디어
// - API 키 불필요, 봇 차단 없음, 응답 빠름 (~0.5s)
// ============================================================

import type { FlixPatrolEntry } from '../types/index.js'

const SOOMPI_FEEDS = [
  { url: 'https://www.soompi.com/feed',                          label: 'Soompi 전체' },
  { url: 'https://www.soompi.com/category/dramas/feed',          label: 'Soompi 드라마' },
  { url: 'https://www.soompi.com/category/tv-film/feed',         label: 'Soompi TV/영화' },
]

const KOREABOO_FEED = 'https://www.koreaboo.com/feed/'

// 플랫폼 감지 키워드
const PLATFORM_MAP: { key: string; name: string }[] = [
  { key: 'netflix',   name: 'netflix' },
  { key: 'disney+',  name: 'disney' },
  { key: 'disney plus', name: 'disney' },
  { key: 'apple tv', name: 'apple' },
  { key: 'apple tv+', name: 'apple' },
  { key: 'hulu',     name: 'hulu' },
  { key: 'amazon',   name: 'amazon' },
  { key: 'prime video', name: 'amazon' },
  { key: 'wavve',    name: 'wavve' },
  { key: 'tving',    name: 'tving' },
  { key: 'coupang',  name: 'coupang' },
]

// 지역 감지 키워드
const REGION_MAP: { key: string; name: string }[] = [
  { key: 'korea',   name: 'Korea' },
  { key: 'korean',  name: 'Korea' },
  { key: 'japan',   name: 'Japan' },
  { key: 'us',      name: 'US' },
  { key: 'global',  name: 'Global' },
  { key: 'asia',    name: 'Asia' },
]

// 드라마 제목 추출 정규식 패턴
const DRAMA_TITLE_PATTERNS = [
  /"([^"]{3,60})"/g,                          // "드라마명"
  /\u201c([^\u201d]{3,60})\u201d/g,          // "드라마명" (유니코드)
  /\u2018([^\u2019]{3,60})\u2019/g,          // '드라마명' (유니코드)
  /drama\s+"([^"]{3,60})"/gi,
  /series\s+"([^"]{3,60})"/gi,
  /show\s+"([^"]{3,60})"/gi,
  /in\s+"([^"]{3,60})"/gi,
]

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function detectPlatform(text: string): string {
  const lower = text.toLowerCase()
  for (const { key, name } of PLATFORM_MAP) {
    if (lower.includes(key)) return name
  }
  return 'other'
}

function detectRegion(text: string): string {
  const lower = text.toLowerCase()
  for (const { key, name } of REGION_MAP) {
    if (lower.includes(key)) return name
  }
  return 'Global'
}

function extractDramaTitles(text: string): string[] {
  const titles = new Set<string>()
  for (const pattern of DRAMA_TITLE_PATTERNS) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(text)) !== null) {
      const t = m[1].trim()
      // 너무 짧거나 일반 단어는 제외
      if (t.length >= 3 && t.length <= 60 && !/^(the|a|an|and|or|in|on|at|to|for|of|with|this|that|it|is|was|are|were|be|been|by|from|as|has|had|have|will|would|could|should|may|might|must|shall|did|do|does|not|no|yes|so|but|if|then|when|where|who|what|how|why)$/i.test(t)) {
        titles.add(t)
      }
    }
  }
  return [...titles]
}

interface RssItem {
  title: string
  link: string
  pubDate: string
  description: string
  categories: string[]
  content: string
}

async function fetchRssFeed(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  const items: RssItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null

  while ((m = itemRegex.exec(text)) !== null) {
    const block = m[1]

    const title = decodeHtmlEntities(
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
    )
    const link = (
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ||
      block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1] || ''
    ).trim()
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || new Date().toISOString()
    const description = decodeHtmlEntities(
      block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ||
      block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || ''
    )
    const content = decodeHtmlEntities(
      block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)?.[1] || description
    )

    const catMatches = [...block.matchAll(/<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g)]
    const categories = catMatches.map(c => c[1].trim())

    if (title) {
      items.push({ title, link, pubDate, description, categories, content })
    }
  }

  return items
}

// ============================================================
// 메인 크롤링 함수 (FlixPatrol 타입 호환 유지)
// ============================================================
export async function crawlFlixPatrol(): Promise<FlixPatrolEntry[]> {
  const allEntries: FlixPatrolEntry[] = []
  const seenTitles = new Set<string>()
  let rank = 1

  // ── 1. Soompi RSS 피드 수집 ──────────────────────────────
  const feedResults = await Promise.allSettled(
    SOOMPI_FEEDS.map(f => fetchRssFeed(f.url))
  )

  const allItems: RssItem[] = []
  feedResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  [Soompi] ${SOOMPI_FEEDS[i].label}: ${r.value.length}개`)
      allItems.push(...r.value)
    } else {
      console.warn(`  [Soompi] ${SOOMPI_FEEDS[i].label} 실패:`, r.reason?.message)
    }
  })

  // ── 2. Koreaboo RSS 수집 ─────────────────────────────────
  try {
    const kbItems = await fetchRssFeed(KOREABOO_FEED)
    console.log(`  [Koreaboo] ${kbItems.length}개`)
    allItems.push(...kbItems)
  } catch (e) {
    console.warn(`  [Koreaboo] 실패:`, (e as Error).message)
  }

  // ── 3. 기사에서 드라마 제목 추출 → FlixPatrolEntry 변환 ──
  const titleMentions = new Map<string, {
    count: number
    platform: string
    region: string
    url: string
    pubDate: string
    isK: boolean
  }>()

  for (const item of allItems) {
    const fullText = `${item.title} ${item.description} ${item.content}`
    const platform = detectPlatform(fullText)
    const region   = detectRegion(fullText)
    const isK      = item.categories.some(c =>
      /drama|korean|k-pop|kdrama/i.test(c)
    ) || /korean|korea|k-drama|kdrama/i.test(fullText)

    // 기사 제목에서 드라마 제목 추출
    const dramaTitle = item.title
      .replace(/^(watch|review|preview|recap|interview|exclusive|video|photos?):\s*/i, '')
      .replace(/\s+(season \d+|episode \d+|ep\.\s*\d+).*$/i, '')
      .replace(/\s+(confirms?|reveals?|talks?|shares?|opens? up|addresses?|says?|explains?).*$/i, '')
      .trim()

    const titlesFromContent = extractDramaTitles(fullText)
    const candidates = [dramaTitle, ...titlesFromContent].filter(t => t.length >= 3)

    for (const t of candidates) {
      const key = t.toLowerCase()
      if (titleMentions.has(key)) {
        titleMentions.get(key)!.count++
      } else {
        titleMentions.set(key, {
          count: 1,
          platform,
          region,
          url: item.link,
          pubDate: item.pubDate,
          isK,
        })
      }
    }
  }

  // ── 4. 언급 횟수 기준 정렬 → FlixPatrolEntry 배열 생성 ──
  const sorted = [...titleMentions.entries()]
    .filter(([, v]) => v.count >= 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)

  for (const [title, info] of sorted) {
    // 제목 정규화: 첫 글자 대문자
    const displayTitle = title.charAt(0).toUpperCase() + title.slice(1)

    if (!seenTitles.has(title)) {
      seenTitles.add(title)
      allEntries.push({
        rank: rank++,
        title: displayTitle,
        platform: info.platform,
        region: info.region,
        points: info.count * 10,   // 언급 횟수 × 10 = points
        isKContent: info.isK,
        url: info.url,
      })
    }
  }

  console.log(`  [Soompi/Koreaboo] 총 ${allEntries.length}개 항목 수집 (K: ${allEntries.filter(e => e.isKContent).length}개)`)
  return allEntries
}
