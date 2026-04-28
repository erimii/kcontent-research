// ============================================================
// 점수화 모듈: 클러스터에 최종 점수 부여
// 언급수 × 가중치 + 댓글수 + 소스다양성 + 최신성
// ============================================================

import type { ContentCluster, NormalizedItem, SourceType } from '../types/index.js'

// ============================================================
// 소스별 신뢰도 가중치
// ============================================================

const SOURCE_WEIGHT: Record<SourceType, number> = {
  flixpatrol: 3.0,    // 실제 시청 데이터 기반
  mydramalist: 2.5,   // 팬 평점 + 투표
  letterboxd: 2.0,    // 리뷰 발화량
  fundex: 1.8,        // 국내 화제성 지표
  google_trends: 1.5, // 검색 관심도
  reddit: 1.2,        // 커뮤니티 발화
}

// 플랫폼별 가중치 (글로벌 영향력)
const PLATFORM_WEIGHT: Record<string, number> = {
  netflix: 2.0,
  disney: 1.5,
  apple: 1.3,
  amazon: 1.2,
  hulu: 1.1,
  default: 1.0,
}

// ============================================================
// 제목 길이/복잡도 기반 콘텐츠 신호 점수 (RSS에서 upvote 정보 없을 때)
// ============================================================

function contentSignalScore(items: NormalizedItem[]): number {
  let score = 0
  for (const item of items) {
    // 제목에 특정 패턴이 있으면 추가 점수
    const raw = item.rawTitle.toLowerCase()
    if (raw.includes('episode') || raw.includes('ep '))  score += 3
    if (raw.includes('season'))                           score += 2
    if (raw.includes('review') || raw.includes('watch')) score += 4
    if (raw.includes('recommend') || raw.includes('suggest')) score += 5
    if (raw.includes('best') || raw.includes('top'))     score += 3
    if (raw.includes('worst') || raw.includes('drop'))   score += 2
    // 댓글이 많은 포스트에 추가 가중치
    if (item.commentCount > 50)  score += 10
    if (item.commentCount > 100) score += 15
    if (item.commentCount > 200) score += 20
  }
  return score
}

// ============================================================
// 최신성 점수 (최근 7일 내 = 최고)
// ============================================================

function recencyScore(timestamps: string[]): number {
  if (timestamps.length === 0) return 0

  const now = Date.now()
  const scores = timestamps.map(ts => {
    const age = now - new Date(ts).getTime()
    const ageDays = age / (1000 * 60 * 60 * 24)
    // 0일=100, 1일=90, 3일=70, 7일=40, 14일=10
    if (ageDays < 1) return 100
    if (ageDays < 3) return 90 - ageDays * 10
    if (ageDays < 7) return 70 - ageDays * 5
    if (ageDays < 14) return 40 - ageDays * 2
    return 10
  })

  return Math.max(...scores)
}

// ============================================================
// 언급 점수
// ============================================================

function mentionScore(items: NormalizedItem[]): number {
  let total = 0
  for (const item of items) {
    const weight = SOURCE_WEIGHT[item.source] ?? 1.0
    const platformWeight = PLATFORM_WEIGHT[item.platform?.toLowerCase() ?? 'default'] ?? 1.0
    total += item.score * weight * platformWeight
  }
  return total
}

// ============================================================
// 참여도 점수 (댓글, 투표 등)
// ============================================================

function engagementScore(items: NormalizedItem[]): number {
  const totalComments = items.reduce((sum, i) => sum + i.commentCount, 0)
  // 로그 스케일로 정규화 (댓글 1000개 = 60점)
  return Math.log10(Math.max(totalComments + 1, 1)) * 20
}

// ============================================================
// 소스 다양성 보너스
// 여러 소스에서 동시 언급 = 진짜 핫한 콘텐츠
// ============================================================

function sourceDiversityBonus(cluster: ContentCluster): number {
  const sourceCount = cluster.sources.length
  const regionCount = cluster.regions.length
  // 소스 수 × 15점 + 지역 수 × 10점
  return sourceCount * 15 + regionCount * 10
}

// ============================================================
// K콘텐츠 보너스
// ============================================================

function kContentBonus(cluster: ContentCluster): number {
  return cluster.isKContent ? 20 : 0
}

// ============================================================
// 메인 점수화 함수
// ============================================================

export function scoreCluster(cluster: ContentCluster): ContentCluster {
  const timestamps = cluster.rawItems.map(i => i.timestamp)

  const mention = mentionScore(cluster.rawItems)
  const engagement = engagementScore(cluster.rawItems)
  const recency = recencyScore(timestamps)
  const diversity = sourceDiversityBonus(cluster)
  const kBonus = kContentBonus(cluster)
  const contentSignal = contentSignalScore(cluster.rawItems)

  // 최종 점수 = 각 컴포넌트의 가중 합산
  const finalScore =
    mention * 0.35 +
    engagement * 0.20 +
    recency * 0.20 +
    diversity * 0.10 +
    contentSignal * 0.10 +
    kBonus * 0.05

  return {
    ...cluster,
    mentionScore: Math.round(mention),
    engagementScore: Math.round(engagement),
    recencyScore: Math.round(recency),
    totalScore: Math.round(mention + engagement + recency + diversity + kBonus),
    finalScore: Math.round(finalScore),
  }
}

// ============================================================
// 클러스터 배열 점수화 + 정렬
// ============================================================

export function scoreAndRank(clusters: ContentCluster[]): ContentCluster[] {
  return clusters
    .map(scoreCluster)
    .sort((a, b) => b.finalScore - a.finalScore)
}
