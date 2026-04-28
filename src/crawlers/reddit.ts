// ============================================================
// Reddit 크롤러 - Playwright (공개 JSON API)
// ============================================================

import { chromium } from 'playwright'
import type { RedditPost } from '../types/index.js'

const DEFAULT_SUBREDDITS = ['kdramas', 'kdrama', 'kdramarecommends', 'korean', 'koreatravel']

export async function crawlReddit(options: {
  subreddits?: string[]
  fetchComments?: boolean
} = {}): Promise<RedditPost[]> {
  const { subreddits = DEFAULT_SUBREDDITS, fetchComments = true } = options

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (compatible; KContentResearch/1.0)',
    'Accept': 'application/json',
  })

  const allPosts: RedditPost[] = []

  try {
    for (const sub of subreddits) {
      try {
        console.log(`  [Reddit] r/${sub} 수집 중...`)
        await page.goto(`https://www.reddit.com/r/${sub}/hot/.json?limit=25`, {
          waitUntil: 'domcontentloaded', timeout: 25000,
        })
        const text = await page.evaluate(() => document.body.innerText)
        const data = JSON.parse(text)
        if (!data?.data?.children) continue

        for (const child of data.data.children) {
          const p = child.data
          if (!p || p.stickied) continue
          allPosts.push({
            id: p.id, subreddit: p.subreddit, title: p.title, url: p.url,
            score: p.score || 0, commentCount: p.num_comments || 0,
            createdAt: new Date(p.created_utc * 1000).toISOString(),
            comments: [], flair: p.link_flair_text || undefined,
          })
        }
        await new Promise(r => setTimeout(r, 1000))
      } catch (e) {
        console.error(`  [Reddit] r/${sub} 실패:`, (e as Error).message)
      }
    }

    // 인기 포스트 댓글 수집 (댓글 10개 이상 상위 5개)
    if (fetchComments) {
      const hot = allPosts.filter(p => p.commentCount >= 10).slice(0, 5)
      for (const post of hot) {
        try {
          await page.goto(
            `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/.json?limit=8&depth=1`,
            { waitUntil: 'domcontentloaded', timeout: 15000 }
          )
          const text = await page.evaluate(() => document.body.innerText)
          const data = JSON.parse(text)
          if (!Array.isArray(data) || data.length < 2) continue
          post.comments = (data[1]?.data?.children || [])
            .filter((c: any) => c.kind !== 'more' && c.data?.body && c.data.body !== '[deleted]')
            .slice(0, 8)
            .map((c: any) => ({
              id: c.data.id, body: c.data.body.slice(0, 400),
              score: c.data.score || 0, depth: 0,
            }))
          await new Promise(r => setTimeout(r, 800))
        } catch { /* 댓글 실패는 무시 */ }
      }
    }
  } finally {
    await browser.close()
  }

  console.log(`  [Reddit] 총 ${allPosts.length}개 포스트 수집 완료`)
  return allPosts
}
