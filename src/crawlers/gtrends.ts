// ============================================================
// Google Trends 크롤러 - Playwright 기반 trending 페이지 스크래핑
// 단일 RSS는 10개 cap이 있어 trending 페이지(URL 7개) 병합으로 100+개 확보
// ============================================================

import { chromium, type Page } from 'playwright'
import type { GTrendsItem } from '../types/index.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// trending 페이지는 URL당 ~25개 노출. 다양한 카테고리·시간으로 다른 셋 확보.
const PW_SOURCES: { url: string; label: string }[] = [
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US',                        label: 'US-daily' },
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US&hours=168',              label: 'US-7day' },
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US&category=3',             label: 'US-cat3' },
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US&category=4',             label: 'US-cat4' },
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US&category=18',            label: 'US-cat18' },
  { url: 'https://trends.google.com/trending?geo=US&hl=en-US&category=20',            label: 'US-cat20' },
  { url: 'https://trends.google.com/trending?geo=CA&hl=en-US',                        label: 'CA-daily' },
]

type RawItem = Omit<GTrendsItem, 'category' | 'isKContent' | 'kKeywords'>

// "100K+", "5K+", "200K+" → 숫자
function parseTraffic(s: string): number {
  const m = s.match(/([\d.]+)\s*([KMB]?)\+?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = (m[2] || '').toUpperCase()
  if (unit === 'K') return Math.round(n * 1000)
  if (unit === 'M') return Math.round(n * 1_000_000)
  if (unit === 'B') return Math.round(n * 1_000_000_000)
  return Math.round(n)
}

// 단일 trending 페이지에서 row 추출
async function fetchTrendingPage(page: Page, url: string): Promise<RawItem[]> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // 트렌드 row 로딩 대기
  await page.waitForSelector('table tbody tr', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // tsx __name 헬퍼 충돌 회피 — inner arrow function·type annotation 미사용
  // 셀 단위 추출: cell 1 = title+meta, cell 2 = traffic+growth, cell 3 = time, cell 4 = related queries
  return page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr')
    const out: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const tds = r.querySelectorAll('td')
      if (tds.length < 4) continue

      const t1 = tds[1] && tds[1].textContent ? tds[1].textContent.replace(/\s+/g, ' ').trim() : ''
      const t2 = tds[2] && tds[2].textContent ? tds[2].textContent.replace(/\s+/g, ' ').trim() : ''
      const t3 = tds[3] && tds[3].textContent ? tds[3].textContent.replace(/\s+/g, ' ').trim() : ''
      const t4 = tds[4] && tds[4].textContent ? tds[4].textContent.replace(/\s+/g, ' ').trim() : ''
      if (!t1 || !t2) continue

      // traffic — cell 2 시작에 깔끔히 등장: "100K+arrow_upward1,000%"
      const tm = t2.match(/^(\d+(?:\.\d+)?[KMB]?\+)/)
      if (!tm) continue
      const trafficStr = tm[1]

      // growth — cell 2 안 "arrow_upward1,000%" 뒤
      const tmGrowth = t2.match(/arrow_upward([\d,]+%)/)
      const growth = tmGrowth ? tmGrowth[1] : ''

      // title — cell 1에서 traffic·메타 부분 잘라냄
      // cell 1 형태: "{title}{traffic} searches·trending_upActive·{time} ago"
      let title = t1
      const cutIdx = t1.lastIndexOf(`${trafficStr} searches`)
      if (cutIdx > 0) title = t1.slice(0, cutIdx).trim()
      // 정규식으로도 한 번 더 cleanup
      title = title.replace(/\d+\+\s*$/, '').trim()
      if (!title || title.length < 2) continue

      // time — cell 3 시작: "12 hours ago", "5 days ago"
      const tmTime = t3.match(/^(\d+\s*(?:hour|day|minute|month)s?\s*ago)/i)
      const timeAgo = tmTime ? tmTime[1].replace(/\s+/g, ' ') : ''

      // related queries — cell 4에서 추출
      // 패턴: "{query}{query}Search termquery_statsExplore" 반복 (라벨+타이틀 중복)
      const relatedQueries: string[] = []
      const seenQ = new Set<string>()
      const tokens = t4.split(/Search\s*termquery_statsExplore|query_statsExplore|Search\s*term/i)
      for (let raw of tokens) {
        let q = raw.trim()
        if (!q || q.length < 3 || q.length > 60) continue
        // "abcabc" 같이 라벨 중복 → 절반 자르기
        for (let len = Math.floor(q.length / 2); len >= 3; len--) {
          if (q.slice(0, len).toLowerCase() === q.slice(len, 2 * len).toLowerCase()) {
            q = q.slice(0, len)
            break
          }
        }
        q = q.trim()
        if (q.length < 3 || /^\d+$/.test(q)) continue
        if (seenQ.has(q.toLowerCase())) continue
        seenQ.add(q.toLowerCase())
        relatedQueries.push(q)
        if (relatedQueries.length >= 5) break
      }

      out.push({ title, trafficStr, timeAgo, growth, relatedQueries })
    }
    return out
  })
    .then((rows: any[]) =>
      rows.map<RawItem>((r) => ({
        title: r.title,
        traffic: r.trafficStr,
        trafficValue: parseTraffic(r.trafficStr),
        publishedAt: undefined,
        pictureSource: undefined,
        // related queries를 newsItems에 셰이프 변환 (categorize 키워드 매칭에 사용됨)
        newsItems: (r.relatedQueries as string[]).map((q) => ({ title: q, source: 'related', url: '' })),
      }))
    )
}

// 다수 페이지 병합 + dedup
export async function fetchGTrendsRss(_geo: string = 'US'): Promise<RawItem[]> {
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    const page = await ctx.newPage()

    const all: RawItem[] = []
    let okCount = 0
    for (const src of PW_SOURCES) {
      try {
        const items = await fetchTrendingPage(page, src.url)
        all.push(...items)
        okCount++
      } catch (e) {
        console.warn(`  [GTrends] ${src.label} 실패:`, (e as Error).message)
      }
      // rate-limit 보호
      await page.waitForTimeout(400)
    }
    console.log(`  [GTrends] ${okCount}/${PW_SOURCES.length} 페이지 수집 → ${all.length}개 raw`)

    // title 기준 case-insensitive dedup. trafficValue 큰 쪽 + relatedQueries 합집합 유지
    const merged = new Map<string, RawItem>()
    for (const it of all) {
      const key = it.title.trim().toLowerCase()
      const ex = merged.get(key)
      if (!ex) { merged.set(key, it); continue }
      const newsUnion = [...ex.newsItems, ...it.newsItems]
        .filter((n, i, arr) => arr.findIndex((x) => x.title.toLowerCase() === n.title.toLowerCase()) === i)
      merged.set(key, {
        title: it.title,
        traffic: ex.trafficValue >= it.trafficValue ? ex.traffic : it.traffic,
        trafficValue: Math.max(ex.trafficValue, it.trafficValue),
        publishedAt: ex.publishedAt || it.publishedAt,
        pictureSource: ex.pictureSource || it.pictureSource,
        newsItems: newsUnion,
      })
    }
    console.log(`  [GTrends] dedup 후 ${merged.size}개 유니크 트렌드`)
    return [...merged.values()]
  } finally {
    await browser.close()
  }
}
