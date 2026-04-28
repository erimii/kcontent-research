// ============================================================
// MyDramaList 크롤러 (Playwright 기반)
// 주간 인기 한국 드라마 평점/순위 수집
// ============================================================

import { chromium, type Browser, type Page } from 'playwright'
import type { MyDramaListEntry } from '../types/index.js'

const BASE_URL = 'https://mydramalist.com'

export async function getMDLBrowser(remoteDebugPort?: number): Promise<Browser> {
  if (remoteDebugPort) {
    try {
      return await chromium.connectOverCDP(`http://localhost:${remoteDebugPort}`)
    } catch {
      console.warn(`[MDL] CDP 연결 실패, 새 브라우저 실행`)
    }
  }
  return await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
}

// ============================================================
// 인기 한국 드라마 리스트 크롤링
// ============================================================

async function crawlTopDramas(page: Page): Promise<MyDramaListEntry[]> {
  const url = `${BASE_URL}/shows/top?type=korean-drama`
  console.log(`[MDL] 인기 한국 드라마 순위 크롤링...`)

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 35000 })

    const entries = await page.evaluate(() => {
      const results: Array<{
        rank: number
        title: string
        year: number | undefined
        rating: number
        votes: number
        episodes: number | undefined
        genres: string[]
        actors: string[]
        url: string
      }> = []

      // MDL 순위 카드 구조
      const cards = document.querySelectorAll('.mdl-style-list .box-body, .mdl-rating .box, li.list-item')
      let rank = 1

      cards.forEach((card) => {
        if (rank > 30) return

        // 제목
        const titleEl = card.querySelector('h6.title a, .title a, a.title, h6 a')
        const title = titleEl?.textContent?.trim()
        if (!title) return

        const href = (titleEl as HTMLAnchorElement)?.href ?? ''

        // 평점
        const ratingEl = card.querySelector('.score, .rating, [class*="score"]')
        const ratingText = ratingEl?.textContent?.trim() ?? '0'
        const rating = parseFloat(ratingText.replace(/[^0-9.]/g, '')) || 0

        // 투표수
        const votesEl = card.querySelector('.votes, [class*="votes"], .text-muted')
        const votesText = votesEl?.textContent ?? '0'
        const votesMatch = votesText.match(/[\d,]+/)
        const votes = parseInt((votesMatch?.[0] ?? '0').replace(/,/g, '')) || 0

        // 연도
        const yearEl = card.querySelector('.year, [class*="year"]')
        const yearText = yearEl?.textContent ?? ''
        const yearMatch = yearText.match(/\d{4}/)
        const year = yearMatch ? parseInt(yearMatch[0]) : undefined

        // 에피소드 수
        const epsEl = card.querySelector('.ep, [class*="episodes"]')
        const epsText = epsEl?.textContent ?? ''
        const epsMatch = epsText.match(/\d+/)
        const episodes = epsMatch ? parseInt(epsMatch[0]) : undefined

        // 장르
        const genreEls = card.querySelectorAll('.genre a, [class*="genre"] a, .tags a')
        const genres = Array.from(genreEls).map((el: Element) => el.textContent?.trim() ?? '').filter(Boolean)

        // 배우 (있는 경우)
        const actorEls = card.querySelectorAll('.cast a, [class*="cast"] a, .actors a')
        const actors = Array.from(actorEls).map((el: Element) => el.textContent?.trim() ?? '').filter(Boolean)

        results.push({ rank, title, year, rating, votes, episodes, genres, actors, url: href })
        rank++
      })

      return results
    })

    console.log(`[MDL] ${entries.length}개 드라마 파싱 완료`)
    return entries
  } catch (err) {
    console.error(`[MDL] 크롤링 실패:`, err)
    return []
  }
}

// ============================================================
// 주간 트렌딩 드라마 크롤링 (추가)
// ============================================================

async function crawlTrendingDramas(page: Page): Promise<MyDramaListEntry[]> {
  const url = `${BASE_URL}/shows/trending`
  console.log(`[MDL] 트렌딩 드라마 크롤링...`)

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    const entries = await page.evaluate(() => {
      const results: Array<{
        rank: number
        title: string
        year: number | undefined
        rating: number
        votes: number
        episodes: number | undefined
        genres: string[]
        actors: string[]
        url: string
      }> = []

      const cards = document.querySelectorAll('.mdl-style-list .box, .list-item, .trending-item')
      let rank = 1

      cards.forEach((card) => {
        if (rank > 20) return
        const titleEl = card.querySelector('h6 a, .title a, a.title')
        const title = titleEl?.textContent?.trim()
        if (!title) return

        const href = (titleEl as HTMLAnchorElement)?.href ?? ''
        const ratingEl = card.querySelector('.score, .rating')
        const rating = parseFloat(ratingEl?.textContent?.replace(/[^0-9.]/g, '') ?? '0') || 0
        const genres: string[] = []
        const actors: string[] = []

        results.push({ rank, title, year: undefined, rating, votes: 0, episodes: undefined, genres, actors, url: href })
        rank++
      })

      return results
    })

    return entries
  } catch (err) {
    console.error(`[MDL] 트렌딩 크롤링 실패:`, err)
    return []
  }
}

// ============================================================
// 메인 크롤링 함수
// ============================================================

export async function crawlMyDramaList(options: {
  includeTrending?: boolean
  remoteDebugPort?: number
} = {}): Promise<MyDramaListEntry[]> {
  const { includeTrending = true, remoteDebugPort } = options

  const browser = await getMDLBrowser(remoteDebugPort)
  const page = await browser.newPage()

  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  })

  const allEntries: MyDramaListEntry[] = []

  try {
    const top = await crawlTopDramas(page)
    allEntries.push(...top)

    if (includeTrending) {
      await new Promise(r => setTimeout(r, 1500))
      const trending = await crawlTrendingDramas(page)
      // 중복 제거 (제목 기준)
      const existingTitles = new Set(allEntries.map(e => e.title.toLowerCase()))
      const newTrending = trending.filter(e => !existingTitles.has(e.title.toLowerCase()))
      allEntries.push(...newTrending)
    }
  } finally {
    await page.close()
    if (!remoteDebugPort) await browser.close()
  }

  console.log(`[MDL] 총 ${allEntries.length}개 드라마 수집 완료`)
  return allEntries
}
