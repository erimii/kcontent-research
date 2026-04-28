import type { NormalizedItem, RedditPost } from '../types/index.js'

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','has','have','had','do','does',
  'did','will','would','could','should','it','its','this','that','i','my',
  'you','your','he','she','we','they','his','her','season','ep','episode','part'
])

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')
    .replace(/[''""«»]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9\s가-힣]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function cleanDisplayTitle(raw: string): string {
  return raw
    .replace(/[,.\s]+$/, '')
    .trim()
}

export function tokenize(str: string): string[] {
  return str.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

function extractDramaTitleFromReddit(title: string): string | null {
  // 1) 유니코드 곡선 큰따옴표 "드라마명"
  const curved = title.match(/\u201c([^\u201d]{3,50})\u201d/)
  if (curved) {
    const t = curved[1].trim()
    if (isValidDramaTitle(t)) return t
  }

  // 2) 일반 큰따옴표 "드라마명"
  const dq = title.match(/"([^"]{3,50})"/)
  if (dq) {
    const t = dq[1].trim()
    if (isValidDramaTitle(t)) return t
  }

  // 3) 대괄호 안 드라마명
  const bracket = title.match(/(?:like|watching|finish|recommend|for)\s+\[([A-Z][^[\]]{3,50})\]/i)
  if (bracket) {
    const t = bracket[1].trim()
    if (!/ep(isode)?s?\s*\d+/i.test(t) && isValidDramaTitle(t)) return t
  }

  return null
}

function isValidDramaTitle(t: string): boolean {
  if (t.length < 3) return false
  if (/^\d+$/.test(t)) return false
  if (/^(i |i'm |i've |i'll |i was |i am |me |my |you |we |they |he |she |it )/i.test(t)) return false
  if (t.endsWith('?') || t.endsWith('!')) return false
  if (t.split(/\s+/).length > 7) return false
  if (/^(definitely watching|miss it|left wanting|watching it|this drama|this show)/i.test(t)) return false
  return true
}

export function normalizeRedditPost(post: RedditPost): NormalizedItem {
  const extracted = extractDramaTitleFromReddit(post.title)
  const useTitle = extracted ?? post.title
  const hasDramaTitle = extracted !== null
  const norm = normalizeTitle(useTitle)
  return {
    rawTitle: useTitle,
    normalizedTitle: norm,
    tokens: tokenize(norm),
    source: 'reddit',
    score: post.score + post.commentCount * 2,
    mentionCount: 1,
    commentCount: post.commentCount,
    timestamp: post.createdAt,
    metadata: {
      subreddit: post.subreddit,
      url: post.url,
      flair: post.flair,
      originalTitle: post.title,
      hasDramaTitle,
      topComments: post.comments.slice(0, 3).map(c => c.body),
    }
  }
}
