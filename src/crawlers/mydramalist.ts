// ============================================================
// MyDramaList 크롤러 - RSS 기반 (Playwright 제거)
// - mydramalist.com/rss : K-드라마/영화 뉴스 (API 키 불필요)
// - 기사 제목의 따옴표 안 드라마명 추출 → MyDramaListEntry 변환
// ============================================================

import type { MyDramaListEntry } from '../types/index.js'
import { isKorean } from '../pipeline/korean-filter.js'

const MDL_FEEDS = [
  'https://mydramalist.com/rss',
]

// 제목에서 드라마/영화명 추출 패턴
// MDL RSS 구조: 작은따옴표 = &#39;...&#39; 형식
// 소유격 Name&#39;s 뒤의 &#39;...&#39;은 드라마 제목
// 문장 시작의 &#39;...&#39;도 드라마 제목
// 단, 이름 소유격 자체(Name&#39;s ... Name&#39;s)는 무시
const TITLE_EXTRACT_PATTERNS = [
  // ① 소유격 뒤의 드라마 제목: Name&#39;s &#39;Title&#39;
  //    Lee Jae Wook&#39;s &#39;Doctor on the Edge&#39; → Doctor on the Edge
  /[A-Za-z]&#39;s\s+&#39;([^&#]{3,60})&#39;/g,
  // ② 문장 맨 앞의 드라마 제목: &#39;Title&#39; ...
  //    &#39;Perfect Crown&#39; soars → Perfect Crown
  /^&#39;([^&#]{3,60})&#39;/g,
  // ③ 쉼표/공백 뒤의 드라마 제목: ..., &#39;Title&#39; or ... &#39;Title&#39;
  //    &#39;Perfect Crown&#39;..., &#39;Filing for Love&#39; → Filing for Love
  /[,\s]&#39;([A-Z][^&#]{2,60})&#39;/g,
  /\u2018([^\u2019]{3,60})\u2019/g,      // '드라마명' (유니코드 곡선 따옴표)
  /\u201c([^\u201d]{3,60})\u201d/g,      // "드라마명" (유니코드 곡선 큰따옴표)
  /"([^"]{3,60})"/g,                      // "드라마명" (일반 큰따옴표)
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

// 제목으로 쓰면 안 되는 패턴
const SKIP_PATTERNS = [
  /^(the |a |an )?\d{4}$/i,                          // 연도만
  /^(bts|exo|nct|twice|blackpink|stray kids|aespa|newjeans)/i, // K-pop 그룹
  /^(season \d+|episode \d+|ep\. \d+)$/i,           // 시즌/에피소드
  /^(official|trailer|teaser|poster|bts|making)$/i, // 영상 타입
  /\b(confirms?|reveals?|talks?|shares?|opens? up|addresses?|says?|explains?|returns?|joins?|cast|spotted|dating)\b/i, // 동사 포함 문장
  /^(watch|review|preview|recap|interview|exclusive|video|photos?|behind|meet|first|new|upcoming):/i, // 기사 접두어
]

// 드라마 제목이 아닌 일반 영어 단어/구문 패턴
const NOT_DRAMA_PATTERNS = [
  /^[a-z]/, // 소문자 시작 (제목은 대문자 시작)
  /\b(the|a|an)\s+\w+\s+(of|in|for|at|to)\b/i, // 관사+명사+전치사 구문
  /^\d+\s/, // 숫자로 시작
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
  title: string       // 디코딩된 제목
  rawTitle: string    // 원본(&#39; 등 포함) 제목
  link: string
  description: string
  rawDesc: string     // 원본 description
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
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ''
    const rawDesc  = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || ''
    const link  = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').trim()
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || new Date().toISOString()
    const title = decodeEntities(rawTitle)
    const desc  = decodeEntities(rawDesc)
    if (title) items.push({ title, rawTitle, link, description: desc, rawDesc, pubDate })
  }
  return items
}

// ============================================================
// 따옴표 안 드라마 제목 추출
// ============================================================
function extractDramaTitles(rawTitle: string, rawDesc: string): string[] {
  const combinedRaw = `${rawTitle} ${rawDesc}`
  const titles = new Set<string>()

  for (const pat of TITLE_EXTRACT_PATTERNS) {
    pat.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.exec(combinedRaw)) !== null) {
      const t = decodeEntities(m[1]).trim()

      // 기본 길이 체크
      if (t.length < 2 || t.length > 60) continue

      // 숫자만인 경우 제외
      if (/^\d+$/.test(t)) continue

      // SKIP_PATTERNS 체크
      if (SKIP_PATTERNS.some(sp => sp.test(t))) continue

      // NOT_DRAMA 패턴 체크
      if (NOT_DRAMA_PATTERNS.some(p => p.test(t))) continue

      // 단어 수가 8개 초과인 경우 제외 (제목이 아닌 문장)
      if (t.split(/\s+/).length > 8) continue

      titles.add(t)
    }
  }
  return [...titles]
}

