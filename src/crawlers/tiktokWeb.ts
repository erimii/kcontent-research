// ============================================================
// TikTok Web 크롤러 (Playwright + 사용자 cookie)
//   * 사용자 cookie (~/Desktop/secret/001/tiktok-cookies.json) → Playwright 세션
//   * https://www.tiktok.com/tag/<tag> → 그리드 영상 URL 수집 → 상세 페이지 og:description으로 caption/like/comment 확보
//   * 카테고리당 max 4 영상 (보수적 cap — DataDome/Akamai 회피)
//   * 첫 차단 감지 시 30분 lockout (TikTok 전용 상태, Instagram과 분리)
//   * 같은 cookie 파일을 기존 API 라이브러리 크롤러 (`crawlTiktokBuzz`)와 공유
// ============================================================

import fs from 'fs'
import os from 'os'
import path from 'path'
import { chromium, type BrowserContext, type Page, type Cookie } from 'playwright'
import type {
  TikTokVideo, TikTokAuthor, TikTokComment, TikTokChannelType,
} from '../types/index.js'
import {
  hasKContentMarker, classifyChannelType, extractHashtags, NON_NA_REGIONAL_OFFICIAL_RE,
} from './tiktok.js'

// ── 정책 상수 ──────────────────────────────────────────────
const MAX_VIDEOS_PER_CATEGORY = 4
const TAG_PAGE_WAIT_MS = 4000
const VIDEO_DETAIL_WAIT_MS = 2800
const ITEM_TRANSITION_WAIT_MS = 1500
const MAX_VIDEO_CANDIDATES_PER_TAG = 12
const MAX_DETAIL_TRIES_PER_CATEGORY = 10
const MAX_COMMENT_LINES_TO_KEEP = 3
const LOCKOUT_DURATION_MS = 30 * 60 * 1000

// 카테고리는 Instagram 트랙과 동일 분류 (드라마/영화/예능)
type Category = 'kdrama' | 'kmovie' | 'kvariety'
const TAG_GROUPS: Record<Category, string[]> = {
  kdrama: ['kdrama', 'koreandrama', 'kdramaedit', 'kdramaclip'],
  kmovie: ['koreanmovie', 'kmovie', 'koreanfilm'],
  kvariety: ['kvariety', 'koreanvariety', 'kvarietyshow', 'koreanvarietyshow'],
}
const ALL_CATEGORIES: Category[] = ['kdrama', 'kmovie', 'kvariety']

// TikTok web 그리드 영상 링크: /@username/video/<id>
const VIDEO_LINK_SELECTOR = 'a[href*="/video/"]'

// ── 쿠키 로드 (TikTok cookie 재사용) ───────────────────────
const COOKIE_PATH = path.join(os.homedir(), 'Desktop/secret/001/tiktok-cookies.json')
let cookieCache: { mtime: number; cookies: Cookie[] } | null = null

function mapSameSite(raw: unknown): 'Strict' | 'Lax' | 'None' {
  if (raw === 'Strict' || raw === 'strict') return 'Strict'
  if (raw === 'None' || raw === 'no_restriction' || raw === 'unspecified') return 'None'
  return 'Lax'
}

function normalizeCookies(raw: any[]): Cookie[] {
  const out: Cookie[] = []
  for (const c of raw) {
    if (!c?.name || c.value == null) continue
    const exp = (typeof c.expirationDate === 'number' && c.expirationDate > 0) ? c.expirationDate
              : (typeof c.expires === 'number' && c.expires > 0) ? c.expires
              : -1
    out.push({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain || '.tiktok.com'),
      path: String(c.path || '/'),
      expires: exp,
      httpOnly: Boolean(c.httpOnly),
      secure: c.secure !== false,
      sameSite: mapSameSite(c.sameSite),
    })
  }
  return out
}

function loadTiktokCookies(): Cookie[] | null {
  try {
    if (!fs.existsSync(COOKIE_PATH)) {
      console.warn(`[TikTokWeb] 쿠키 파일 없음: ${COOKIE_PATH}`)
      return null
    }
    const stat = fs.statSync(COOKIE_PATH)
    const mtime = stat.mtimeMs
    if (cookieCache && cookieCache.mtime === mtime) return cookieCache.cookies
    const raw = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    if (!Array.isArray(raw)) {
      console.warn('[TikTokWeb] 쿠키 파일 형식 이상 (배열이 아님)')
      return null
    }
    const cookies = normalizeCookies(raw)
    const hasSession = cookies.some((c) => c.name === 'sessionid' && c.value)
    if (!hasSession) {
      console.warn('[TikTokWeb] sessionid 쿠키 없음 → 로그인 세션 아님')
      return null
    }
    cookieCache = { mtime, cookies }
    console.log(`[TikTokWeb] 쿠키 로드: ${cookies.length}개 (mtime=${new Date(mtime).toISOString()})`)
    return cookies
  } catch (e) {
    console.warn(`[TikTokWeb] 쿠키 로드 실패: ${(e as Error).message}`)
    return null
  }
}

