import type { ContentCluster } from '../types/index.js'

const SOURCE_WEIGHT: Record<string, number> = {
  flixpatrol: 3.0, mydramalist: 2.5, letterboxd: 2.0,
  fundex: 1.8, google_trends: 1.5, reddit: 1.2,
}

// Reddit 전용 기본 점수: 순수 Reddit 클러스터도 TOP에 진입할 수 있도록
// flixpatrol rank1 = (101-1)*2 + points ≈ 200~5000
// Reddit 포스트는 댓글수*15+100 = 최대 ~400 → 비슷한 스케일로 보정
const REDDIT_BASE_SCORE = 300  // Reddit 단독 클러스터 기본 점수 (flixpatrol 중위권 수준)
const PLATFORM_WEIGHT: Record<string, number> = {
  netflix: 2.0, disney: 1.5, apple: 1.3, amazon: 1.2, hulu: 1.1, default: 1.0,
}

function recency(timestamps: string[]): number {
  if (!timestamps.length) return 0
  const now = Date.now()
  const minAge = Math.min(...timestamps.map(ts => (now - new Date(ts).getTime()) / 86400000))
  if (minAge < 1) return 100
  if (minAge < 3) return 90 - minAge * 10
  if (minAge < 7) return 70 - minAge * 5
  return 20
}

export function scoreAndRank(clusters: ContentCluster[]): ContentCluster[] {
  return clusters.map(c => {
    const hasRedditOnly = c.sources.length === 1 && c.sources[0] === 'reddit'
    const mention = c.rawItems.reduce((sum, i) => {
      const sw = SOURCE_WEIGHT[i.source] ?? 1.0
      const pw = PLATFORM_WEIGHT[i.platform?.toLowerCase() ?? 'default'] ?? 1.0
      // Reddit 단독 클러스터: 기본 점수 보장
      const base = (i.source === 'reddit' && hasRedditOnly) ? REDDIT_BASE_SCORE : 0
      return sum + (base + i.score) * sw * pw
    }, 0)
    const totalComments = c.rawItems.reduce((s, i) => s + i.commentCount, 0)
    const engagement = Math.log10(Math.max(totalComments + 1, 1)) * 50  // 댓글 engagement 가중치 상향
    const rec = recency(c.rawItems.map(i => i.timestamp))
    const diversity = c.sources.length * 15 + c.regions.length * 10
    const kBonus = c.isKContent ? 20 : 0
    const finalScore = mention * 0.40 + engagement * 0.20 + rec * 0.20 + diversity * 0.15 + kBonus * 0.05
    return {
      ...c,
      mentionScore: Math.round(mention),
      engagementScore: Math.round(engagement),
      recencyScore: Math.round(rec),
      totalScore: Math.round(mention + engagement + rec + diversity + kBonus),
      finalScore: Math.round(finalScore),
    }
  }).sort((a, b) => b.finalScore - a.finalScore)
}
