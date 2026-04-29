// ============================================================
// Stage 2: 데이터 필터링
// - 길이 미달 제거
// - 광고/홍보 제거
// - 댓글 0개 제거 (선택)
// - 중복 제거 (id 기준)
// ============================================================

import type { RedditPost, FilterOptions, FilterStats } from '../types/index.js'

const PROMO_PATTERNS: RegExp[] = [
  /\b(buy now|sign up|click here|use code|promo code|discount code|coupon)\b/i,
  /\b(affiliate|sponsored|paid partnership|promotion)\b/i,
  /\b(subscribe to my|check out my channel|my youtube|my blog|my tiktok)\b/i,
  /\b(limited time offer|free trial|free shipping|hurry up)\b/i,
  /\b(dm me|telegram|whatsapp).*(buy|sell|price)\b/i,
  /https?:\/\/[^\s]+\b(?:bit\.ly|tinyurl|goo\.gl|t\.co)\b/i,
  /(할인|쿠폰|프로모션|광고|구독해주세요)/,
]

function isPromotional(post: RedditPost): boolean {
  const haystack = `${post.title}\n${post.selftext || ''}`
  return PROMO_PATTERNS.some((re) => re.test(haystack))
}

export function filterPosts(
  posts: RedditPost[],
  opts: FilterOptions = {}
): { filtered: RedditPost[]; stats: FilterStats } {
  const {
    minTextLength = 20,
    removePromotional = true,
    removeNoComments = false,
  } = opts

  const removed = { tooShort: 0, promotional: 0, noComments: 0, duplicate: 0 }
  const seen = new Set<string>()
  const filtered: RedditPost[] = []

  for (const p of posts) {
    if (seen.has(p.id)) {
      removed.duplicate++
      continue
    }
    seen.add(p.id)

    const titleTrim = (p.title || '').trim()
    const bodyTrim = (p.selftext || '').trim()
    if (!titleTrim && !bodyTrim) {
      removed.tooShort++
      continue
    }
    if ((titleTrim + bodyTrim).length < minTextLength) {
      removed.tooShort++
      continue
    }

    if (removePromotional && isPromotional(p)) {
      removed.promotional++
      continue
    }

    if (removeNoComments && (p.commentCount ?? 0) === 0) {
      removed.noComments++
      continue
    }

    filtered.push(p)
  }

  return {
    filtered,
    stats: {
      before: posts.length,
      after: filtered.length,
      removed,
    },
  }
}
