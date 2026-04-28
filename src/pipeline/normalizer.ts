import type { NormalizedItem, RedditPost, FlixPatrolEntry, MyDramaListEntry } from '../types/index.js'

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

// 표시용 제목 클렌징: 끝에 붙은 구두점 제거
export function cleanDisplayTitle(raw: string): string {
  return raw
    .replace(/[,.\s]+$/, '')   // 끝 쉼표/마침표/공백 제거
    .trim()
}

export function tokenize(str: string): string[] {
  return str.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

// Reddit 게시물에서 드라마/영화 제목 추출
// 따옴표로 명시된 경우만 유효한 콘텐츠로 인정
// 예: Just Finished "Moving" → "Moving"
//     Is "Crash Course In Romance" Worth Watching? → "Crash Course In Romance"
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

  // 3) 대괄호 안 드라마명 - "Dramas like [드라마명]" 형식만 허용
  const bracket = title.match(/(?:like|watching|finish|recommend|for)\s+\[([A-Z][^[\]]{3,50})\]/i)
  if (bracket) {
    const t = bracket[1].trim()
    if (!/ep(isode)?s?\s*\d+/i.test(t) && isValidDramaTitle(t)) return t
  }

  // 따옴표로 명시된 드라마 제목 없음 → null
  return null
}

// 드라마/영화 제목으로 유효한지 검증
function isValidDramaTitle(t: string): boolean {
  // 너무 짧음
  if (t.length < 3) return false
  // 숫자만
  if (/^\d+$/.test(t)) return false
  // 문장형 패턴 (동사로 시작하거나 의문문)
  if (/^(i |i'm |i've |i'll |i was |i am |me |my |you |we |they |he |she |it )/i.test(t)) return false
  if (t.endsWith('?') || t.endsWith('!')) return false
  // 너무 많은 단어 = 문장
  if (t.split(/\s+/).length > 7) return false
  // 일반적인 영어 구문 (드라마 제목이 아님)
  if (/^(definitely watching|miss it|left wanting|watching it|this drama|this show)/i.test(t)) return false
  return true
}

export function normalizeRedditPost(post: RedditPost): NormalizedItem {
  const extracted = extractDramaTitleFromReddit(post.title)
  // 따옴표로 명시된 제목이 없으면 원제목 사용하되 flagging
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
      hasDramaTitle,  // 따옴표로 명시된 드라마 제목 여부
      topComments: post.comments.slice(0, 3).map(c => c.body),
    }
  }
}

export function normalizeFlixPatrol(entry: FlixPatrolEntry): NormalizedItem {
  const norm = normalizeTitle(entry.title)
  const rankScore = Math.max(0, 101 - entry.rank) * 2
  return {
    rawTitle: entry.title,
    normalizedTitle: norm,
    tokens: tokenize(norm),
    source: 'flixpatrol',
    platform: entry.platform,
    region: entry.region,
    score: rankScore + (entry.points || 0),
    mentionCount: 1,
    commentCount: 0,
    timestamp: new Date().toISOString(),
    metadata: { rank: entry.rank, points: entry.points, isKContent: entry.isKContent }
  }
}

export function normalizeMyDramaList(entry: MyDramaListEntry): NormalizedItem {
  const norm = normalizeTitle(entry.title)
  const score = entry.rating * 10 + Math.log10(Math.max(entry.votes, 1)) * 20 + Math.max(0, 101 - entry.rank) * 1.5
  return {
    rawTitle: entry.title,
    normalizedTitle: norm,
    tokens: tokenize(norm),
    source: 'mydramalist',
    score,
    mentionCount: 1,
    commentCount: 0,
    timestamp: new Date().toISOString(),
    metadata: { rank: entry.rank, rating: entry.rating, votes: entry.votes, genres: entry.genres, actors: entry.actors }
  }
}
