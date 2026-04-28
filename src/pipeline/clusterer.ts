// ============================================================
// 클러스터링 모듈: 같은 작품으로 보이는 항목 묶기
// Jaccard 유사도 + 토큰 겹침 기반
// ============================================================

import type { NormalizedItem, ContentCluster, ContentType } from '../types/index.js'
import { normalizeTitle, tokenize } from './normalizer.js'

// ============================================================
// Jaccard 유사도 계산
// ============================================================

function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 1
  if (tokensA.length === 0 || tokensB.length === 0) return 0

  const setA = new Set(tokensA)
  const setB = new Set(tokensB)

  const intersection = [...setA].filter(t => setB.has(t)).length
  const union = new Set([...setA, ...setB]).size

  return intersection / union
}

// ============================================================
// Levenshtein 거리 (짧은 제목용 폴백)
// ============================================================

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

// ============================================================
// 두 아이템이 같은 작품인지 판단
// ============================================================

const SIMILARITY_THRESHOLD = 0.45  // Jaccard 임계값
const LEVENSHTEIN_THRESHOLD = 0.75 // Levenshtein 임계값 (짧은 제목용)

function isSameContent(a: NormalizedItem, b: NormalizedItem): boolean {
  // 완전 일치
  if (a.normalizedTitle === b.normalizedTitle) return true

  // 한쪽이 다른쪽의 부분 문자열 (ex: "my mister" vs "my mister season 2")
  if (a.normalizedTitle.includes(b.normalizedTitle) ||
    b.normalizedTitle.includes(a.normalizedTitle)) {
    const longer = a.normalizedTitle.length > b.normalizedTitle.length
      ? a.normalizedTitle : b.normalizedTitle
    const shorter = a.normalizedTitle.length <= b.normalizedTitle.length
      ? a.normalizedTitle : b.normalizedTitle
    // 짧은 게 긴 것의 60% 이상이면 같은 것으로 간주
    if (shorter.length / longer.length >= 0.6) return true
  }

  // 토큰이 충분하면 Jaccard 유사도
  if (a.tokens.length >= 2 && b.tokens.length >= 2) {
    const jacc = jaccardSimilarity(a.tokens, b.tokens)
    if (jacc >= SIMILARITY_THRESHOLD) return true
  }

  // 토큰이 적으면 Levenshtein
  const lev = levenshteinSimilarity(a.normalizedTitle, b.normalizedTitle)
  if (lev >= LEVENSHTEIN_THRESHOLD) return true

  return false
}

// ============================================================
// 대표 제목 선정
// 우선순위: FlixPatrol > MyDramaList > Reddit
// ============================================================

function pickRepresentativeTitle(items: NormalizedItem[]): string {
  const priority: Record<string, number> = {
    flixpatrol: 3,
    mydramalist: 2,
    letterboxd: 2,
    fundex: 1,
    reddit: 0,
    google_trends: 0,
  }

  const sorted = [...items].sort((a, b) => {
    const pa = priority[a.source] ?? 0
    const pb = priority[b.source] ?? 0
    if (pa !== pb) return pb - pa
    // 같은 소스면 원본 제목 길이가 적당한 것 (너무 짧거나 길지 않게)
    const la = Math.abs(a.rawTitle.length - 20)
    const lb = Math.abs(b.rawTitle.length - 20)
    return la - lb
  })

  return sorted[0]?.rawTitle ?? items[0]?.rawTitle ?? 'Unknown'
}

// ============================================================
// 콘텐츠 타입 추론
// ============================================================

function inferContentType(items: NormalizedItem[]): ContentType {
  const allText = items.map(i => JSON.stringify(i.metadata)).join(' ').toLowerCase()
  const genres = items.flatMap(i => (i.metadata?.genres as string[] | undefined) ?? []).join(' ').toLowerCase()

  if (allText.includes('episode') || allText.includes('drama') ||
    genres.includes('drama') || allText.includes('season')) {
    return 'drama'
  }
  if (allText.includes('film') || allText.includes('movie') || genres.includes('film')) {
    return 'movie'
  }
  if (allText.includes('variety') || allText.includes('show') || allText.includes('reality')) {
    return 'variety'
  }
  return 'unknown'
}

// ============================================================
// K콘텐츠 여부 판단
// ============================================================

function isKContent(items: NormalizedItem[]): boolean {
  return items.some(i =>
    i.source === 'mydramalist' ||
    i.source === 'fundex' ||
    (i.metadata?.isKContent as boolean) === true ||
    (i.metadata?.subreddit as string | undefined)?.includes('kdrama')
  )
}

// ============================================================
// 메인 클러스터링 함수
// ============================================================

let clusterIdCounter = 0

function generateClusterId(): string {
  return `cluster_${Date.now()}_${++clusterIdCounter}`
}

export function clusterItems(items: NormalizedItem[]): ContentCluster[] {
  const clusters: NormalizedItem[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue

    const group: NormalizedItem[] = [items[i]]
    assigned.add(i)

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue
      if (isSameContent(items[i], items[j])) {
        group.push(items[j])
        assigned.add(j)
      }
    }

    clusters.push(group)
  }

  return clusters.map(group => buildCluster(group))
}

function buildCluster(items: NormalizedItem[]): ContentCluster {
  const representativeTitle = pickRepresentativeTitle(items)
  const aliases = [...new Set(items.map(i => i.rawTitle))].filter(t => t !== representativeTitle)
  const sources = [...new Set(items.map(i => i.source))]
  const platforms = [...new Set(items.map(i => i.platform).filter(Boolean))] as string[]
  const regions = [...new Set(items.map(i => i.region).filter(Boolean))] as string[]

  // 배우 수집
  const actors = [...new Set(
    items.flatMap(i => (i.metadata?.actors as string[] | undefined) ?? [])
  )]

  // 장르 수집
  const genres = [...new Set(
    items.flatMap(i => (i.metadata?.genres as string[] | undefined) ?? [])
  )]

  // 상위 댓글 수집
  const topComments = items
    .flatMap(i => (i.metadata?.topComments as string[] | undefined) ?? [])
    .filter(c => c && c.length > 20)
    .slice(0, 5)

  // 시간 범위
  const timestamps = items.map(i => i.timestamp).sort()
  const firstSeen = timestamps[0] ?? new Date().toISOString()
  const lastSeen = timestamps[timestamps.length - 1] ?? new Date().toISOString()

  return {
    clusterId: generateClusterId(),
    representativeTitle,
    aliases,
    contentType: inferContentType(items),
    sources,
    platforms,
    regions,
    totalScore: 0,      // scorer에서 채움
    mentionScore: 0,
    engagementScore: 0,
    recencyScore: 0,
    finalScore: 0,
    rawItems: items,
    topComments,
    firstSeen,
    lastSeen,
    isKContent: isKContent(items),
    actors,
    genres,
  }
}
