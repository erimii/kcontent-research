// ============================================================
// Reddit 크롤러 (Playwright 기반 - API 키 불필요)
// 공개 페이지에서 직접 HTML 파싱
// ============================================================

import { chromium, type Browser, type Page } from 'playwright'
import type { RedditPost, RedditComment } from '../types/index.js'

const SUBREDDITS = [
  'kdramas',
  'kdrama',
  'kdramarecommends',
  'korean',
  'koreatravel',
]

const BASE_URL = 'https://www.reddit.com'
const POST_LIMIT = 25  // 서브레딧당 수집 포스트 수
const COMMENT_LIMIT = 10 // 포스트당 댓글 수

// ============================================================
// 브라우저 초기화 (원격 디버깅 붙기 or 신규 실행)
// ============================================================

export async function getBrowser(remoteDebugPort?: number): Promise<Browser> {
  if (remoteDebugPort) {
    try {
      return await chromium.connectOverCDP(`http://localhost:${remoteDebugPort}`)
    } catch {
      console.warn(`[Reddit] CDP 연결 실패 (port ${remoteDebugPort}), 새 브라우저 실행`)
    }
  }
  return await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })
}

// ============================================================
// 서브레딧 포스트 목록 크롤링
// ============================================================

async function crawlSubreddit(page: Page, subreddit: string): Promise<RedditPost[]> {
  const url = `${BASE_URL}/r/${subreddit}/hot/.json?limit=${POST_LIMIT}`
  console.log(`[Reddit] 크롤링 중: r/${subreddit}`)

  try {
    // JSON API 직접 활용 (공개 엔드포인트)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    const content = await page.evaluate(() => document.body.innerText)
    const data = JSON.parse(content)

    if (!data?.data?.children) return []

    const posts: RedditPost[] = []

    for (const child of data.data.children) {
      const p = child.data
      if (!p || p.stickied) continue

      const post: RedditPost = {
        id: p.id,
        subreddit: p.subreddit,
        title: p.title,
        url: p.url,
        score: p.score ?? 0,
        commentCount: p.num_comments ?? 0,
        createdAt: new Date(p.created_utc * 1000).toISOString(),
        comments: [],
        flair: p.link_flair_text ?? undefined,
      }

      posts.push(post)
    }

    return posts
  } catch (err) {
    console.error(`[Reddit] r/${subreddit} 크롤링 실패:`, err)
    return []
  }
}

// ============================================================
// 포스트 댓글 크롤링 (상위 N개)
// ============================================================

async function crawlComments(page: Page, post: RedditPost): Promise<RedditComment[]> {
  const url = `${BASE_URL}/r/${post.subreddit}/comments/${post.id}/.json?limit=${COMMENT_LIMIT}&depth=2`

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const content = await page.evaluate(() => document.body.innerText)
    const data = JSON.parse(content)

    if (!Array.isArray(data) || data.length < 2) return []

    const commentsData = data[1]?.data?.children ?? []
    const comments: RedditComment[] = []

    for (const child of commentsData) {
      const c = child.data
      if (!c || child.kind === 'more') continue
      if (!c.body || c.body === '[deleted]' || c.body === '[removed]') continue

      comments.push({
        id: c.id,
        body: c.body.slice(0, 500), // 500자 제한
        score: c.score ?? 0,
        depth: c.depth ?? 0,
      })

      // 대댓글
      if (c.replies?.data?.children) {
        for (const reply of c.replies.data.children) {
          const r = reply.data
          if (!r || reply.kind === 'more') continue
          if (!r.body || r.body === '[deleted]') continue
          comments.push({
            id: r.id,
            body: r.body.slice(0, 300),
            score: r.score ?? 0,
            depth: r.depth ?? 1,
          })
        }
      }

      if (comments.length >= COMMENT_LIMIT) break
    }

    return comments
  } catch {
    return []
  }
}

// ============================================================
// 메인 크롤링 함수
// ============================================================

export async function crawlReddit(options: {
  subreddits?: string[]
  fetchComments?: boolean
  remoteDebugPort?: number
} = {}): Promise<RedditPost[]> {
  const {
    subreddits = SUBREDDITS,
    fetchComments = true,
    remoteDebugPort,
  } = options

  const browser = await getBrowser(remoteDebugPort)
  const page = await browser.newPage()

  // User-Agent 설정 (봇 차단 우회)
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (compatible; KContentResearch/1.0)',
    'Accept': 'application/json',
  })

  const allPosts: RedditPost[] = []

  try {
    for (const subreddit of subreddits) {
      const posts = await crawlSubreddit(page, subreddit)

      // 인기 포스트만 댓글 수집 (댓글 100개 이상)
      if (fetchComments) {
        const hotPosts = posts.filter(p => p.commentCount >= 10).slice(0, 5)
        for (const post of hotPosts) {
          console.log(`[Reddit] 댓글 수집: ${post.title.slice(0, 50)}...`)
          post.comments = await crawlComments(page, post)
          await new Promise(r => setTimeout(r, 800)) // 요청 간격
        }
      }

      allPosts.push(...posts)
      await new Promise(r => setTimeout(r, 1000)) // 서브레딧 간 간격
    }
  } finally {
    await page.close()
    // 외부에서 연결한 경우 브라우저 닫지 않음
    if (!remoteDebugPort) {
      await browser.close()
    }
  }

  console.log(`[Reddit] 총 ${allPosts.length}개 포스트 수집 완료`)
  return allPosts
}
