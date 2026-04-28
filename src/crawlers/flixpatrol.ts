// ============================================================
// FlixPatrol 크롤러 (Playwright 기반)
// OTT별 글로벌/권역별 순위 수집
// ============================================================

import { chromium, type Browser, type Page } from 'playwright'
import type { FlixPatrolEntry } from '../types/index.js'

const BASE_URL = 'https://flixpatrol.com'

const K_CONTENT_KEYWORDS = [
  'korean', 'korea', 'k-drama', 'kdrama',
  'studio dragon', 'cj enm', 'jtbc', 'sbs', 'kbs', 'mbc', 'tvn',
]

const PLATFORMS = [
  { name: 'netflix', slug: 'netflix' },
  { name: 'disney', slug: 'disney' },
  { name: 'apple', slug: 'apple-tv' },
  { name: 'amazon', slug: 'amazon-prime' },
  { name: 'hulu', slug: 'hulu' },
  { name: 'hbo', slug: 'hbo' },
]

const REGIONS = [
  { name: 'Global', slug: 'world' },
  { name: 'US', slug: 'united-states' },
  { name: 'UK', slug: 'united-kingdom' },
  { name: 'Canada', slug: 'canada' },
  { name: 'Australia', slug: 'australia' },
  { name: 'Japan', slug: 'japan' },
  { name: 'Korea', slug: 'south-korea' },
  { name: 'Philippines', slug: 'philippines' },
  { name: 'Thailand', slug: 'thailand' },
]

function detectKContent(title: string): boolean {
  const t = title.toLowerCase()
  return K_CONTENT_KEYWORDS.some(k => t.includes(k))
}

export async function getFlixPatrolBrowser(remoteDebugPort?: number): Promise<Browser> {
  if (remoteDebugPort) {
    try {
      return await chromium.connectOverCDP(`http://localhost:${remoteDebugPort}`)
    } catch {
      console.warn(`[FlixPatrol] CDP 연결 실패, 새 브라우저 실행`)
    }
  }
  return await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

async function crawlPlatformRegion(
  page: Page,
  platform: { name: string; slug: string },
  region: { name: string; slug: string }
): Promise<FlixPatrolEntry[]> {
  const url = `${BASE_URL}/top10/${platform.slug}/tv-shows/${region.slug}/today/`
  console.log(`[FlixPatrol] ${platform.name} / ${region.name} 크롤링...`)

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    const entries = await page.evaluate((platformName: string, regionName: string) => {
      const results: Array<{
        rank: number; title: string; platform: string;
        region: string; points: number; url: string;
      }> = []

      // FlixPatrol 테이블 구조 파싱
      const rows = document.querySelectorAll('table tbody tr')
      rows.forEach((row, idx) => {
        if (idx >= 10) return
        const titleEl = row.querySelector('a[href*="/title/"], td:nth-child(2) a, .show-title a')
        const title = titleEl?.textContent?.trim()
        if (!title || title.length < 2) return
        const href = (titleEl as HTMLAnchorElement)?.href ?? ''
        const pointsEl = row.querySelector('td:last-child')
        const points = parseInt(pointsEl?.textContent?.replace(/[^0-9]/g, '') ?? '0') || 0
        results.push({ rank: idx + 1, title, platform: platformName, region: regionName, points, url: href })
      })

      // 대안 셀렉터 (레이아웃이 다를 경우)
      if (results.length === 0) {
        const cards = document.querySelectorAll('.top10-show, .chart-item, [data-rank]')
        cards.forEach((card, idx) => {
          if (idx >= 10) return
          const titleEl = card.querySelector('a, .title, h3')
          const title = titleEl?.textContent?.trim()
          if (!title) return
          results.push({
            rank: idx + 1, title,
            platform: platformName, region: regionName, points: 0,
            url: (titleEl as HTMLAnchorElement)?.href ?? '',
          })
        })
      }

      return results
    }, platform.name, region.name)

    return entries.map(e => ({
      ...e,
      isKContent: detectKContent(e.title),
      previousRank: undefined,
    }))
  } catch (err) {
    console.error(`[FlixPatrol] ${platform.name}/${region.name} 실패:`, err)
    return []
  }
}

export async function crawlFlixPatrol(options: {
  platforms?: string[]
  regions?: string[]
  remoteDebugPort?: number
} = {}): Promise<FlixPatrolEntry[]> {
  const { platforms: targetPlatforms, regions: targetRegions, remoteDebugPort } = options

  const selectedPlatforms = targetPlatforms
    ? PLATFORMS.filter(p => targetPlatforms.includes(p.name))
    : PLATFORMS.slice(0, 3)

  const selectedRegions = targetRegions
    ? REGIONS.filter(r => targetRegions.includes(r.name))
    : REGIONS.slice(0, 4)

  const browser = await getFlixPatrolBrowser(remoteDebugPort)
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  })

  const allEntries: FlixPatrolEntry[] = []
  try {
    for (const platform of selectedPlatforms) {
      for (const region of selectedRegions) {
        const entries = await crawlPlatformRegion(page, platform, region)
        allEntries.push(...entries)
        await new Promise(r => setTimeout(r, 1200))
      }
    }
  } finally {
    await page.close()
    if (!remoteDebugPort) await browser.close()
  }

  const kCount = allEntries.filter(e => e.isKContent).length
  console.log(`[FlixPatrol] 총 ${allEntries.length}개 항목 (K콘텐츠: ${kCount}개)`)
  return allEntries
}
