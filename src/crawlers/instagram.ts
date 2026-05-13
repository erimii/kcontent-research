// ============================================================
// Instagram SNS 버즈 크롤러 (Reel 기반)
//   * 사용자 쿠키 (~/Desktop/secret/001/instagram-cookies.json) → Playwright 세션
//   * 카테고리별 hashtag 페이지 → Reel 카드 추출 → 상세 페이지 댓글 best-effort
//   * 카테고리당 max 2 Reel (봇 탐지 리스크 완화)
//   * 첫 차단 감지 시 30분 lockout
// ============================================================

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { chromium, type BrowserContext, type Page, type Cookie } from 'playwright'
import type {
  InstagramReel, InstagramComment, InstagramAuthor,
  InstagramChannelType, InstagramCategory,
} from '../types/index.js'
import { KNOWN_ACTORS_STATIC, KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'

// ── 결과·실행 정책 상수 ────────────────────────────────────
const MAX_REELS_PER_HASHTAG = 5            // 사용자 요청 #4: hashtag당 score top 5
const MAX_DETAIL_TRIES_PER_HASHTAG = 12    // 12 후보 모두 detail 받아 score 정렬
const MAX_REEL_AGE_DAYS = 60               // 최근 60일 이내
const GLOBAL_TOP_K = 10                    // 사용자 요청 #4: 글로벌 top 10
const DEEP_CRAWL_TOP_N = 3                 // 사용자 요청 #4: top 3만 deep
const DEEP_COMMENT_TARGET = 100            // reel당 댓글 100개 목표 (2026-05-12: 50 → 100, 실측 15개 그쳐서)
const DEEP_COMMENT_MAX_PAGES = 6           // GraphQL 페이지네이션 max 6페이지 (2026-05-12: 3 → 6, 스크롤 더 끈질기게)
const HASHTAG_PAGE_WAIT_MS = 3500
const REEL_DETAIL_WAIT_MS = 2500
const TAG_TRANSITION_WAIT_MS = 3500       // 2026-05-08: 1.2s → 3.5s (Instagram detail page throttle 회피)
const MAX_REEL_CANDIDATES_PER_TAG = 16
const MAX_COMMENT_LINES_TO_KEEP = 3
const LOCKOUT_DURATION_MS = 30 * 60 * 1000  // 사용자 결정 D1
// Instagram tag 페이지의 grid 카드는 /p/<shortcode>/ 또는 /reel/<shortcode>/ 둘 중 하나로 링크됨
const POST_OR_REEL_SELECTOR = 'a[href*="/p/"], a[href*="/reel/"]'

// ── 카테고리 → hashtag 매핑 ───────────────────────────────
// 2026-05-08: 사용자 요청 — K-드라마 단일 카테고리로 7개 hashtag 집중
const TAG_GROUPS: Record<InstagramCategory, string[]> = {
  kdrama: [
    'kdrama',
    'koreandrama',
    'netflixkdrama',
    'kdramareview',
    'kdramareaction',
    'kdramaclip',
    'kdramashorts',
  ],
  kmovie: [],     // 비활성 (필요 시 다시 채움)
  kvariety: [],   // 비활성 (필요 시 다시 채움)
}
const ALL_CATEGORIES: InstagramCategory[] = ['kdrama']

// ── 캡처 디렉토리 ────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTURE_DIR_FS = path.join(__dirname, '..', '..', 'public', 'static', 'captures')
const CAPTURE_DIR_PUBLIC = '/static/captures'  // express에서 마운트된 경로
function ensureCaptureDir() {
  if (!fs.existsSync(CAPTURE_DIR_FS)) fs.mkdirSync(CAPTURE_DIR_FS, { recursive: true })
}

// ── 쿠키 로드 (TikTok 패턴 동형) ───────────────────────────
const COOKIE_PATH = path.join(os.homedir(), 'Desktop/secret/001/instagram-cookies.json')
let cookieCache: { mtime: number; cookies: Cookie[] } | null = null

// Chrome devtools / EditThisCookie export 포맷 → Playwright sameSite 매핑
function mapSameSite(raw: unknown): 'Strict' | 'Lax' | 'None' {
  if (raw === 'Strict' || raw === 'strict') return 'Strict'
  if (raw === 'None' || raw === 'no_restriction' || raw === 'unspecified') return 'None'
  return 'Lax'
}

function normalizeCookies(raw: any[]): Cookie[] {
  const out: Cookie[] = []
  for (const c of raw) {
    if (!c?.name || c.value == null) continue
    // Chrome export는 expirationDate(소수점 sec), TikTok 포맷은 expires(integer sec) 둘 다 허용
    const exp = (typeof c.expirationDate === 'number' && c.expirationDate > 0) ? c.expirationDate
              : (typeof c.expires === 'number' && c.expires > 0) ? c.expires
              : -1
    const cookie: Cookie = {
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain || '.instagram.com'),
      path: String(c.path || '/'),
      expires: exp,
      httpOnly: Boolean(c.httpOnly),
      secure: c.secure !== false,
      sameSite: mapSameSite(c.sameSite),
    }
    out.push(cookie)
  }
  return out
}

