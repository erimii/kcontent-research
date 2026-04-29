// ============================================================
// Google Trends 크롤러 - Daily Trends RSS (인증 불필요)
// https://trends.google.com/trending/rss?geo=US
// ============================================================

import type { GTrendsItem } from '../types/index.js'

const RSS_URL = (geo: string) => `https://trends.google.com/trending/rss?geo=${geo}`
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// "2000+" → 2000, "5K+" → 5000, "1M+" → 1000000
function parseTraffic(s: string): number {
  const m = s.match(/([\d.]+)\s*([KMB]?)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = (m[2] || '').toUpperCase()
  if (unit === 'K') return Math.round(n * 1000)
  if (unit === 'M') return Math.round(n * 1_000_000)
  if (unit === 'B') return Math.round(n * 1_000_000_000)
  return Math.round(n)
}

export async function fetchGTrendsRss(geo: string = 'US'): Promise<Omit<GTrendsItem, 'category' | 'isKContent' | 'kKeywords'>[]> {
  const res = await fetch(RSS_URL(geo), {
    headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, */*' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`Google Trends RSS HTTP ${res.status}`)
  const xml = await res.text()

  const items: Omit<GTrendsItem, 'category' | 'isKContent' | 'kKeywords'>[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null

  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '')
    if (!title) continue
    const trafficRaw = block.match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/)?.[1]?.trim() || '0'
    const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim()
    const pictureSource = block.match(/<ht:picture_source>([^<]+)<\/ht:picture_source>/)?.[1]?.trim()

    // 뉴스 아이템들
    const newsItems: { title: string; source: string; url: string }[] = []
    const newsRe = /<ht:news_item>([\s\S]*?)<\/ht:news_item>/g
    let nm: RegExpExecArray | null
    while ((nm = newsRe.exec(block)) !== null) {
      const nb = nm[1]
      const nt = decodeEntities(nb.match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/)?.[1]?.trim() || '')
      const ns = decodeEntities(nb.match(/<ht:news_item_source>([^<]+)<\/ht:news_item_source>/)?.[1]?.trim() || '')
      const nu = nb.match(/<ht:news_item_url>([^<]+)<\/ht:news_item_url>/)?.[1]?.trim() || ''
      if (nt) newsItems.push({ title: nt, source: ns, url: nu })
    }

    items.push({
      title,
      traffic: trafficRaw,
      trafficValue: parseTraffic(trafficRaw),
      publishedAt: pubDate ? new Date(pubDate).toISOString() : undefined,
      pictureSource,
      newsItems,
    })
  }

  return items
}