// ============================================================
// 배우 이름 추출 (엄격한 필터링)
// ============================================================
// 드라마/영화 제목으로 자주 쓰이는 단어들 - 배우 이름 필터링용
const DRAMA_WORDS = new Set([
  'Squid', 'Game', 'Crash', 'Landing', 'Hospital', 'Playlist', 'Signal',
  'Reply', 'Misaeng', 'Moving', 'Sweet', 'Home', 'Juvenile', 'Justice',
  'Lovely', 'Runner', 'Pachinko', 'Kingdom', 'Arthdal', 'Chronicles',
  'Itaewon', 'Class', 'Goblin', 'Stranger', 'Things', 'Vagabond',
  'SKY', 'Castle', 'Prison', 'Playbook', 'Village', 'Secret', 'Garden',
  'Boys', 'Girls', 'Over', 'Flowers', 'Coffee', 'Prince', 'Full', 'House',
  'Doctor', 'Lawyer', 'Prosecutor', 'Detective', 'Police', 'Officer',
  'Train', 'Busan', 'Parasite', 'Minari', 'Burning', 'Oasis',
  'Check', 'Out', 'See', 'Also', 'Read', 'More', 'Full', 'Count',
  'Gold', 'Land', 'New', 'Drama', 'Korean', 'Upcoming', 'Latest',
  'Season', 'Episode', 'Preview', 'Teaser', 'Trailer', 'Poster',
  'Rating', 'Review', 'Recap', 'Interview', 'Behind', 'Scene',
  'Life', 'Visuals', 'Confirms', 'Marriage', 'Dating', 'Spotted',
])

function extractActors(title: string): string[] {
  // "Name Surname" 패턴 (한국인 이름: 성+이름 2-3음절)
  const candidates = title.match(/[A-Z][a-z]{1,8} [A-Z][a-z]{1,8}(?:\s[A-Z][a-z]{1,8})?/g) || []

  return candidates
    .filter(a => {
      const parts = a.split(' ')
      // 모든 파트가 DRAMA_WORDS에 없어야 함
      if (parts.some(p => DRAMA_WORDS.has(p))) return false
      // 최소 2단어
      if (parts.length < 2) return false
      // 너무 긴 이름 제외
      if (a.length > 25) return false
      return true
    })
    .slice(0, 3)
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

  // RSS 수집 + 한국 관련 기사만 필터
  const results = await Promise.allSettled(MDL_FEEDS.map(fetchMdlRss))
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      const filtered = r.value.filter(item => {
        const combined = `${item.title} ${item.description}`
        // 한국 키워드가 있는 기사만 포함
        return isKorean(combined, { includeUnknown: false })
      })
      console.log(`  [MDL] RSS ${i + 1}: ${r.value.length}개 중 ${filtered.length}개 (한국 관련)`)
      allItems.push(...filtered)
    } else {
      console.warn(`  [MDL] RSS ${i + 1} 실패:`, r.reason?.message)
    }
  })

  if (allItems.length === 0) {
    console.warn('  [MDL] 수집된 기사 없음')
    return []
  }

  // 드라마 제목 집계
  const titleMap = new Map<string, {
    count: number
    platform: string
    actors: string[]
    pubDate: string
    url: string
    originalTitle: string // 원래 표기 (대소문자 보존)
  }>()

  for (const item of allItems) {
    const platform = detectPlatform(`${item.rawTitle} ${item.rawDesc}`)
    const actors = extractActors(item.title)

    // 원본 RSS(&#39; 포함)에서 따옴표 안 드라마 제목 추출
    const dramas = extractDramaTitles(item.rawTitle, item.rawDesc)

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
          originalTitle: drama,
        })
      }
    }
  }

  // 언급 횟수 기준 정렬 → MyDramaListEntry 배열
  const sorted = [...titleMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)

  const entries: MyDramaListEntry[] = sorted.map(([_key, info], i) => {
    return {
      rank: i + 1,
      title: info.originalTitle, // 원래 표기 유지
      year: 2025,
      rating: Math.max(7.0, 9.0 - i * 0.05),
      votes: Math.max(100, 1000 - i * 20),
      episodes: 0,
      genres: ['Drama'],
      actors: info.actors,
      url: info.url,
    }
  })

  console.log(`  [MDL] 총 ${entries.length}개 드라마 수집 완료`)
  if (entries.length > 0) {
    console.log(`  [MDL] 상위 5개: ${entries.slice(0, 5).map(e => e.title).join(', ')}`)
  }
  return entries
}