export function loadInstagramCookies(): Cookie[] | null {
  try {
    if (!fs.existsSync(COOKIE_PATH)) {
      console.warn(`[Instagram] 쿠키 파일 없음: ${COOKIE_PATH}`)
      return null
    }
    const stat = fs.statSync(COOKIE_PATH)
    const mtime = stat.mtimeMs
    if (cookieCache && cookieCache.mtime === mtime) return cookieCache.cookies
    const raw = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    if (!Array.isArray(raw)) {
      console.warn('[Instagram] 쿠키 파일 형식 이상 (배열이 아님)')
      return null
    }
    const cookies = normalizeCookies(raw)
    const hasSession = cookies.some((c) => c.name === 'sessionid' && c.value)
    if (!hasSession) {
      console.warn('[Instagram] sessionid 쿠키 없음 → 로그인 세션 아님')
      return null
    }
    cookieCache = { mtime, cookies }
    console.log(`[Instagram] 쿠키 로드: ${cookies.length}개 (mtime=${new Date(mtime).toISOString()})`)
    return cookies
  } catch (e) {
    console.warn(`[Instagram] 쿠키 로드 실패: ${(e as Error).message}`)
    return null
  }
}

// ── 30분 lockout (모듈 레벨 상태) ──────────────────────────
let lockoutUntilMs = 0
export function isLockedOut(): boolean {
  return Date.now() < lockoutUntilMs
}
export function lockoutRemainingMs(): number {
  return Math.max(0, lockoutUntilMs - Date.now())
}
function triggerLockout(reason: string) {
  lockoutUntilMs = Date.now() + LOCKOUT_DURATION_MS
  console.warn(`[Instagram] 차단 시그널 감지 → 30분 lockout (until ${new Date(lockoutUntilMs).toISOString()}). reason=${reason}`)
}

// ── 채널 분류 (TikTok 패턴 적응) ──────────────────────────
const OFFICIAL_PATTERNS: RegExp[] = [
  /\bnetflix(\s|_)?(korea|asia|kr|kcontent)\b/i, /the swoon/i, /kocowa/i, /\bviki\b/i,
  /\bkbs( world)?\b/i, /\bsbs\b/i, /\bmbc\b/i, /\btvn\b/i, /\bjtbc\b/i, /\bena\b/i,
  /studio dragon/i, /\bcjenm\b/i, /\bcj enm\b/i,
]
const CREATOR_PATTERNS: RegExp[] = [
  /\bkdrama (review|recap|reaction|fan|news|tok|edit|life|world)/i,
  /\b(review|recap|reaction)\b.*?\bkdrama\b/i,
  /\bkdramatime\b/i, /\bkoreanaddict\b/i, /\bkdramaverse\b/i,
]
function classifyChannel(username: string, displayName: string): InstagramChannelType {
  const text = `${username} ${displayName}`
  if (OFFICIAL_PATTERNS.some((re) => re.test(text))) return 'official'
  if (CREATOR_PATTERNS.some((re) => re.test(text))) return 'creator'
  return 'community'
}

// ── 비-K 신호 (TikTok과 동일 강도) ─────────────────────────
const NON_K_DRAMA_RE = /\b(c-?drama|chinese drama|cdramatok|cdramaedit|cdramarecap|j-?drama|japanese drama|jdramatok|thai drama|t-?drama|tdramatok|taiwanese drama|filipino drama|pinoy drama|indian drama|turkish drama|donghua|xianxia|wuxia|cnovel|c-novel|tencent video|youku)\b/i
const NON_K_HASHTAG_RE = /^#?(c-?drama|chinesedrama|cdramatok|cdramaedit|cnovel|c-novel|chinese|chinesehistorical|xianxia|wuxia|donghua|j-?drama|japanesedrama|jdramatok|t-?drama|thaidrama|tdramatok|taiwanesedrama|filipino|pinoydrama|indiandrama|turkishdrama)/i
const HANZI_RE = /[一-鿿]/
const NON_NA_SCRIPT_RE = /[ऀ-ॿ؀-ۿЀ-ӿ฀-๿]/
const VIETNAMESE_RE = /[đĐơƠưƯấầẩẫậắằẳẵặếềểễệốồổỗộớờởỡợứừửữựýỳỷỹỵ]/
const HANGUL_RE = /[가-힣]/

const K_CONTENT_KEYWORDS = [
  /\b(korean|korea\b)/i, /\bk-?drama\b/i, /\bk-?variety\b/i, /\bk-?content\b/i,
  /\bhallyu\b/i, /\bkbs\b|\bsbs\b|\bmbc\b|\btvn\b|\bjtbc\b/i,
]
const K_HASHTAG_RE = /^#?k(drama|orean|netflix|content|wave|hallyu|variety)/i
const KNOWN_ACTOR_LOWER = new Set(KNOWN_ACTORS_STATIC.map((s) => s.toLowerCase()))
const KNOWN_DRAMA_LOWER = new Set(KNOWN_DRAMAS_STATIC.map((s) => s.toLowerCase()))

