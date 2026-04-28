// ============================================================
// 정규화 모듈: 제목 클리닝 + 토큰화
// ============================================================

import type { NormalizedItem, RedditPost, FlixPatrolEntry, MyDramaListEntry } from '../types/index.js'

// 한국 콘텐츠 감지 키워드
const K_CONTENT_SIGNALS = [
  'korean', 'korea', 'kdrama', 'k-drama', 'kdramas',
  'hangul', 'seoul', 'busan', 'netflix korea',
  // 주요 방송사/OTT
  'tvn', 'mbc', 'kbs', 'sbs', 'jtbc', 'wavve', 'watcha',
  // 공통 장르/패턴
  'oppa', 'noona', 'eonni', 'ahjussi', 'chaebol', 'conglomerate heir',
]

// 불용어 (랭킹에 의미없는 단어들)
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'my', 'me',
  'you', 'your', 'he', 'she', 'we', 'they', 'his', 'her', 'our', 'their',
  'what', 'which', 'who', 'how', 'when', 'where', 'why',
  'season', 'ep', 'episode', 'part', 'vol',
])

// ============================================================
// 제목 정규화
// ============================================================

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')         // 콜론/대시 → 공백
    .replace(/[''""«»]/g, '')          // 따옴표 제거
    .replace(/\(.*?\)/g, '')           // 괄호 내용 제거 (year, 2024 등)
    .replace(/\[.*?\]/g, '')           // 대괄호 내용 제거
    .replace(/[^a-z0-9\s가-힣]/g, '') // 영문+숫자+한글+공백만 유지
    .replace(/\s+/g, ' ')             // 연속 공백 제거
    .trim()
}

export function tokenize(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

// ============================================================
// K콘텐츠 감지
// ============================================================

export function detectKContent(title: string, metadata: Record<string, unknown> = {}): boolean {
  const combined = (title + ' ' + JSON.stringify(metadata)).toLowerCase()
  return K_CONTENT_SIGNALS.some(signal => combined.includes(signal))
}

// ============================================================
// Reddit 포스트 → NormalizedItem
// ============================================================

export function normalizeRedditPost(post: RedditPost): NormalizedItem {
  const normalized = normalizeTitle(post.title)
  const tokens = tokenize(normalized)

  // 제목에서 드라마명 추출 시도 (따옴표, 대괄호 안의 것)
  const titleMatch = post.title.match(/["'「」『』]([^"'「」『』]+)["'「」『』]/)
  const extractedTitle = titleMatch ? titleMatch[1].trim() : post.title

  // 점수: 업보트 + 댓글수 × 2
  const score = post.score + post.commentCount * 2

  return {
    rawTitle: extractedTitle,
    normalizedTitle: normalizeTitle(extractedTitle),
    tokens: tokenize(normalizeTitle(extractedTitle)),
    source: 'reddit',
    score,
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

// ============================================================
// FlixPatrol → NormalizedItem
// ============================================================

export function normalizeFlixPatrol(entry: FlixPatrolEntry): NormalizedItem {
  const normalized = normalizeTitle(entry.title)
  const tokens = tokenize(normalized)

  // 점수: 순위 역산 (1위 = 100점, 10위 = 10점)
  const rankScore = Math.max(0, 101 - entry.rank) * 2
  const score = rankScore + (entry.points || 0)

  return {
    rawTitle: entry.title,
    normalizedTitle: normalized,
    tokens,
    source: 'flixpatrol',
    platform: entry.platform,
    region: entry.region,
    score,
    mentionCount: 1,
    commentCount: 0,
    timestamp: new Date().toISOString(),
    metadata: {
      rank: entry.rank,
      previousRank: entry.previousRank,
      points: entry.points,
      isKContent: entry.isKContent,
      url: entry.url,
    }
  }
}

// ============================================================
// MyDramaList → NormalizedItem
// ============================================================

export function normalizeMyDramaList(entry: MyDramaListEntry): NormalizedItem {
  const normalized = normalizeTitle(entry.title)
  const tokens = tokenize(normalized)

  // 점수: 평점 × 10 + 투표수 로그 스케일
  const ratingScore = entry.rating * 10
  const voteScore = Math.log10(Math.max(entry.votes, 1)) * 20
  const rankScore = Math.max(0, 101 - entry.rank) * 1.5
  const score = ratingScore + voteScore + rankScore

  return {
    rawTitle: entry.title,
    normalizedTitle: normalized,
    tokens,
    source: 'mydramalist',
    score,
    mentionCount: 1,
    commentCount: 0,
    timestamp: new Date().toISOString(),
    metadata: {
      rank: entry.rank,
      rating: entry.rating,
      votes: entry.votes,
      episodes: entry.episodes,
      genres: entry.genres,
      actors: entry.actors,
      url: entry.url,
    }
  }
}
