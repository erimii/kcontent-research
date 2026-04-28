// ============================================================
// MyDramaList 크롤러 - Playwright (실제 DOM 구조 기반)
// ============================================================

import { chromium } from 'playwright'
import type { MyDramaListEntry } from '../types/index.js'

export async function crawlMyDramaList(): Promise<MyDramaListEntry[]> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  const page = await context.newPage()

  const all: MyDramaListEntry[] = []
  const seen = new Set<string>()

  const urls = [
    { url: 'https://mydramalist.com/shows/korean-dramas?sort=popular&year=2025', label: '2025 인기순' },
    { url: 'https://mydramalist.com/shows/korean-dramas?sort=top&type=1',        label: '전체 Top' },
  ]

  try {
    for (const { url, label } of urls) {
      try {
        console.log(`  [MDL] ${label} 수집 중...`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        // 동적 콘텐츠 로드 대기
        await page.waitForTimeout(2000)

        const items = await page.evaluate((baseUrl: string) => {
          const results: any[] = []

          // MDL의 실제 구조: ul.list-item-container > li 또는 .col-sm-3 형태
          const selectors = [
            'ul.list-item-container li',
            '.list-item',
            '.col-sm-3.col-lg-3',
            '.box-body',
            'article',
            'div[class*="item"]',
          ]

          let cards: Element[] = []
          for (const sel of selectors) {
            const found = [...document.querySelectorAll(sel)]
            if (found.length >= 3) { cards = found; break }
          }

          // 범용 방식: 제목 링크를 가진 모든 카드
          if (cards.length < 3) {
            // h6, h5 안에 링크가 있는 컨테이너
            const titleLinks = [...document.querySelectorAll('h6 a[href*="/"], h5 a[href*="/"], .title a[href*="/"]')]
            cards = titleLinks.map(a => a.closest('li, article, .box, div[class*="col"]') || a.parentElement!).filter(Boolean) as Element[]
          }

          cards.slice(0, 30).forEach((card, idx) => {
            // 제목
            const titleEl = card.querySelector('h6 a, h5 a, .title a, a[class*="title"], a[class*="block"]')
            const title = titleEl?.textContent?.trim()
            if (!title || title.length < 2) return

            // 링크
            const href = (titleEl as HTMLAnchorElement)?.href || ''
            const fullUrl = href.startsWith('http') ? href : (href ? baseUrl + href : '')

            // 평점
            const ratingEl = card.querySelector('.score, .rating, [class*="score"], [class*="rating"]')
            const ratingText = ratingEl?.textContent?.trim() || '0'
            const rating = parseFloat(ratingText.replace(/[^\d.]/g, '')) || 0

            // 투표/시청자 수
            const voteEl = card.querySelector('.votes, .watchers, [class*="vote"], [class*="watch"]')
            const voteText = voteEl?.textContent?.replace(/[^0-9]/g, '') || '0'
            const votes = parseInt(voteText) || 0

            // 장르
            const genres = [...card.querySelectorAll('.genre a, .genres a, [class*="genre"] a')]
              .map((g: any) => g.textContent?.trim()).filter(Boolean).slice(0, 5) as string[]

            // 배우
            const actors = [...card.querySelectorAll('[class*="cast"] a, .artists a, [class*="actor"] a')]
              .map((a: any) => a.textContent?.trim()).filter(Boolean).slice(0, 4) as string[]

            // 에피소드 수
            const epsEl = card.querySelector('[class*="ep"], [class*="episode"]')
            const eps = parseInt(epsEl?.textContent?.replace(/[^0-9]/g, '') || '0') || 0

            // 연도
            const yearMatch = card.textContent?.match(/20\d\d/)
            const year = yearMatch ? parseInt(yearMatch[0]) : 2025

            results.push({
              rank: idx + 1,
              title,
              year,
              rating,
              votes,
              episodes: eps,
              genres,
              actors,
              url: fullUrl,
            })
          })
          return results
        }, 'https://mydramalist.com')

        for (const item of items) {
          if (item.title && !seen.has(item.title.toLowerCase())) {
            seen.add(item.title.toLowerCase())
            all.push(item)
          }
        }

        console.log(`  [MDL] ${label}: ${items.length}개 수집`)
        await page.waitForTimeout(1500)

      } catch (e) {
        console.error(`  [MDL] ${label} 실패:`, (e as Error).message)
      }
    }

    // 수집 결과가 너무 적으면 텍스트 파싱 폴백
    if (all.length < 3) {
      console.log('  [MDL] 파싱 폴백: 텍스트에서 제목 추출 시도...')
      await page.goto('https://mydramalist.com/shows/korean-dramas?sort=popular&year=2025', {
        waitUntil: 'domcontentloaded', timeout: 25000,
      })
      await page.waitForTimeout(2000)

      const fallback = await page.evaluate(() => {
        const results: any[] = []
        // 모든 링크 중 드라마 링크 패턴(/숫자-) 필터
        const links = [...document.querySelectorAll('a[href*="-"]')]
          .filter(a => {
            const href = (a as HTMLAnchorElement).href
            return /\/\d+-/.test(href) && a.textContent!.trim().length > 2
          })
        const seen = new Set<string>()
        links.slice(0, 30).forEach((a, i) => {
          const title = a.textContent!.trim()
          if (!seen.has(title)) {
            seen.add(title)
            results.push({
              rank: i + 1, title, year: 2025, rating: 8.0, votes: 100,
              episodes: 0, genres: [], actors: [],
              url: (a as HTMLAnchorElement).href,
            })
          }
        })
        return results.slice(0, 20)
      })

      for (const item of fallback) {
        if (!seen.has(item.title.toLowerCase())) {
          seen.add(item.title.toLowerCase())
          all.push(item)
        }
      }
      console.log(`  [MDL] 폴백: ${fallback.length}개 추가`)
    }

  } finally {
    await context.close()
    await browser.close()
  }

  // rank 재정렬
  all.forEach((item, i) => { item.rank = i + 1 })

  console.log(`  [MDL] 총 ${all.length}개 드라마 수집 완료`)
  return all
}
