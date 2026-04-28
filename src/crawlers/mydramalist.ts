// ============================================================
// MyDramaList 크롤러 - RSS 기반 (Playwright 제거)
// - mydramalist.com/rss : K-드라마/영화 뉴스 (API 키 불필요)
// - 기사 제목에서 드라마명 추출 → MyDramaListEntry 변환
// ============================================================

import type { MyDramaListEntry } from '../types/index.js'

const MDL_FEEDS = [
  'https://mydramalist.com/rss',
]

// 제목에서 드라마/영화명 추출 패턴 (작은따옴표 우선 - MDL 스타일)
const TITLE_EXTRACT_PATTERNS = [
  /&#39;([^'&#]{3,60})&#39;/g,           // &#39;드라마명&#39; (MDL RSS 형식)
  /'([^']{3,60})'/g,                      // '드라마명' (일반 따옴표)
  /\u2018([^\u2019]{3,60})\u2019/g,      // '드라마명' (유니코드 따옴표)
  /"([^"]{3,60})"/g,                      // "드라마명"
  /\u201c([^\u201d]{3,60})\u201d/g,      // "드라마명"
]

// 한국 방송사/플랫폼 키워드
const K_PLATFORM_MAP: { key: string; platform: string }[] = [
  { key: 'netflix',  platform: 'netflix' },
  { key: 'tvn',      platform: 'tvn' },
  { key: 'jtbc',     platform: 'jtbc' },
  { key: 'mbc',      platform: 'mbc' },
  { key: 'kbs',      platform: 'kbs' },
  { key: 'sbs',      platform: 'sbs' },
  { key: 'disney',   platform: 'disney' },
  { key: 'wavve',    platform: 'wavve' },
  { key: 'tving',    platform: 'tving' },
  { key: 'ena',      platform: 'ena' },
  { key: 'ocn',      platform: 'ocn' },
  { key: 'apple tv', platform: 'apple' },
]

// 무시할 비-드라마 제목 패턴
const SKIP_PATTERNS = [
  /^(the |a |an )?\d{4}$/i,
  /^(bts|exo|nct|twice|blackpink|stray kids|aespa|newjeans)/i,
  /^(season \d+|episode \d+|ep\. \d+)$/i,
]

function decodeEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '...')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface RssItem {
  title: string
  link: string
  description: string
  pubDate: string
}

async function fetchMdlRss(url: string): Promise<RssItem[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, */*',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  const items: RssItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null

  while ((m = itemRegex.exec(text)) !== null) {
    const block = m[1]
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '')
    const link  = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim()
    const desc  = decodeEntities(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '')
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || new Date().toISOString()
    if (title) items.push({ title, link, description: desc, pubDate })
  }
  return items
}

function extractDramaTitles(rawTitle: string, rawDesc: string): string[] {
  // RSS 원본(디코딩 전) 텍스트에서 작은따옴표 패턴으로 추출
  const combinedRaw = `${rawTitle} ${rawDesc}`
  const titles = new Set<string>()

  for (const pat of TITLE_EXTRACT_PATTERNS) {
    pat.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.exec(combinedRaw)) !== null) {
      const t = decodeEntities(m[1]).trim()
      if (
        t.length >= 2 && t.length <= 60 &&
        !SKIP_PATTERNS.some(sp => sp.test(t)) &&
        !/^\d+$/.test(t)
      ) {
        titles.add(t)
      }
    }
  }
  return [...titles]
}

function detectPlatform(text: string): string {
  const lower = text.toLowerCase()
  for (const { key, platform } of K_PLATFORM_MAP) {
    if (lower.includes(key)) return platform
  }
  return 'other'
}

// ============================================================
// 메인 크롤링 함수
// ============================================================
export async function crawlMyDramaList(): Promise<MyDramaListEntry[]> {
  const allItems: RssItem[] = []

  // RSS 수집
  const results = await Promise.allSettled(MDL_FEEDS.map(fetchMdlRss))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  [MDL] RSS ${i + 1}: ${r.value.length}개 기사`)
      allItems.push(...r.value)
    } else {
      console.warn(`  [MDL] RSS ${i + 1} 실패:`, r.reason?.message)
    }
  })

  if (allItems.length === 0) {
    console.warn('  [MDL] 수집된 기사 없음')
    return []
  }

  // 드라마 제목 집계 (RSS 원본 텍스트 기준)
  const titleMap = new Map<string, {
    count: number
    platform: string
    actors: string[]
    pubDate: string
    url: string
  }>()

  for (const item of allItems) {
    // RSS 원본(&#39; 포함) 기준으로 제목 추출
    const rawBlock = `${item.title} ${item.description}`
    const dramas = extractDramaTitles(item.title, item.description)
    const platform = detectPlatform(rawBlock)

    // 기사 제목에서 배우 이름 추출 (Name Surname 패턴)
    const actorMatches = item.title.match(/[A-Z][a-z]+ [A-Z][a-z]+/g) || []
    const actors = actorMatches.filter(a =>
      !['Check Out', 'New Drama', 'See Also', 'Read More', 'Full Count', 'Gold Land'].includes(a)
    ).slice(0, 3)

    for (const drama of dramas) {
      const key = drama.toLowerCase()
      if (titleMap.has(key)) {
        const entry = titleMap.get(key)!
        entry.count++
        if (actors.length && !entry.actors.length) entry.actors = actors
        if (platform !== 'other' && entry.platform === 'other') entry.platform = platform
      } else {
        titleMap.set(key, {
          count: 1,
          platform,
          actors,
          pubDate: item.pubDate,
          url: item.link,
        })
      }
    }
  }

  // 언급 횟수 기준 정렬 → MyDramaListEntry 배열
  const sorted = [...titleMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)

  const entries: MyDramaListEntry[] = sorted.map(([key, info], i) => {
    // 제목 복원 (첫 글자 대문자 처리)
    const displayTitle = key.charAt(0).toUpperCase() + key.slice(1)
    return {
      rank: i + 1,
      title: displayTitle,
      year: 2025,
      rating: Math.max(7.0, 9.0 - i * 0.05),   // 순위 기반 추정 평점
      votes: Math.max(100, 1000 - i * 20),
      episodes: 0,
      genres: ['Drama'],
      actors: info.actors,
      url: info.url,
    }
  })

  console.log(`  [MDL] 총 ${entries.length}개 드라마 수집 완료`)
  return entries
}
