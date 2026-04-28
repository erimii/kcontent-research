// ============================================================
// Soompi RSS 크롤러 (FlixPatrol 대체)
// - flixpatrol.com은 sandbox IP를 차단함 → Soompi RSS로 교체
// - Soompi: 1998년부터 운영된 K-콘텐츠 전문 영문 미디어
// - API 키 불필요, 봇 차단 없음, 응답 빠름 (~0.5s)
// ============================================================

import type { FlixPatrolEntry } from '../types/index.js'
import { isKorean } from '../pipeline/korean-filter.js'

const SOOMPI_FEEDS = [
  { url: 'https://www.soompi.com/feed', label: 'Soompi 전체' },
]

const KOREABOO_FEED = 'https://www.koreaboo.com/feed/'

// 플랫폼 감지 키워드
const PLATFORM_MAP: { key: string; name: string }[] = [
  { key: 'netflix',      name: 'netflix' },
  { key: 'disney+',     name: 'disney' },
  { key: 'disney plus', name: 'disney' },
  { key: 'apple tv',    name: 'apple' },
  { key: 'apple tv+',   name: 'apple' },
  { key: 'hulu',        name: 'hulu' },
  { key: 'amazon',      name: 'amazon' },
  { key: 'prime video', name: 'amazon' },
  { key: 'wavve',       name: 'wavve' },
  { key: 'tving',       name: 'tving' },
  { key: 'coupang',     name: 'coupang' },
]

// 지역 감지 키워드
const REGION_MAP: { key: string; name: string }[] = [
  { key: 'korea',  name: 'Korea' },
  { key: 'korean', name: 'Korea' },
  { key: 'japan',  name: 'Japan' },
  { key: 'us',     name: 'US' },
  { key: 'global', name: 'Global' },
  { key: 'asia',   name: 'Asia' },
]

// 따옴표 안 드라마/영화 제목 추출 패턴
const DRAMA_TITLE_PATTERNS = [
  /\u201c([^\u201d]{2,60})\u201d/g,   // "드라마명" (유니코드 곡선 큰따옴표) ← Soompi 주로 사용
  /\u2018([^\u2019]{2,60})\u2019/g,   // '드라마명' (유니코드 곡선 작은따옴표)
  /"([^"]{2,60})"/g,                   // "드라마명" (일반 큰따옴표)
]

// 제목으로 쓰면 안 되는 패턴 (문장형 표현 제거)
const SKIP_TITLE_PATTERNS = [
  /\b(confirms?|reveals?|talks?|shares?|opens? up|addresses?|says?|explains?|returns?|joins?|cast|spotted|dating|teases?|hints?|announces?|discusses?|reacts?|responds?)\b/i,
  /\b(is|are|was|were|will|would|could|should|has|have|had)\b/i,
  /^(watch|review|preview|recap|interview|exclusive|video|photos?|behind|meet|first|new|upcoming|check|see|read)/i,
  /^(the |a |an )?\d{4}$/i,
  /\b(episode|season|ep\.)\s+\d+\b/i,
  /[!?]{1}$/,    // 느낌표/물음표로 끝나는 문장
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

// ============================================================
// 따옴표 안에서 드라마 제목만 추출 (헤드라인 전체 금지)
// ============================================================
function extractDramaTitles(articleTitle: string, content: string): string[] {
  const titles = new Set<string>()
  const searchText = `${articleTitle} ${content}`

  for (const pattern of DRAMA_TITLE_PATTERNS) {
    pattern.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(searchText)) !== null) {
      const t = decodeHtmlEntities(m[1]).trim()

      // 길이 체크
      if (t.length < 2 || t.length > 60) continue

      // 숫자만인 경우 제외
      if (/^\d+$/.test(t)) continue

      // 단어 수가 9개 초과 = 문장, 제외
      if (t.split(/\s+/).length > 8) continue

      // 문장형 패턴 제외
      if (SKIP_TITLE_PATTERNS.some(p => p.test(t))) continue

      titles.add(t)
    }
  }
  return [...titles]
}

interface RssItem {
  title: string
  rawTitle: string
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

    const rawTitle = (
      block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
    )
    const title = decodeHtmlEntities(rawTitle)
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
      items.push({ title, rawTitle, link, pubDate, description, categories, content })
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

  // ── 3. 한국 관련 기사만 필터링 ────────────────────────────
  const koreanItems = allItems.filter(item => {
    const combined = `${item.title} ${item.description} ${item.categories.join(' ')}`
    return isKorean(combined, { includeUnknown: false })
  })
  console.log(`  [Soompi] 전체 ${allItems.length}개 중 한국 관련 ${koreanItems.length}개 필터링`)

  // ── 4. 따옴표 안 드라마 제목만 추출 → FlixPatrolEntry 변환 ──
  const titleMentions = new Map<string, {
    count: number
    platform: string
    region: string
    url: string
    pubDate: string
    isK: boolean
    originalTitle: string
  }>()

  for (const item of koreanItems) {
    const fullText = `${item.rawTitle} ${item.content}`
    const platform = detectPlatform(fullText)
    const region   = detectRegion(fullText)
    const isK = item.categories.some(c =>
      /drama|korean|k-pop|kdrama/i.test(c)
    ) || /korean|korea|k-drama|kdrama/i.test(fullText)

    // 따옴표 안 드라마 제목만 추출
    const dramaTitles = extractDramaTitles(item.rawTitle, item.content)

    for (const t of dramaTitles) {
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
          originalTitle: t,
        })
      }
    }
  }

  // ── 5. 언급 횟수 기준 정렬 → FlixPatrolEntry 배열 생성 ──
  const sorted = [...titleMentions.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)

  for (const [_key, info] of sorted) {
    if (!seenTitles.has(info.originalTitle.toLowerCase())) {
      seenTitles.add(info.originalTitle.toLowerCase())
      allEntries.push({
        rank: rank++,
        title: info.originalTitle,
        platform: info.platform,
        region: info.region,
        points: info.count * 10,
        isKContent: info.isK,
        url: info.url,
      })
    }
  }

  console.log(`  [Soompi/Koreaboo] 총 ${allEntries.length}개 항목 수집 (K: ${allEntries.filter(e => e.isKContent).length}개)`)
  if (allEntries.length > 0) {
    console.log(`  [Soompi/Koreaboo] 상위 5개: ${allEntries.slice(0, 5).map(e => e.title).join(', ')}`)
  }
  return allEntries
}
