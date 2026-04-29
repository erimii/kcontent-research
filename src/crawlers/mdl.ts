// ============================================================
// MyDramaList (MDL) 크롤러 - Playwright 기반
// - top_airing 페이지에서 한국 드라마 TOP N 추출
// - 각 드라마의 리뷰 페이지에서 상위 리뷰 N개 수집
// - Cloudflare 봇 challenge가 있을 수 있으므로 도메인-콘텐츠 대기 로직 포함
// ============================================================

import { chromium, type Browser, type Page } from 'playwright'
import type { MdlDrama, MdlReview, MdlReviewRatings } from '../types/index.js'

const BASE_URL = 'https://mydramalist.com'
const TOP_AIRING_URL = `${BASE_URL}/shows/top_airing`
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function waitForCloudflareIfNeeded(page: Page, maxSec = 25): Promise<void> {
  for (let i = 0; i < maxSec / 2; i++) {
    const t = await page.title().catch(() => '')
    if (!/Just a moment|Checking your browser|Attention Required/i.test(t)) return
    await page.waitForTimeout(2000)
  }
}

// ── 한국 드라마 TOP N 메타데이터 ────────────────────────────
async function fetchTopKoreanDramas(page: Page, topN: number): Promise<Pick<MdlDrama, 'slug' | 'title' | 'url' | 'rating' | 'posterUrl' | 'episodes' | 'year' | 'description'>[]> {
  await page.goto(TOP_AIRING_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForCloudflareIfNeeded(page)
  await page.waitForSelector('.box', { timeout: 30000 })

  // tsx의 __name 헬퍼 주입을 피하려고 evaluate body에서 inner function/type 어노테이션 제거
  return page.evaluate(({ topN, base }) => {
    const cards = Array.from(document.querySelectorAll('.box'))
    const out: any[] = []
    const dramaHrefRe = /^\/\d+-/

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]
      const text = c.textContent ? c.textContent.replace(/\s+/g, ' ') : ''
      if (!/Korean Drama/i.test(text)) continue

      const allLinks = c.querySelectorAll('a[href]')
      let linkEl: Element | null = null
      for (let j = 0; j < allLinks.length; j++) {
        const h = allLinks[j].getAttribute('href') || ''
        if (dramaHrefRe.test(h)) { linkEl = allLinks[j]; break }
      }
      if (!linkEl) continue

      const href = linkEl.getAttribute('href') || ''
      const slug = href.replace(/^\/+/, '').split('/')[0]
      if (!slug) continue

      const ratingEl = c.querySelector('.score')
      const posterImg = c.querySelector('img')
      const yearMatch = text.match(/Korean Drama\s*-\s*(\d{4})/i)
      const epMatch = text.match(/(\d+)\s*episodes/i)

      const rating = parseFloat((ratingEl && ratingEl.textContent ? ratingEl.textContent.trim() : '') || '0')
      const idx = text.indexOf(String(rating))
      const description = idx >= 0 ? text.slice(idx + String(rating).length).trim().slice(0, 350) : ''

      const titleText = linkEl.textContent ? linkEl.textContent.trim() : ''
      const titleAttr = linkEl.getAttribute('title') || ''
      const altText = posterImg ? (posterImg.getAttribute('alt') || '') : ''
      const title = titleText || titleAttr || altText || slug.replace(/^\d+-/, '').replace(/-/g, ' ')

      const posterUrl = posterImg ? (posterImg.getAttribute('data-src') || posterImg.getAttribute('src') || undefined) : undefined

      out.push({
        slug,
        title,
        url: base + href,
        rating,
        posterUrl,
        year: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
        episodes: epMatch ? parseInt(epMatch[1], 10) : undefined,
        description,
      })
      if (out.length >= topN) break
    }
    return out
  }, { topN, base: BASE_URL })
}