function hasKContentMarker(haystack: string, hashtags: string[]): boolean {
  if (NON_K_DRAMA_RE.test(haystack)) return false
  if (hashtags.some((h) => NON_K_HASHTAG_RE.test(h))) return false
  if (HANZI_RE.test(haystack)) return false
  if (NON_NA_SCRIPT_RE.test(haystack)) return false
  if (VIETNAMESE_RE.test(haystack)) return false

  if (HANGUL_RE.test(haystack)) return true
  if (K_CONTENT_KEYWORDS.some((re) => re.test(haystack))) return true
  if (hashtags.some((h) => K_HASHTAG_RE.test(h))) return true
  const lower = haystack.toLowerCase()
  for (const a of KNOWN_ACTOR_LOWER) if (a.length >= 6 && lower.includes(a)) return true
  for (const d of KNOWN_DRAMA_LOWER) if (d.length >= 5 && lower.includes(d)) return true
  return false
}

// ── 카테고리별 추가 룰 (명세) ──────────────────────────────
function categoryRulePass(category: InstagramCategory, haystack: string): boolean {
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

function extractHashtags(text: string): string[] {
  return (text.match(/#[\w가-힣]+/g) || []).map((s) => s.toLowerCase())
}

function parseCompactCount(raw: string): number {
  const n = raw.trim().replace(/,/g, '')
  const m = n.match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/)
  if (!m) return 0
  let v = parseFloat(m[1])
  const sfx = (m[2] || '').toLowerCase()
  if (sfx === 'k') v *= 1_000
  else if (sfx === 'm') v *= 1_000_000
  return Math.floor(v)
}

function shortcodeFromAny(url: string): string {
  const m = url.match(/\/(?:reel|p)\/([^/?#]+)/)
  return m ? m[1] : ''
}

// ── Reel 상세 페이지 댓글 추출 (best-effort) ────────────────
const HANDLE_RE = /^[A-Za-z0-9._]{3,}$/
const RELATIVE_TIME_RE = /^\d+\s*[smhdwy]$|^\d+[smhdwy]$/

function extractCommentsFromBodyText(body: string): { author: string; text: string }[] {
  const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const out: { author: string; text: string }[] = []
  const seen = new Set<string>()
  // 명세대로: 상단 10줄은 상단 nav/메타 → skip, 그 뒤 author/time/body 3-line pattern
  for (let i = 10; i < lines.length - 2; i++) {
    const author = lines[i]
    const maybeTime = lines[i + 1]
    const text = lines[i + 2]
    if (!HANDLE_RE.test(author)) continue
    if (!RELATIVE_TIME_RE.test(maybeTime.toLowerCase())) continue
    if (!text || text.length < 2) continue
    if (['Like', 'Reply', 'Follow', 'Original audio', 'View replies'].includes(text)) continue
    if (text.startsWith('#') && !text.includes(' ')) continue   // 단일 해시태그만 있는 줄 skip
    const key = `${author}::${text}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ author, text })
    if (out.length >= MAX_COMMENT_LINES_TO_KEEP) break
  }
  return out
}

interface ReelDetailScrape {
  loginWall: boolean
  caption: string             // og:description의 caption 부분
  ogTitle: string             // og:title
  authorFromOg: string        // og:title에서 추출한 user
  likeCount: number           // og:description "10K likes" 파싱
  commentCount: number        // og:description "240 comments" 파싱
  viewCount?: number          // JSON-LD interactionStatistic / DOM "X views" best-effort
  publishedAt: string         // ISO8601 또는 '' (확인 불가)
  comments: { author: string; text: string }[]
}

// 업로드 일자 파싱 — 우선순위:
//   (1) <time datetime="..."> DOM 속성
//   (2) JSON-LD <script>의 uploadDate / datePublished
//   (3) og:description "on October 24, 2024" 패턴
function parsePublishedAt(timeAttr: string, jsonLdDate: string, desc: string): string {
  const tryDate = (s: string): string => {
    if (!s) return ''
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const a = tryDate(timeAttr); if (a) return a
  const b = tryDate(jsonLdDate); if (b) return b
  const m = desc.match(/on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/)
  if (m) {
    const d = tryDate(m[1])
    if (d) return d
  }
  return ''
}

function isWithinLastNDays(iso: string, days: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (isNaN(t)) return false
  return Date.now() - t < days * 24 * 3600 * 1000
}

async function scrapeReelDetail(page: Page, reelUrl: string): Promise<ReelDetailScrape> {
  await page.goto(reelUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
  await page.waitForTimeout(REEL_DETAIL_WAIT_MS)

  const finalUrl = page.url()
  if (finalUrl.includes('/accounts/login') || finalUrl.includes('/challenge')) {
    return { loginWall: true, caption: '', ogTitle: '', authorFromOg: '', likeCount: 0, commentCount: 0, viewCount: undefined, publishedAt: '', comments: [] }
  }

  // og 메타 + JSON-LD 업로드일·viewCount + <time datetime> 동시에 수집
  const meta = await page.evaluate(() => {
    const desc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
    const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
    const timeAttr = (document.querySelector('time[datetime]') as HTMLTimeElement | null)?.getAttribute('datetime') || ''
    let jsonLdDate = ''
    let jsonLdViews = 0
    try {
      const lds = Array.from(document.querySelectorAll('script[type="application/ld+json"]')) as HTMLScriptElement[]
      for (const el of lds) {
        const txt = el.textContent || ''
        if (!txt.trim()) continue
        const obj = JSON.parse(txt)
        const arr = Array.isArray(obj) ? obj : [obj]
        for (const o of arr) {
          if (!jsonLdDate) {
            const d = o?.uploadDate || o?.datePublished || o?.dateCreated
            if (d) jsonLdDate = String(d)
          }
          // interactionStatistic — WatchAction → viewCount
          const stats = o?.interactionStatistic
          if (stats) {
            const arr2 = Array.isArray(stats) ? stats : [stats]
            for (const s of arr2) {
              const tt = s?.interactionType
              const ttype = typeof tt === 'string' ? tt : (tt?.['@type'] || '')
              if (/WatchAction/i.test(ttype)) {
                const c = Number(s?.userInteractionCount)
                if (Number.isFinite(c) && c > 0) jsonLdViews = Math.max(jsonLdViews, c)
              }
            }
          }
        }
      }
    } catch {}
    return { desc, title, timeAttr, jsonLdDate, jsonLdViews }
  }).catch(() => ({ desc: '', title: '', timeAttr: '', jsonLdDate: '', jsonLdViews: 0 }))

  let body = ''
  try { body = await page.locator('body').innerText({ timeout: 5000 }) } catch {}
  if (/please wait a few minutes|try again later|restricted/i.test(body) && body.length < 800) {
    return { loginWall: true, caption: '', ogTitle: '', authorFromOg: '', likeCount: 0, commentCount: 0, viewCount: undefined, publishedAt: '', comments: [] }
  }

  // og:title 형식 예: "Some User on Instagram: \"caption…\""
  let authorFromOg = ''
  const titleMatch = meta.title.match(/^(.+?) on Instagram/i)
  if (titleMatch) authorFromOg = titleMatch[1].trim()

  // og:description 예: "10K likes, 240 comments - cnn on October 24, 2024: \"Caption text…\""
  let caption = ''
  const capQuote = meta.desc.match(/:\s*[""]([\s\S]+?)[""]\s*$/)
  if (capQuote) caption = capQuote[1]
  else caption = meta.desc.replace(/^[^:]*:\s*/, '').replace(/^[""]|[""]$/g, '').trim()

  const likeMatch = meta.desc.match(/([\d,.]+\s*[KMkm]?)\s*likes?/i)
  const commentMatch = meta.desc.match(/([\d,.]+\s*[KMkm]?)\s*comments?/i)
  const likeCount = likeMatch ? parseCompactCount(likeMatch[1]) : 0
  const commentCount = commentMatch ? parseCompactCount(commentMatch[1]) : 0

  // viewCount — JSON-LD 우선, 없으면 body의 "X views/plays" 텍스트 best-effort
  let viewCount: number | undefined = meta.jsonLdViews > 0 ? meta.jsonLdViews : undefined
  if (viewCount == null && body) {
    const m = body.match(/([\d,.]+\s*[KMBkmb]?)\s*(?:views?|plays?)\b/i)
    if (m) {
      const n = parseCompactCount(m[1])
      if (n > 0) viewCount = n
    }
  }

  const publishedAt = parsePublishedAt(meta.timeAttr, meta.jsonLdDate, meta.desc)
  const comments = extractCommentsFromBodyText(body)
  return {
    loginWall: false,
    caption: caption.slice(0, 800),
    ogTitle: meta.title,
    authorFromOg,
    likeCount,
    commentCount,
    viewCount,
    publishedAt,
    comments,
  }
}

// ── hashtag 페이지 Reel 카드 추출 ──────────────────────────
async function extractReelCardsFromTagPage(page: Page): Promise<{ url: string; text: string }[]> {
  // 1) lazy-render 트리거: 600px 정도 스크롤 → 잠깐 wait
  await page.evaluate(() => window.scrollBy(0, 600)).catch(() => {})
  await page.waitForTimeout(900)
  // 2) `/p/` 또는 `/reel/` 링크 모두 수집
  return page.evaluate((sel) => {
    const anchors = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[]
    const seen = new Set<string>()
    const result: { url: string; text: string }[] = []
    for (const a of anchors) {
      const href = a.getAttribute('href') || ''
      if (!/^\/(p|reel)\//.test(href)) continue
      const url = a.href
      if (!url || seen.has(url)) continue
      seen.add(url)
      const parent = (a.parentElement && (a.parentElement as HTMLElement)) || a
      const text = (parent.innerText || a.innerText || '').trim()
      result.push({ url, text })
      if (result.length >= 16) break  // 후보를 넉넉히 받고 caller 측에서 자름
    }
    return result
  }, POST_OR_REEL_SELECTOR)
}

async function captureTopReelCards(page: Page, prefix: string, limit: number): Promise<string[]> {
  ensureCaptureDir()
  const locator = page.locator(POST_OR_REEL_SELECTOR)
  const count = Math.min(await locator.count(), limit)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i)
    try { await el.scrollIntoViewIfNeeded({ timeout: 4000 }) } catch {}
    const fname = `${prefix}-${Date.now()}-${i + 1}.png`
    const fsPath = path.join(CAPTURE_DIR_FS, fname)
    try {
      await el.screenshot({ path: fsPath, timeout: 6000 })
      out.push(`${CAPTURE_DIR_PUBLIC}/${fname}`)
    } catch {
      out.push('')
    }
  }
  return out
}

// ── reelScore (사용자 확정 가중치 2026-05-08 #4) ──────────────
//   views × 1 + likes × 2 + comments × 5 (각각 log10 처리)
function reelScore(r: InstagramReel): number {
  const v = r.viewCount ?? 0
  const l = (r.likeCount ?? r.views) || 0
  const c = (r.commentCount ?? r.comments?.length) || 0
  return Math.log10(v + 1) * 1
       + Math.log10(l + 1) * 2
       + Math.log10(c + 1) * 5
}

// ── Deep-crawl: /p/<shortcode>/ 페이지의 SSR 댓글 DOM 추출 ─────────
//   probe로 확인 (2026-05-08): /reel/<code>/는 /reels/ feed로 redirect되어 댓글 안 mount.
//   /p/<code>/ 페이지는 댓글이 a[href*="/c/<commentId>/"] 형태로 SSR됨 — 그 parent에서 author+text 추출.
//   GraphQL response intercept는 보조 (페이지 로드 중 자동 호출되면 같이 캡처)
async function crawlDeepCommentsForReel(
  page: Page,
  reelUrl: string,
  target: number = DEEP_COMMENT_TARGET,
): Promise<InstagramComment[]> {
  const collected: InstagramComment[] = []
  const seen = new Set<string>()
  const seenUrls = new Set<string>()
  const allInstagramUrls: string[] = []  // 진단용 — 어떤 instagram.com endpoint가 호출되는지 전부 로깅
  let interceptedHits = 0

  const COMMENTS_ENDPOINT_RE = /(comments|comment).*\/?(\?|$)|\/graphql\/query|\/api\/v1\/media\/\d+/i

  const handler = async (response: import('playwright').Response) => {
    const url = response.url()
    if (response.request().method() !== 'GET' && response.request().method() !== 'POST') return
    if (!/instagram\.com/.test(url)) return
    // 진단: 모든 instagram.com 응답 path 기록 (최대 30개)
    if (allInstagramUrls.length < 30) {
      const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0].slice(0, 120)
      if (!allInstagramUrls.includes(path)) allInstagramUrls.push(path)
    }
    if (!COMMENTS_ENDPOINT_RE.test(url)) return
    let json: any
    try { json = await response.json() } catch { return }
    if (!json || typeof json !== 'object') return

    // 다양한 응답 스키마 후보 다 탐색
    const candidates: any[] = []
    if (Array.isArray(json.comments)) candidates.push(...json.comments)
    if (Array.isArray(json.preview_comments)) candidates.push(...json.preview_comments)
    const data = json.data
    if (data) {
      // GraphQL: data.xdt_api__v1__media__media_id__comments__connection.edges[].node
      const conn = data.xdt_api__v1__media__media_id__comments__connection
                 || data.media?.edge_media_to_parent_comment
                 || data.media?.edge_media_to_comment
                 || data.shortcode_media?.edge_media_to_parent_comment
                 || data.shortcode_media?.edge_media_to_comment
      if (conn?.edges && Array.isArray(conn.edges)) {
        for (const e of conn.edges) if (e?.node) candidates.push(e.node)
      }
    }
    if (candidates.length === 0) return
    seenUrls.add(url.split('?')[0])
    interceptedHits++

    for (const c of candidates) {
      const text = (c.text || c.body || c.content || '').trim()
      const author = c.user?.username || c.owner?.username || c.author?.username || c.user_id || 'anon'
      if (!text || text.length < 2) continue
      const key = `${author}::${text.slice(0, 80)}`
      if (seen.has(key)) continue
      seen.add(key)
      const likes = c.comment_like_count ?? c.like_count ?? c.edge_liked_by?.count ?? 0
      collected.push({
        text: text.slice(0, 800),
        author: String(author),
        approxLikes: Number(likes) || 0,
      })
    }
  }
  page.on('response', handler)

  try {
    // /reel/<code>/는 /reels/ scroller로 redirect → 댓글 안 mount. /p/<code>/로 강제
    const shortcode = shortcodeFromAny(reelUrl)
    const navUrl = shortcode
      ? `https://www.instagram.com/p/${shortcode}/`
      : reelUrl
    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(REEL_DETAIL_WAIT_MS + 4000) // React mount 시간 추가 (총 ~6.5s)

    // login wall / captcha 즉시 감지
    const cur = page.url()
    if (cur.includes('/accounts/login') || cur.includes('/challenge')) {
      return []
    }

    // ★ 핵심: SSR된 댓글 DOM 추출 — a[href*="/c/<id>/"] 기반 (probe 검증)
    try {
      const ssrComments = await page.evaluate(() => {
        const out: { author: string; text: string }[] = []
        const seen = new Set<string>()
        const links = Array.from(document.querySelectorAll('a[href*="/c/"]')) as HTMLAnchorElement[]
        for (const link of links) {
          const href = link.getAttribute('href') || ''
          if (!/\/p\/[^/]+\/c\/\d+/.test(href)) continue
          const container = link.closest('li') || link.parentElement?.parentElement?.parentElement
          if (!container) continue
          const raw = ((container as HTMLElement).innerText || '').trim()
          if (!raw) continue
          // 첫 줄 = author, 두 번째 줄 = 빈/메타, 세 번째 이후 = 본문
          const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean)
          if (lines.length < 2) continue
          const author = lines[0]
          // 상대시간 패턴 (6w / 5d / 2h …) 제외 후 본문
          const body = lines.slice(1).filter((l) =>
            !/^\d+\s*[smhdwy]$/i.test(l) &&
            !/^(reply|like|follow|view replies)$/i.test(l) &&
            l.length > 1
          ).join(' ').trim()
          if (!body || body.length < 2) continue
          const key = `${author}::${body.slice(0, 80)}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ author: author.slice(0, 80), text: body.slice(0, 800) })
        }
        return out
      })
      for (const c of ssrComments) {
        const key = `${c.author}::${c.text.slice(0, 80)}`
        if (seen.has(key)) continue
        seen.add(key)
        collected.push({ text: c.text, author: c.author, approxLikes: 0 })
      }
      if (ssrComments.length > 0) console.log(`    [deep] SSR comments extracted: ${ssrComments.length}`)
    } catch (e) {
      console.warn(`    [deep] SSR extraction error: ${(e as Error).message}`)
    }

    // (옛 JSON-LD 시도 보존 — 일부 Instagram view는 ld+json에 comment 배열 박을 수도)
    try {
      const ssrComments = await page.evaluate(() => {
        const out: { author: string; text: string; likes: number }[] = []
        const lds = Array.from(document.querySelectorAll('script[type="application/ld+json"]')) as HTMLScriptElement[]
        for (const el of lds) {
          try {
            const obj = JSON.parse(el.textContent || '')
            const arr = Array.isArray(obj) ? obj : [obj]
            for (const o of arr) {
              const cs = o?.commentCount && o?.comment
              if (Array.isArray(o?.comment)) {
                for (const c of o.comment) {
                  out.push({
                    author: c?.author?.alternateName || c?.author?.name || 'anon',
                    text: String(c?.text || '').slice(0, 800),
                    likes: 0,
                  })
                }
              }
            }
          } catch {}
        }
        return out
      })
      for (const c of ssrComments) {
        if (!c.text || c.text.length < 2) continue
        const key = `${c.author}::${c.text.slice(0, 80)}`
        if (seen.has(key)) continue
        seen.add(key)
        collected.push({ text: c.text, author: c.author, approxLikes: c.likes })
      }
    } catch {}

    // 댓글 영역으로 스크롤 + "더 보기/replies" 버튼 클릭 시도
    for (let i = 0; i < DEEP_COMMENT_MAX_PAGES; i++) {
      if (collected.length >= target) break
      // 점진 스크롤 (댓글 영역까지 도달)
      await page.evaluate(() => {
        window.scrollBy(0, 700)
        // 댓글 영역의 자체 스크롤 컨테이너 (있으면 스크롤)
        const list = document.querySelector('ul[role="list"], div[role="dialog"] ul')
        if (list) (list as HTMLElement).scrollBy?.(0, 600)
      }).catch(() => {})

      // "더 보기 댓글" 버튼 찾기 (영문/한글)
      try {
        const clicked = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, span[role="button"]')) as HTMLElement[]
          for (const b of buttons) {
            const t = (b.innerText || '').trim().toLowerCase()
            if (/load more comments|view all comments|view more comments|view replies|댓글 더 보기|댓글 모두 보기/.test(t)) {
              b.click()
              return true
            }
          }
          return false
        })
        if (clicked) console.log(`    [deep] "더 보기" 버튼 클릭됨`)
      } catch {}

      // jitter 1.5~3s
      await page.waitForTimeout(1500 + Math.floor(Math.random() * 1500))
    }
    console.log(`    [deep] hits=${interceptedHits}, collected=${collected.length}, comment-endpoints=${[...seenUrls].slice(0, 3).join(' | ') || '(none)'}`)
    console.log(`    [deep] all IG paths seen (${allInstagramUrls.length}): ${allInstagramUrls.slice(0, 18).join(', ')}`)
  } catch (e) {
    console.warn(`    [deep] error: ${(e as Error).message}`)
  } finally {
    page.off('response', handler)
  }

  return collected.slice(0, target)
}

// ── 메인 크롤러 ───────────────────────────────────────────
export interface InstagramCrawlResult {
  reels: InstagramReel[]              // 글로벌 top 10
  candidatePool: InstagramReel[]      // Stage 1 통과 전체
  searchedTags: string[]
  warnings: string[]
  lockedOut: boolean
  lockoutRemainingMs: number
}

export async function crawlInstagramBuzz(): Promise<InstagramCrawlResult> {
  const warnings: string[] = []

  if (isLockedOut()) {
    const remaining = lockoutRemainingMs()
    return {
      reels: [], candidatePool: [], searchedTags: [],
      warnings: [`Instagram 30분 lockout 중 (남은 ${Math.ceil(remaining / 60000)}분)`],
      lockedOut: true, lockoutRemainingMs: remaining,
    }
  }

  const cookies = loadInstagramCookies()
  if (!cookies) {
    return {
      reels: [], candidatePool: [], searchedTags: [],
      warnings: ['Instagram 쿠키 파일 없음 또는 sessionid 누락 — 본인 Chrome에서 로그인 후 쿠키 재추출 필요'],
      lockedOut: false, lockoutRemainingMs: 0,
    }
  }

  ensureCaptureDir()

  // 2026-05-08: Tier 3 헤드풀 모드로 전환 — Instagram fingerprint throttle 회피
  //   - 별도 profile dir (~/Desktop/secret/001/instagram-profile/) 사용
  //   - 사용자 일상 Chrome 안 건드림
  //   - SEARCH_BROWSER_HEADLESS=false (기본) 또는 환경변수로 override
  const HEADLESS = process.env.SEARCH_BROWSER_HEADLESS === 'true'
  const PROFILE_DIR = path.join(os.homedir(), 'Desktop/secret/001/instagram-profile')
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })

  console.log(`  [Instagram] Playwright chromium 시작… (headless=${HEADLESS}, profile=${PROFILE_DIR})`)
  // launchPersistentContext: profile 영속화 + cookie 자동 저장 + headful 가능
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
               '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,AutomationControlled',
    ],
  })
  const browser = context.browser()  // null일 수 있음 (persistent context)
  const allReels: InstagramReel[] = []
  const seenUrls = new Set<string>()
  const searchedTags: string[] = []

  try {
    // 첫 실행이면 profile에 cookie 없음 → 주입. 이미 있으면 무관 (덮어쓰기 OK)
    await context.addCookies(cookies)
    const page = context.pages()[0] || await context.newPage()

    let droppedByDate = 0

    // ============================================================
    // STAGE 1: hashtag별 후보 수집 + 필터 + per-hashtag score 정렬 → top 5
    // ============================================================
    for (const category of ALL_CATEGORIES) {
      let collectedThisCategory = 0
      for (const tag of TAG_GROUPS[category]) {
        searchedTags.push(tag)
        const tagUrl = `https://www.instagram.com/explore/tags/${tag}/`
        try {
          await page.goto(tagUrl, { waitUntil: 'domcontentloaded', timeout: 25000 })
          await page.waitForTimeout(HASHTAG_PAGE_WAIT_MS)
        } catch (e) {
          warnings.push(`tag ${tag} navigation 실패: ${(e as Error).message}`)
          continue
        }

        const cur = page.url()
        if (cur.includes('/accounts/login') || cur.includes('/challenge')) {
          triggerLockout(`hashtag page redirected to ${cur}`)
          warnings.push('Instagram 로그인 wall 감지 → 30분 lockout 진입')
          return {
            reels: allReels.slice(0, GLOBAL_TOP_K),
            candidatePool: allReels,
            searchedTags, warnings,
            lockedOut: true, lockoutRemainingMs: lockoutRemainingMs(),
          }
        }

        const allCards = await extractReelCardsFromTagPage(page)
        const cards = allCards.slice(0, MAX_REEL_CANDIDATES_PER_TAG)
        console.log(`  [Instagram] tag #${tag}: ${allCards.length}개 카드 발견`)
        if (cards.length === 0) {
          warnings.push(`tag ${tag}: Reel/Post 카드 0개 (페이지 비어있음)`)
          continue
        }

        const capturePaths = await captureTopReelCards(
          page,
          `instagram-${category}-${tag}`,
          Math.min(MAX_REELS_PER_HASHTAG, cards.length),
        )
        const captureMap = new Map<string, string | undefined>()
        for (let i = 0; i < cards.length; i++) {
          captureMap.set(cards[i].url, capturePaths[i] || undefined)
        }

        // hashtag당 12 후보 모두 detail 받아서 passing[]에 누적 → score 정렬 → top 5
        const passing: InstagramReel[] = []
        let triesThisHashtag = 0
        for (const card of cards.slice(0, MAX_DETAIL_TRIES_PER_HASHTAG)) {
          const url = card.url
          if (!url || seenUrls.has(url)) continue
          triesThisHashtag++

          let detail: ReelDetailScrape
          try {
            detail = await scrapeReelDetail(page, url)
          } catch (e) {
            warnings.push(`reel detail 실패 (${url}): ${(e as Error).message}`)
            continue
          }
          if (detail.loginWall) {
            triggerLockout('reel detail redirected to login/challenge')
            warnings.push('Reel 상세 페이지에서 로그인 wall → 30분 lockout 진입')
            return {
              reels: allReels.slice(0, GLOBAL_TOP_K),
              candidatePool: allReels,
              searchedTags, warnings,
              lockedOut: true, lockoutRemainingMs: lockoutRemainingMs(),
            }
          }

          const caption = detail.caption || ''
          if (!caption) continue

          // 60일 필터 — 일자 미확인도 reject
          if (!isWithinLastNDays(detail.publishedAt, MAX_REEL_AGE_DAYS)) {
            droppedByDate++
            continue
          }

          const author = detail.authorFromOg || url.split('/').filter(Boolean).slice(-3)[0] || 'instagram_creator'
          const hashtags = extractHashtags(caption)
          const haystack = `${tag} ${author} ${caption}`
          if (!hasKContentMarker(haystack, hashtags)) continue
          if (!categoryRulePass(category, haystack)) continue

          const comments: InstagramComment[] = detail.comments.length > 0
            ? detail.comments.slice(0, 3).map((c, idx) => ({
                text: c.text.slice(0, 320),
                author: c.author,
                approxLikes: Math.max(0, 40 - idx * 8),
              }))
            : [{
                text: '이 Reel은 캡처되었지만, 로그아웃 사용자에게 보이는 댓글이 제한적이었습니다.',
                author: 'instagram_reel',
                approxLikes: 0,
              }]

          const ig: InstagramAuthor = {
            username: author,
            displayName: '',
            verified: false,
          }

          const reel: InstagramReel = {
            id: shortcodeFromAny(url),
            url,
            caption: caption.slice(0, 800),
            views: detail.likeCount,
            likeCount: detail.likeCount,
            commentCount: detail.commentCount,
            viewCount: detail.viewCount,
            publishedAt: detail.publishedAt,
            author: ig,
            hashtags,
            channelType: classifyChannel(author, ''),
            category,
            tag,
            comments,
            capturePath: captureMap.get(url),
          }
          passing.push(reel)
          seenUrls.add(url)

          // detail 사이 jitter (3.5~5s) — Instagram throttle 회피
          await page.waitForTimeout(TAG_TRANSITION_WAIT_MS + Math.floor(Math.random() * 1500))
        }

        // ★ per-hashtag score sort → top 5
        passing.sort((a, b) => reelScore(b) - reelScore(a))
        const taken = passing.slice(0, MAX_REELS_PER_HASHTAG)
        allReels.push(...taken)
        collectedThisCategory += taken.length

        console.log(`  [Instagram] tag #${tag}: ${taken.length}/${MAX_REELS_PER_HASHTAG} 채택 (passing=${passing.length}, tries=${triesThisHashtag})`)
      }
      console.log(`  [Instagram] category=${category}: ${collectedThisCategory}개`)
    }

    if (droppedByDate > 0) {
      warnings.push(`최근 ${MAX_REEL_AGE_DAYS}일 필터로 ${droppedByDate}개 제외 (업로드일 ${MAX_REEL_AGE_DAYS}일 초과 또는 추출 불가)`)
    }

    // ============================================================
    // STAGE 2: 글로벌 score 정렬 + top 10 / top 3 마킹
    // ============================================================
    allReels.sort((a, b) => reelScore(b) - reelScore(a))
    for (let i = 0; i < allReels.length; i++) {
      if (i < GLOBAL_TOP_K) allReels[i].isTop10 = true
      if (i < DEEP_CRAWL_TOP_N) allReels[i].isTop3Deep = true
    }
    const topReels = allReels.slice(0, GLOBAL_TOP_K)
    console.log(`  [Instagram] Stage 2: candidatePool=${allReels.length} → topReels=${topReels.length} (top3 deep target)`)

    // ============================================================
    // STAGE 3: top 3 deep-crawl (GraphQL intercept로 댓글 50개씩)
    // ============================================================
    const deepTargets = topReels.slice(0, DEEP_CRAWL_TOP_N)
    for (let i = 0; i < deepTargets.length; i++) {
      if (isLockedOut()) {
        warnings.push('Stage 3 도중 lockout 감지 → deep crawl 중단')
        break
      }
      const reel = deepTargets[i]
      const t0 = Date.now()
      try {
        const deep = await crawlDeepCommentsForReel(page, reel.url, DEEP_COMMENT_TARGET)
        reel.deepComments = deep
        reel.deepCommentSampledAt = new Date().toISOString()
        reel.deepCommentTotalFetched = deep.length
        console.log(`  [Instagram] Stage 3 [${i + 1}/${deepTargets.length}]: ${deep.length}개 댓글 (${((Date.now() - t0) / 1000).toFixed(1)}s) — ${reel.url}`)
      } catch (e) {
        warnings.push(`deep crawl 실패 (${reel.url}): ${(e as Error).message}`)
      }
      // reel 사이 jitter 5~8s — Instagram soft-throttle 회피 (2026-05-08 진단 결과:
      // 짧은 간격으로 연속 detail 요청 시 2번째부터 빈 응답)
      await page.waitForTimeout(5000 + Math.floor(Math.random() * 3000))
    }
  } catch (e) {
    warnings.push(`Instagram 크롤 예외: ${(e as Error).message}`)
  } finally {
    try { if (context) await context.close() } catch {}
    try { if (browser) await browser.close() } catch {}
  }

  // 최종 정렬·마킹은 stage 2에서 이미 끝났음. 여기선 안전하게 한 번 더 정렬
  allReels.sort((a, b) => reelScore(b) - reelScore(a))
  const topReels = allReels.slice(0, GLOBAL_TOP_K)
  const deepCount = allReels.filter(r => (r.deepCommentTotalFetched || 0) > 0).length
  console.log(`  [Instagram] 총 candidatePool=${allReels.length}, topReels=${topReels.length}, deep-crawled=${deepCount} (검색 태그 ${searchedTags.length}개, 경고 ${warnings.length}건)`)
  return {
    reels: topReels,
    candidatePool: allReels,
    searchedTags,
    warnings,
    lockedOut: false,
    lockoutRemainingMs: 0,
  }
}
