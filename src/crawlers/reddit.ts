// ============================================================
// Reddit 크롤러 - RSS hot + new 피드 (1주 이내 데이터만)
// - Pullpush 제거: 최신 데이터 없음 (354일 전)
// - hot.rss + new.rss 병행으로 1주 이내 포스트 확보
// - Reddit RSS는 score를 제공하지 않으므로:
//   → 댓글 RSS 수집 후 실제 댓글 entry 수를 commentCount로 사용
//   → score = commentCount * 10 + recencyBonus 로 재산정
// ============================================================

import type { RedditPost } from '../types/index.js'
import { isKoreanRedditPost } from '../pipeline/korean-filter.js'

const DEFAULT_SUBREDDITS = ['kdramas', 'kdrama', 'kdramarecommends', 'korean']

const ONE_WEEK_SEC = 7 * 24 * 60 * 60

// ============================================================
// RSS 피드 파싱 (hot / new 공통)
// ============================================================
async function fetchRSS(subreddit: string, sort: 'hot' | 'new'): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.rss?limit=25`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/atom+xml, application/rss+xml, */*',
    },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) throw new Error(`RSS ${sort} HTTP ${res.status}`)
  const text = await res.text()

  const nowSec = Date.now() / 1000
  const cutoff = nowSec - ONE_WEEK_SEC
  const entries: RedditPost[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null

  while ((m = entryRegex.exec(text)) !== null) {
    const entry = m[1]
    const title = decodeEntities(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || '')

    // 핀/공지 제외
    if (!title || /\[pinned\]|\[mod post\]|\[announcement\]/i.test(title)) continue

    const published =
      entry.match(/<published>(.*?)<\/published>/)?.[1] ||
      entry.match(/<updated>(.*?)<\/updated>/)?.[1] || ''

    // 1주 이내만 허용
    const postSec = published ? new Date(published).getTime() / 1000 : 0
    if (postSec && postSec < cutoff) continue

    const link =
      entry.match(/<link[^>]*\bhref="([^"]+)"/)?.[1] ||
      entry.match(/<id>(https?:\/\/[^<]+)<\/id>/)?.[1] || ''

    const idMatch = link.match(/comments\/([a-z0-9]+)\//)
    const id = idMatch?.[1] || `rss_${sort}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    const flair = entry.match(/<category[^>]+label="([^"]+)"/)?.[1]

    // 본문 추출: <content type="html">...</content> 안의 HTML을 평문으로
    const contentRaw = decodeEntities(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '')
    const selftext = contentRaw
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2000)

    // 최신성 보너스: 24시간 이내=100, 3일=50, 7일=10
    const ageSec = nowSec - postSec
    const recencyScore = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10

    entries.push({
      id,
      subreddit,
      title,
      selftext,
      url: link,
      score: recencyScore,    // RSS에 score 없음 → 최신성으로 대체 (댓글 수집 후 재산정)
      commentCount: 0,        // 댓글 RSS 수집 후 업데이트
      createdAt: published ? new Date(published).toISOString() : new Date().toISOString(),
      comments: [],
      flair,
    })
  }

  return entries
}

// ============================================================
// 댓글 RSS 수집: 댓글 body + 실제 댓글 수 파악
// ============================================================
async function fetchCommentsRSS(post: RedditPost): Promise<{ comments: RedditPost['comments'], count: number }> {
  try {
    const url = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.rss?limit=100`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { comments: [], count: 0 }
    const text = await res.text()

    const comments: RedditPost['comments'] = []
    // 첫 entry는 포스트 본문 → 두 번째부터 댓글
    const entryMatches = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    let totalEntries = 0

    for (const m of entryMatches) {
      totalEntries++
      if (totalEntries === 1) continue  // 첫 entry = 포스트 본문 스킵

      const content = decodeEntities(m[1].match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '')
      const body = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      if (body.length > 20 && body !== '[deleted]' && body !== '[removed]') {
        comments.push({
          id: `c_${Math.random().toString(36).slice(2, 8)}`,
          body,
          score: 1,
          depth: 0,
        })
      }
      if (comments.length >= 50) break
    }

    // totalEntries - 1 = 실제 댓글 수 (첫 entry는 포스트 본문)
    return { comments, count: Math.max(0, totalEntries - 1) }
  } catch {
    return { comments: [], count: 0 }
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
  const nowSec = Date.now() / 1000
  const cutoff = nowSec - ONE_WEEK_SEC

  // ── 1. 서브레딧별 순차 처리, hot+new는 서브레딧 내에서만 병렬 ──
  // 전체 동시 요청(10개) → 429 발생하므로, 서브레딧 단위로 순차 처리
  // 서브레딧 내 hot/new 2개는 병렬 (요청 2개 동시 = 안전)
  for (const sub of subreddits) {
    try {
      console.log(`  [Reddit] r/${sub} 수집 중...`)
      const [hotResult, newResult] = await Promise.allSettled([
        fetchRSS(sub, 'hot'),
        fetchRSS(sub, 'new'),
      ])

      const hotPosts = hotResult.status === 'fulfilled' ? hotResult.value : []
      const newPosts = newResult.status === 'fulfilled' ? newResult.value : []

      if (hotResult.status === 'rejected') console.warn(`  [Reddit] r/${sub} hot 실패:`, hotResult.reason?.message)
      if (newResult.status === 'rejected') console.warn(`  [Reddit] r/${sub} new 실패:`, newResult.reason?.message)

      let added = 0
      for (const p of [...hotPosts, ...newPosts]) {
        const postSec = new Date(p.createdAt).getTime() / 1000
        if (postSec < cutoff) continue
        if (!p.title || seenIds.has(p.id)) continue
        if (!isKoreanRedditPost(p)) continue
        seenIds.add(p.id)
        allPosts.push(p)
        added++
      }
      console.log(`  [Reddit] r/${sub}: hot ${hotPosts.length}개 + new ${newPosts.length}개 → 1주이내+K ${added}개`)

      // 서브레딧 간 간격: 429 방지
      await new Promise(r => setTimeout(r, 800))
    } catch (e) {
      console.error(`  [Reddit] r/${sub} 전체 실패:`, (e as Error).message)
    }
  }

  // ── 2. 댓글 수집: 상위 12개 포스트 병렬 처리 ──────────────
  // 1차 정렬: 최신성(score=recencyScore) 기준으로 상위 12개 선택
  if (fetchComments && allPosts.length > 0) {
    const candidates = [...allPosts]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)

    console.log(`  [Reddit] 댓글 수집: 상위 ${candidates.length}개 병렬 처리 중...`)

    const commentResults = await Promise.allSettled(
      candidates.map(p => fetchCommentsRSS(p))
    )

    commentResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const { comments, count } = r.value
        candidates[i].comments = comments
        // 실제 댓글 수로 업데이트 → score 재산정
        candidates[i].commentCount = count
        // score = 댓글수 * 15 + 최신성보너스
        const ageSec = nowSec - new Date(candidates[i].createdAt).getTime() / 1000
        const recency = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10
        candidates[i].score = count * 15 + recency
      }
    })

    // 댓글 없는 나머지 포스트들도 score 재산정 (댓글 미수집)
    for (const p of allPosts) {
      if (!candidates.includes(p)) {
        const ageSec = nowSec - new Date(p.createdAt).getTime() / 1000
        const recency = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10
        p.score = recency  // 댓글 수 없으므로 최신성만
      }
    }
  }

  console.log(`  [Reddit] 총 ${allPosts.length}개 포스트 수집 완료 (1주 이내, 한국 관련)`)
  return allPosts
}