// ── 단일 드라마 리뷰 추출 ──────────────────────────────────
async function fetchDramaReviews(page: Page, dramaUrl: string, max: number): Promise<MdlReview[]> {
  const reviewsUrl = dramaUrl.replace(/\/$/, '') + '/reviews'
  await page.goto(reviewsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForCloudflareIfNeeded(page)
  await page.waitForSelector('.review', { timeout: 20000 }).catch(() => {})

  return page.evaluate((max) => {
    const items = Array.from(document.querySelectorAll('.review')).slice(0, max)
    const out: any[] = []
    for (let i = 0; i < items.length; i++) {
      const r = items[i]
      const fullText = r.textContent ? r.textContent.replace(/\s+/g, ' ') : ''

      const userEl = r.querySelector('a[href*="/profile/"]')
      const helpfulMatch = fullText.match(/(\d+)\s*people\s*found\s*this\s*review\s*helpful/i)
      const statusEl = r.querySelector('.review-tag')
      const epMatch = fullText.match(/(\d+)\s*of\s*(\d+)\s*episodes\s*seen/i)
      const daysMatch = fullText.match(/(\d+\s*(?:day|days|week|weeks|month|months|year|years)\s*ago)/i)

      const overallM = fullText.match(/Overall\s*([\d.]+)/i)
      const storyM = fullText.match(/Story\s*([\d.]+)/i)
      const actingM = fullText.match(/Acting\/Cast\s*([\d.]+)/i)
      const musicM = fullText.match(/Music\s*([\d.]+)/i)
      const rewatchM = fullText.match(/Rewatch Value\s*([\d.]+)/i)

      const blocks = Array.from(r.querySelectorAll('div, p'))
      let body = ''
      for (let j = 0; j < blocks.length; j++) {
        const t = blocks[j].textContent ? blocks[j].textContent!.replace(/\s+/g, ' ').trim() : ''
        if (t.length <= 80) continue
        if (/Overall\s*[\d.]+\s*Story\s*[\d.]+/.test(t)) {
          const after = t.split(/Rewatch Value\s*[\d.]+/)[1]
          if (after && after.length > body.length) body = after.trim()
        } else if (t.length > body.length) {
          body = t
        }
      }
      if (body.length < 30) continue

      out.push({
        username: userEl && userEl.textContent ? userEl.textContent.trim() : 'anon',
        helpful: helpfulMatch ? parseInt(helpfulMatch[1], 10) : 0,
        ratings: {
          overall: overallM ? parseFloat(overallM[1]) : 0,
          story: storyM ? parseFloat(storyM[1]) : undefined,
          acting: actingM ? parseFloat(actingM[1]) : undefined,
          music: musicM ? parseFloat(musicM[1]) : undefined,
          rewatch: rewatchM ? parseFloat(rewatchM[1]) : undefined,
        },
        status: statusEl && statusEl.textContent ? statusEl.textContent.trim() : undefined,
        episodesWatched: epMatch ? epMatch[1] + '/' + epMatch[2] : undefined,
        daysAgo: daysMatch ? daysMatch[1] : undefined,
        body: body.length > 1500 ? body.slice(0, 1500) + '…' : body,
      })
    }
    return out
  }, max)
}

// ── 메인: top airing K-드라마 N개 + 각각 리뷰 수집 ──────────
export async function crawlMdlTopAiring(
  options: { topN?: number; reviewsPerDrama?: number } = {}
): Promise<MdlDrama[]> {
  const { topN = 5, reviewsPerDrama = 5 } = options

  const browser: Browser = await chromium.launch({ headless: true })
  const dramas: MdlDrama[] = []

  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    })
    const page = await context.newPage()

    console.log('[MDL] Top airing 페이지 수집 중...')
    const meta = await fetchTopKoreanDramas(page, topN)
    console.log(`[MDL] 한국 드라마 ${meta.length}개 발견`)

    for (const m of meta) {
      try {
        console.log(`  [MDL] r/${m.slug} 리뷰 수집 중...`)
        const reviews = await fetchDramaReviews(page, m.url, reviewsPerDrama)
        console.log(`  [MDL] ${m.title}: 리뷰 ${reviews.length}개`)
        dramas.push({ ...m, reviews } as MdlDrama)
        // rate-limit 보호
        await page.waitForTimeout(800)
      } catch (e) {
        console.warn(`  [MDL] ${m.title} 리뷰 실패:`, (e as Error).message)
        dramas.push({ ...m, reviews: [] } as MdlDrama)
      }
    }
  } finally {
    await browser.close()
  }

  return dramas
}
