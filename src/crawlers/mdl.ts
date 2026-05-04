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

// ── 단일 페이지 리뷰 파싱 (page.evaluate 본체 — Playwright tsx 호환을 위해 화살표 함수 사용 X) ──
async function parseReviewPage(page: Page): Promise<MdlReview[]> {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.review'))
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
  })
}

// ── Native Title 추출 (한국어 원제) ──
async function extractNativeTitle(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const lis = Array.from(document.querySelectorAll('.list-item'))
    for (let i = 0; i < lis.length; i++) {
      const li = lis[i]
      const b = li.querySelector('b')
      const label = b && b.textContent ? b.textContent.trim() : ''
      if (/^Native Title:?$/i.test(label)) {
        const value = (li.textContent || '').replace(label, '').trim()
        return value || undefined
      }
    }
    return undefined
  })
}

// ── 페이지네이션 적용 리뷰 수집 (?page=N 순회, 누적, max 도달 시 종료) ──
async function fetchDramaReviews(page: Page, dramaUrl: string, max: number): Promise<{ reviews: MdlReview[]; nativeTitle?: string }> {
  const mainUrl = dramaUrl.replace(/\/$/, '')
  const baseUrl = mainUrl + '/reviews'
  const seenSig = new Set<string>()
  const all: MdlReview[] = []
  let nativeTitle: string | undefined
  const MAX_PAGES = 12  // 안전 cap (페이지당 5개 가정 시 60개)

  // STEP 0: 메인 drama 페이지에서 nativeTitle 추출 (사이드바 메타데이터)
  // /reviews 서브페이지에는 Native Title 필드가 없으므로 메인 페이지 별도 방문 필요
  try {
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await waitForCloudflareIfNeeded(page)
    nativeTitle = await extractNativeTitle(page)
  } catch (e) {
    console.warn(`  [MDL] 메인 페이지 로드 실패 (nativeTitle 누락):`, (e as Error).message)
  }

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await waitForCloudflareIfNeeded(page)
      await page.waitForSelector('.review', { timeout: 15000 }).catch(() => {})
    } catch (e) {
      console.warn(`  [MDL] page=${pageNum} 로드 실패:`, (e as Error).message)
      break
    }

    const pageReviews = await parseReviewPage(page)
    if (pageReviews.length === 0) break  // 더 이상 리뷰 없음

    let added = 0
    for (const rev of pageReviews) {
      // 중복 검출 (username + body 앞 80자)
      const sig = `${rev.username}|${(rev.body || '').slice(0, 80)}`
      if (seenSig.has(sig)) continue
      seenSig.add(sig)
      all.push(rev)
      added++
      if (all.length >= max) break
    }

    if (added === 0) break  // 같은 페이지가 반복되면 (페이지네이션 끝) 종료
    if (all.length >= max) break

    await page.waitForTimeout(800)  // 페이지 간 rate limit 보호
  }

  return { reviews: all, nativeTitle }
}

// ── 메인: top airing K-드라마 N개 + 각각 리뷰 수집 ──────────
// ── 제목만 가벼이 추출 (popular / top 페이지) ──────────────────
// 사전 매칭(buildKnownDramaPattern)용. 리뷰·평점 등 부가 데이터 미수집 → 빠름.
// URL 후보:
//   /shows/popular        — 현재 인기작 (한국 드라마만 필터링)
//   /shows/top            — 전체 평점 TOP
//   /shows/top_korea      — 한국 한정 평점 TOP
async function fetchKoreanDramaTitlesFromList(page: Page, listUrl: string, topN: number): Promise<string[]> {
  await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await waitForCloudflareIfNeeded(page)
  await page.waitForSelector('.box', { timeout: 30000 })

  return page.evaluate(({ topN }) => {
    const cards = Array.from(document.querySelectorAll('.box'))
    const out: string[] = []
    const dramaHrefRe = /^\/\d+-/

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i]
      const text = c.textContent ? c.textContent.replace(/\s+/g, ' ') : ''
      // Korean Drama / Korean Movie / Korean Special 모두 포함
      if (!/Korean (Drama|Movie|Special|Series|TV)/i.test(text)) continue

      const allLinks = c.querySelectorAll('a[href]')
      let linkEl: Element | null = null
      for (let j = 0; j < allLinks.length; j++) {
        const h = allLinks[j].getAttribute('href') || ''
        if (dramaHrefRe.test(h)) { linkEl = allLinks[j]; break }
      }
      if (!linkEl) continue

      const titleText = linkEl.textContent ? linkEl.textContent.trim() : ''
      const titleAttr = linkEl.getAttribute('title') || ''
      const posterImg = c.querySelector('img')
      const altText = posterImg ? (posterImg.getAttribute('alt') || '') : ''
      const title = titleText || titleAttr || altText
      if (title && title.length >= 2 && title.length <= 80) {
        out.push(title)
      }
      if (out.length >= topN) break
    }
    return out
  }, { topN })
}

// 한국 인기·TOP 작품 제목 일괄 수집 (사전 자동 갱신용).
// popular + top_korea 두 페이지 합집합 → dedup. 각 페이지 ~50개 → 합쳐서 ~70~100개.
export async function crawlMdlPopularTitles(topN: number = 50): Promise<string[]> {
  const browser: Browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
    })
    const page = await context.newPage()

    const URLS = [
      `${BASE_URL}/shows/popular`,
      `${BASE_URL}/shows/top_korea`,
    ]
    const seen = new Set<string>()
    const out: string[] = []
    for (const url of URLS) {
      try {
        const titles = await fetchKoreanDramaTitlesFromList(page, url, topN)
        for (const t of titles) {
          const key = t.trim().toLowerCase()
          if (!key || seen.has(key)) continue
          seen.add(key)
          out.push(t.trim())
        }
        console.log(`  [MDL-popular] ${url.split('/').pop()}: +${titles.length}개`)
        await page.waitForTimeout(600)
      } catch (e) {
        console.warn(`  [MDL-popular] ${url} 실패:`, (e as Error).message)
      }
    }
    console.log(`  [MDL-popular] 총 unique ${out.length}개 제목 수집`)
    return out
  } finally {
    await browser.close()
  }
}

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
        const result = await fetchDramaReviews(page, m.url, reviewsPerDrama)
        console.log(`  [MDL] ${m.title}: 리뷰 ${result.reviews.length}개${result.nativeTitle ? ` · 원제 "${result.nativeTitle}"` : ''}`)
        dramas.push({ ...m, reviews: result.reviews, nativeTitle: result.nativeTitle } as MdlDrama)
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
