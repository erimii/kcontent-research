// ============================================================
// MyDramaList 크롤러 - Playwright
// ============================================================

import { chromium } from 'playwright'
import type { MyDramaListEntry } from '../types/index.js'

export async function crawlMyDramaList(): Promise<MyDramaListEntry[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  })

  const all: MyDramaListEntry[] = []

  const urls = [
    'https://mydramalist.com/shows/korean-dramas?sort=popular&year=2025',
    'https://mydramalist.com/shows/korean-dramas?sort=top&type=1',
  ]

  try {
    for (const url of urls) {
      try {
        console.log(`  [MDL] ${url.includes('popular') ? '인기순' : '방영중'} 수집 중...`)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

        const items = await page.evaluate(() => {
          const results: any[] = []
          document.querySelectorAll('.box-body, li.list-item, .col-lg-8 .box').forEach((card, idx) => {
            if (idx >= 20) return
            const titleEl = card.querySelector('h6 a, h5 a, .title a, a.block-title')
            const title = titleEl?.textContent?.trim()
            if (!title) return
            const rating = parseFloat(card.querySelector('.score, .rating')?.textContent?.trim() || '0') || 0
            const votes = parseInt(card.querySelector('.votes, .watchers')?.textContent?.replace(/[^0-9]/g, '') || '0') || 0
            const genres = [...card.querySelectorAll('.genre a, .genres a')].map((g: any) => g.textContent?.trim()).filter(Boolean)
            const actors = [...card.querySelectorAll('[class*="cast"] a, .artists a')].map((a: any) => a.textContent?.trim()).filter(Boolean).slice(0, 4)
            results.push({ rank: idx + 1, title, rating, votes, episodes: 0, genres, actors, url: (titleEl as any)?.href || '', year: 2025 })
          })
          return results
        })

        // 중복 제거
        const existing = new Set(all.map(e => e.title.toLowerCase()))
        all.push(...items.filter((i: any) => !existing.has(i.title.toLowerCase())))
        await new Promise(r => setTimeout(r, 1500))
      } catch (e) {
        console.error(`  [MDL] ${url} 실패:`, (e as Error).message)
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`  [MDL] 총 ${all.length}개 드라마 수집 완료`)
  return all
}
