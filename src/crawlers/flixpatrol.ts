// ============================================================
// FlixPatrol 크롤러 - Playwright
// ============================================================

import { chromium } from 'playwright'
import type { FlixPatrolEntry } from '../types/index.js'

const K_KEYWORDS = ['korean','korea','k-drama','kdrama','tvn','mbc','kbs','sbs','jtbc']

const PLATFORMS = [
  { name: 'netflix', slug: 'netflix' },
  { name: 'disney', slug: 'disney' },
  { name: 'apple', slug: 'apple-tv' },
]

const REGIONS = [
  { name: 'Global', slug: 'world' },
  { name: 'US', slug: 'united-states' },
  { name: 'UK', slug: 'united-kingdom' },
  { name: 'Korea', slug: 'south-korea' },
  { name: 'Japan', slug: 'japan' },
]

function detectK(title: string) {
  return K_KEYWORDS.some(k => title.toLowerCase().includes(k))
}

export async function crawlFlixPatrol(): Promise<FlixPatrolEntry[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  })

  const all: FlixPatrolEntry[] = []

  try {
    for (const platform of PLATFORMS) {
      for (const region of REGIONS) {
        try {
          const url = `https://flixpatrol.com/top10/${platform.slug}/tv-shows/${region.slug}/today/`
          console.log(`  [FlixPatrol] ${platform.name}/${region.name}...`)
          await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 })

          const entries = await page.evaluate((pName: string, rName: string) => {
            const results: any[] = []
            // 테이블 파싱
            document.querySelectorAll('table tbody tr').forEach((row, idx) => {
              if (idx >= 10) return
              const titleEl = row.querySelector('a[href*="/title/"], td:nth-child(2) a')
              const title = titleEl?.textContent?.trim()
              if (!title || title.length < 2) return
              const points = parseInt(row.querySelector('td:last-child')?.textContent?.replace(/[^0-9]/g, '') || '0') || 0
              results.push({ rank: idx + 1, title, platform: pName, region: rName, points, url: (titleEl as HTMLAnchorElement)?.href || '' })
            })
            // 대안 카드형
            if (results.length === 0) {
              document.querySelectorAll('.top10-show, [data-rank]').forEach((card, idx) => {
                if (idx >= 10) return
                const titleEl = card.querySelector('a, .title, h3')
                const title = titleEl?.textContent?.trim()
                if (!title) return
                results.push({ rank: idx + 1, title, platform: pName, region: rName, points: 0, url: '' })
              })
            }
            return results
          }, platform.name, region.name)

          for (const e of entries) {
            all.push({ ...e, isKContent: detectK(e.title), previousRank: undefined })
          }
          await new Promise(r => setTimeout(r, 1200))
        } catch (e) {
          console.error(`  [FlixPatrol] ${platform.name}/${region.name} 실패:`, (e as Error).message)
        }
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`  [FlixPatrol] 총 ${all.length}개 수집 (K: ${all.filter(e => e.isKContent).length}개)`)
  return all
}