// ── lockout (TikTok 전용 상태) ─────────────────────────────
let lockoutUntilMs = 0
function isLockedOut(): boolean { return Date.now() < lockoutUntilMs }
function lockoutRemainingMs(): number { return Math.max(0, lockoutUntilMs - Date.now()) }
function triggerLockout(reason: string) {
  lockoutUntilMs = Date.now() + LOCKOUT_DURATION_MS
  console.warn(`[TikTokWeb] 차단 시그널 → 30분 lockout (until ${new Date(lockoutUntilMs).toISOString()}). reason=${reason}`)
}

// ── 카테고리 룰 (Instagram과 동일 정책) ────────────────────
function categoryRulePass(category: Category, haystack: string): boolean {
  const lower = haystack.toLowerCase()
  if (category === 'kdrama') {
    return !['movie', 'film', 'cinema', 'theater', 'screening'].some((k) => lower.includes(k))
  }
  if (category === 'kmovie') {
    return ['movie', 'film', 'cinema', 'theater', 'screening'].some((k) => lower.includes(k))
  }
  if (category === 'kvariety') {
    return ['variety', 'show', 'reality', 'runningman', 'running man',
            'physical100', 'physical 100', 'singles inferno', 'hangout with yoo']
      .some((k) => lower.includes(k))
  }
  return true
}

// ── compact count parse ("1.2K", "3M") ─────────────────────
function parseCompactCount(raw: string): number {
  const n = raw.trim().replace(/,/g, '')
  const m = n.match(/^(\d+(?:\.\d+)?)\s*([kKmMbB])?$/)
  if (!m) return 0
  let v = parseFloat(m[1])
  const sfx = (m[2] || '').toLowerCase()
  if (sfx === 'k') v *= 1_000
  else if (sfx === 'm') v *= 1_000_000
  else if (sfx === 'b') v *= 1_000_000_000
  return Math.floor(v)
}

