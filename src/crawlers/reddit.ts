// ============================================================
// Reddit 크롤러 - RSS 피드 + Pullpush API 하이브리드
// IP 차단 우회: HTML 직접 파싱 대신 공개 RSS/API 사용
// ============================================================

import type { RedditPost } from '../types/index.js'
import { isKoreanRedditPost } from '../pipeline/korean-filter.js'

const DEFAULT_SUBREDDITS = ['kdramas', 'kdrama', 'kdramarecommends', 'korean', 'koreatravel']

// ============================================================
// RSS 파싱 (핫 포스트 기준)
// ============================================================
async function fetchRSS(subreddit: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.rss?limit=25`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/atom+xml, application/rss+xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`)
  const text = await res.text()

  const entries: RedditPost[] = []

  // Atom feed 파싱 (정규식으로 XML 추출)
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null

  while ((m = entryRegex.exec(text)) !== null) {
    const entry = m[1]
    const title = decodeEntities(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || '')
    const link = entry.match(/<link rel="alternate"[^>]+href="([^"]+)"/)?.[1] ||
                 entry.match(/<id>(https?:\/\/[^<]+)<\/id>/)?.[1] || ''
    const published = entry.match(/<published>(.*?)<\/published>/)?.[1] ||
                      entry.match(/<updated>(.*?)<\/updated>/)?.[1] || new Date().toISOString()

    // ID 추출 (URL에서)
    const idMatch = link.match(/comments\/([a-z0-9]+)\//)
    const id = idMatch?.[1] || `rss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    // 댓글수: content에서 파싱
    const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || ''
    const commentMatch = content.match(/(\d+)\s*comment/)
    const commentCount = commentMatch ? parseInt(commentMatch[1]) : 0

    // 점수: score 태그나 content에서 파싱
    const scoreMatch = content.match(/score[^>]*>(\d+)</)
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 1

    const flair = entry.match(/<category[^>]+label="([^"]+)"/)?.[1]

    if (title && link && !title.toLowerCase().includes('[pinned]') && !title.toLowerCase().includes('[mod post]')) {
      entries.push({
        id,
        subreddit,
        title,
        url: link,
        score,
        commentCount,
        createdAt: new Date(published).toISOString(),
        comments: [],
        flair,
      })
    }
  }

  return entries
}

// ============================================================
// Pullpush API (최근 인기 포스트, 점수/댓글 정보 풍부)
// ============================================================
async function fetchPullpush(subreddit: string): Promise<RedditPost[]> {
  const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${subreddit}&limit=25&sort=score`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'KContentResearch/1.0' },
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`Pullpush HTTP ${res.status}`)
  const data = await res.json() as { data?: any[] }

  return (data.data || []).map((p: any) => ({
    id: p.id || `pp_${Date.now()}`,
    subreddit: p.subreddit || subreddit,
    title: p.title || '',
    url: p.url || `https://www.reddit.com/r/${subreddit}/comments/${p.id}/`,
    score: p.score || 0,
    commentCount: p.num_comments || 0,
    createdAt: p.created_utc
      ? new Date(p.created_utc * 1000).toISOString()
      : new Date().toISOString(),
    comments: [],
    flair: p.link_flair_text || undefined,
  })).filter((p: RedditPost) => p.title.length > 0)
}

// ============================================================
// 댓글 수집: RSS 댓글 피드
// ============================================================
async function fetchCommentsRSS(post: RedditPost): Promise<RedditPost['comments']> {
  try {
    const url = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.rss?limit=10`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const text = await res.text()

    const comments: RedditPost['comments'] = []
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
    let m: RegExpExecArray | null

    while ((m = entryRegex.exec(text)) !== null) {
      const entry = m[1]
      const content = decodeEntities(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '')
      // content는 HTML → 텍스트만 추출
      const body = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
      if (body.length > 20 && body !== '[deleted]' && body !== '[removed]') {
        comments.push({
          id: `c_${Math.random().toString(36).slice(2, 8)}`,
          body,
          score: 1,
          depth: 0,
        })
      }
      if (comments.length >= 6) break
    }
    return comments
  } catch {
    return []
  }
}

// HTML 엔티티 디코딩
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
}

// ============================================================
// 메인 크롤링 함수
// ============================================================
export async function crawlReddit(options: {
  subreddits?: string[]
  fetchComments?: boolean
} = {}): Promise<RedditPost[]> {
  const { subreddits = DEFAULT_SUBREDDITS, fetchComments = true } = options

  const allPosts: RedditPost[] = []
  const seenIds = new Set<string>()

  for (const sub of subreddits) {
    try {
      console.log(`  [Reddit] r/${sub} 수집 중...`)
      const [rssPosts, ppPosts] = await Promise.allSettled([
        fetchRSS(sub),
        fetchPullpush(sub),
      ])

      const fromRSS = rssPosts.status === 'fulfilled' ? rssPosts.value : []
      const fromPP = ppPosts.status === 'fulfilled' ? ppPosts.value : []

      if (rssPosts.status === 'rejected') console.warn(`  [Reddit] r/${sub} RSS 실패:`, rssPosts.reason?.message)
      if (ppPosts.status === 'rejected') console.warn(`  [Reddit] r/${sub} Pullpush 실패:`, ppPosts.reason?.message)

      // 두 소스 병합 + 한국 관련 포스트만 필터
      for (const p of [...fromPP, ...fromRSS]) {
        if (!seenIds.has(p.id) && p.title && isKoreanRedditPost(p)) {
          seenIds.add(p.id)
          allPosts.push(p)
        }
      }

      console.log(`  [Reddit] r/${sub}: RSS ${fromRSS.length}개 + Pullpush ${fromPP.length}개`)
      await new Promise(r => setTimeout(r, 1000))

    } catch (e) {
      console.error(`  [Reddit] r/${sub} 전체 실패:`, (e as Error).message)
    }
  }

  // 인기 포스트 댓글 수집
  if (fetchComments && allPosts.length > 0) {
    const hot = allPosts
      .filter(p => p.commentCount >= 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)

    for (const post of hot) {
      const comments = await fetchCommentsRSS(post)
      if (comments.length > 0) {
        post.comments = comments
      }
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`  [Reddit] 총 ${allPosts.length}개 포스트 수집 완료`)
  return allPosts
}
