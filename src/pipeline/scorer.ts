import type { ContentCluster } from '../types/index.js'

const SOURCE_WEIGHT: Record<string, number> = {
  reddit: 1.2,
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
    const mention = c.rawItems.reduce((sum, i) => {
      const sw = SOURCE_WEIGHT[i.source] ?? 1.0
      return sum + i.score * sw
    }, 0)
    const totalComments = c.rawItems.reduce((s, i) => s + i.commentCount, 0)
    const engagement = Math.log10(Math.max(totalComments + 1, 1)) * 50
    const rec = recency(c.rawItems.map(i => i.timestamp))
    const kBonus = c.isKContent ? 20 : 0

    // Reddit 단독: mention 40% + engagement 30% + recency 25% + kBonus 5%
    const finalScore = mention * 0.40 + engagement * 0.30 + rec * 0.25 + kBonus * 0.05
    return {
      ...c,
      mentionScore: Math.round(mention),
      engagementScore: Math.round(engagement),
      recencyScore: Math.round(rec),
      totalScore: Math.round(mention + engagement + rec + kBonus),
      finalScore: Math.round(finalScore),
    }
  }).sort((a, b) => b.finalScore - a.finalScore)
}