// URL `/@user/video/123` → { username, videoId }
function parseTiktokVideoUrl(url: string): { username: string; videoId: string } {
  const m = url.match(/tiktok\.com\/@([^/?#]+)\/video\/(\d+)/)
  if (!m) return { username: '', videoId: '' }
  return { username: m[1], videoId: m[2] }
}

// ── Tag 페이지 그리드에서 영상 URL 수집 ────────────────────
async function extractVideoCardsFromTagPage(page: Page): Promise<{ url: string }[]> {
  // lazy-render 트리거: 두 번 스크롤
  await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {})
  await page.waitForTimeout(700)
  await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {})
  await page.waitForTimeout(700)

  return page.evaluate((sel) => {
    const anchors = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[]
    const seen = new Set<string>()
    const result: { url: string }[] = []
    for (const a of anchors) {
      const href = a.getAttribute('href') || ''
      // /@username/video/<id> 패턴만 (외부/내부 상관없이)
      if (!/\/@[^/]+\/video\/\d+/.test(href)) continue
      const url = a.href
      if (!url || seen.has(url)) continue
      seen.add(url)
      result.push({ url })
      if (result.length >= 24) break
    }
    return result
  }, VIDEO_LINK_SELECTOR)
}

// ── Detail 페이지 og 메타 + body 댓글 ──────────────────────
const HANDLE_RE = /^[A-Za-z0-9._]{3,}$/
const RELATIVE_TIME_RE = /^\d+\s*[smhdwy]$|^\d+[smhdwy]$|^\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago$/

function extractCommentsFromBodyText(body: string): { author: string; text: string }[] {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const out: { author: string; text: string }[] = []
  const seen = new Set<string>()
  for (let i = 8; i < lines.length - 2; i++) {
    const author = lines[i]
    const maybeTime = lines[i + 1]
    const text = lines[i + 2]
    if (!HANDLE_RE.test(author)) continue
    if (!RELATIVE_TIME_RE.test(maybeTime.toLowerCase())) continue
    if (!text || text.length < 2) continue
    if (['Like', 'Reply', 'Follow', 'View replies', 'Original sound', 'Pinned'].includes(text)) continue
    if (text.startsWith('#') && !text.includes(' ')) continue
    const key = `${author}::${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ author, text })
    if (out.length >= MAX_COMMENT_LINES_TO_KEEP) break
  }
  return out
}

interface VideoDetailScrape {
  loginWall: boolean
  caption: string
  likeCount: number
  commentCount: number
  shareCount: number
  authorFromOg: string
  cover: string
  comments: { author: string; text: string }[]
}

async function scrapeVideoDetail(page: Page, videoUrl: string): Promise<VideoDetailScrape> {
  await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(VIDEO_DETAIL_WAIT_MS)

  const finalUrl = page.url()
  if (finalUrl.includes('/login') || finalUrl.includes('captcha') || finalUrl.includes('verify')) {
    return { loginWall: true, caption: '', likeCount: 0, commentCount: 0, shareCount: 0, authorFromOg: '', cover: '', comments: [] }
  }

  const meta = await page.evaluate(() => {
    const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
    const image = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || ''
    return { desc, title, image }
  }).catch(() => ({ desc: '', title: '', image: '' }))

  let body = ''
  try { body = await page.locator('body').innerText({ timeout: 5000 }) } catch {}

  // body에 명시적 차단 시그널 (DataDome, captcha)
  if (/please verify|captcha|too many requests|robot/i.test(body) && body.length < 1500) {
    return { loginWall: true, caption: '', likeCount: 0, commentCount: 0, shareCount: 0, authorFromOg: '', cover: '', comments: [] }
  }

  // og:title 형식 — TikTok는 주로 "username on TikTok" 또는 caption 직접
  let authorFromOg = ''
  const titleMatch = meta.title.match(/^(.+?) on TikTok/i)
  if (titleMatch) authorFromOg = titleMatch[1].trim()

  // og:description에서 caption + like/comment/share 카운트 추출
  // 형식 예: "13.5M Likes, 65.6K Comments. TikTok video from username (@user): "caption text"."
  let caption = ''
  const capQuote = meta.desc.match(/:\s*[""]([\s\S]+?)[""]\s*\.?\s*$/)
  if (capQuote) caption = capQuote[1]
  else caption = meta.desc.replace(/^[\d.,KMBkmb\s]+(Likes?|Comments?|Shares?)[^.]*\.\s*/i, '').trim()

  const likeMatch = meta.desc.match(/([\d,.]+\s*[KMBkmb]?)\s*Likes?/i)
  const commentMatch = meta.desc.match(/([\d,.]+\s*[KMBkmb]?)\s*Comments?/i)
  const shareMatch = meta.desc.match(/([\d,.]+\s*[KMBkmb]?)\s*Shares?/i)

  const likeCount = likeMatch ? parseCompactCount(likeMatch[1]) : 0
  const commentCount = commentMatch ? parseCompactCount(commentMatch[1]) : 0
  const shareCount = shareMatch ? parseCompactCount(shareMatch[1]) : 0

  const comments = extractCommentsFromBodyText(body)

  return {
    loginWall: false,
    caption: caption.slice(0, 800),
    likeCount,
    commentCount,
    shareCount,
    authorFromOg,
    cover: meta.image,
    comments,
  }
}

// ── 메인 크롤러 ───────────────────────────────────────────
export interface TiktokWebCrawlResult {
  videos: TikTokVideo[]
  searchedKeywords: string[]
  warnings: string[]
  lockedOut: boolean
  lockoutRemainingMs: number
}

export async function crawlTiktokWebBuzz(): Promise<TiktokWebCrawlResult> {
  const warnings: string[] = []

  if (isLockedOut()) {
    const remaining = lockoutRemainingMs()
    return {
      videos: [], searchedKeywords: [],
      warnings: [`TikTok 30분 lockout 중 (남은 ${Math.ceil(remaining / 60000)}분)`],
      lockedOut: true, lockoutRemainingMs: remaining,
    }
  }

  const cookies = loadTiktokCookies()
  if (!cookies) {
    return {
      videos: [], searchedKeywords: [],
      warnings: ['TikTok 쿠키 파일 없음 또는 sessionid 누락 — 본인 Chrome에서 로그인 후 쿠키 재추출 필요'],
      lockedOut: false, lockoutRemainingMs: 0,
    }
  }

  console.log('  [TikTokWeb] Playwright chromium 시작…')
  const browser = await chromium.launch({ headless: true })
  let context: BrowserContext | null = null
  const videos: TikTokVideo[] = []
  const seenUrls = new Set<string>()
  const searchedKeywords: string[] = []

  try {
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                 '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    })
    await context.addCookies(cookies)
    const page = await context.newPage()

    for (const category of ALL_CATEGORIES) {
      let collectedThisCategory = 0
      type Candidate = { url: string; tag: string }
      const candidates: Candidate[] = []
      const seenInCategory = new Set<string>()

      for (const tag of TAG_GROUPS[category]) {
        const tagUrl = `https://www.tiktok.com/tag/${tag}`
        searchedKeywords.push(tag)
        try {
          await page.goto(tagUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
          await page.waitForTimeout(TAG_PAGE_WAIT_MS)
        } catch (e) {
          warnings.push(`tag ${tag} navigation 실패: ${(e as Error).message}`)
          continue
        }

        const cur = page.url()
        if (cur.includes('/login') || cur.includes('captcha') || cur.includes('verify')) {
          triggerLockout(`tag page redirected to ${cur}`)
          warnings.push('TikTok 차단 wall 감지 → 30분 lockout 진입')
          return {
            videos, searchedKeywords, warnings,
            lockedOut: true, lockoutRemainingMs: lockoutRemainingMs(),
          }
        }

        const allCards = await extractVideoCardsFromTagPage(page)
        const cards = allCards.slice(0, MAX_VIDEO_CANDIDATES_PER_TAG)
        console.log(`  [TikTokWeb] tag #${tag}: ${allCards.length}개 카드 발견 (URL=${cur})`)
        if (cards.length === 0) {
          warnings.push(`tag ${tag}: 영상 카드 0개 (페이지 비어있음)`)
          continue
        }

        for (const c of cards) {
          if (!c.url || seenUrls.has(c.url) || seenInCategory.has(c.url)) continue
          seenInCategory.add(c.url)
          candidates.push({ url: c.url, tag })
        }
      }

      // detail 페이지 순회 (카테고리당 budget cap)
      let tries = 0
      for (const cand of candidates) {
        if (collectedThisCategory >= MAX_VIDEOS_PER_CATEGORY) break
        if (tries >= MAX_DETAIL_TRIES_PER_CATEGORY) break
        tries++

        let detail: VideoDetailScrape
        try {
          detail = await scrapeVideoDetail(page, cand.url)
        } catch (e) {
          warnings.push(`detail 실패 (${cand.url}): ${(e as Error).message}`)
          continue
        }
        if (detail.loginWall) {
          triggerLockout('detail page redirected to login/captcha/verify')
          warnings.push('TikTok detail 페이지에서 차단 wall → 30분 lockout 진입')
          return {
            videos, searchedKeywords, warnings,
            lockedOut: true, lockoutRemainingMs: lockoutRemainingMs(),
          }
        }

        const caption = detail.caption || ''
        if (!caption) continue

        const { username, videoId } = parseTiktokVideoUrl(cand.url)
        const author = detail.authorFromOg || username || 'tiktok_creator'
        const hashtags = extractHashtags(caption)
        const channelMeta = `${author} ${username}`

        // K-content 필터 (기존 tiktok.ts 정책 그대로)
        if (NON_NA_REGIONAL_OFFICIAL_RE.test(channelMeta)) continue
        if (!hasKContentMarker(caption, channelMeta, hashtags, '')) continue
        if (!categoryRulePass(category, `${cand.tag} ${caption}`)) continue

        const channelType: TikTokChannelType = classifyChannelType(author, username, '')

        const comments: TikTokComment[] = detail.comments.length > 0
          ? detail.comments.map((c, idx) => ({
              text: c.text.slice(0, 800),
              author: c.author,
              likes: Math.max(0, 40 - idx * 8),
            }))
          : []

        const tiktokAuthor: TikTokAuthor = {
          id: '',
          uniqueId: username,
          nickname: detail.authorFromOg || username,
          avatar: undefined,
          verified: false,
        }

        const v: TikTokVideo = {
          id: videoId || cand.url,
          description: caption,
          url: cand.url,
          cover: detail.cover || undefined,
          duration: 0,
          views: detail.likeCount,            // web에서 view count는 일관성 부족 → like를 view proxy
          likes: detail.likeCount,
          shares: detail.shareCount,
          commentCount: detail.commentCount,
          saved: 0,
          publishedAt: '',
          author: tiktokAuthor,
          sound: undefined,
          comments,
          hashtags,
          channelType,
        }
        videos.push(v)
        seenUrls.add(cand.url)
        collectedThisCategory++

        await page.waitForTimeout(ITEM_TRANSITION_WAIT_MS)
      }

      console.log(`  [TikTokWeb] category=${category}: ${collectedThisCategory}/${MAX_VIDEOS_PER_CATEGORY} 수집 (detail tries=${tries}/${candidates.length})`)
    }
  } catch (e) {
    warnings.push(`TikTok web 크롤 예외: ${(e as Error).message}`)
  } finally {
    try { if (context) await context.close() } catch {}
    try { await browser.close() } catch {}
  }

  console.log(`  [TikTokWeb] 총 ${videos.length}개 영상 수집 (검색 태그 ${searchedKeywords.length}개, 경고 ${warnings.length}건)`)
  return {
    videos,
    searchedKeywords,
    warnings,
    lockedOut: false,
    lockoutRemainingMs: 0,
  }
}
