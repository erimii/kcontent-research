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

export function tokenize(str: string): string[] {
  return str.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

export function normalizeRedditPost(post: RedditPost): NormalizedItem {
  const match = post.title.match(/["'「」『』]([^"'「」『』]{2,40})["'「」『』]/)
  const extracted = match ? match[1].trim() : post.title
  const norm = normalizeTitle(extracted)
  return {
    rawTitle: extracted,
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
