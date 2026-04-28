// ============================================================
// 인사이트 문장 생성 모듈
// 템플릿 기반 자동 인사이트 (OpenAI 없이)
// ============================================================

import type { ContentCluster, InsightSentence, RankedReport, RedditCategorySummary, RedditPost } from '../types/index.js'

// ============================================================
// 템플릿 기반 인사이트 생성
// ============================================================

export function generateInsights(
  ranked: ContentCluster[],
  prevRanked?: ContentCluster[]
): InsightSentence[] {
  const insights: InsightSentence[] = []

  if (ranked.length === 0) return insights

  const top = ranked[0]
  const topK = ranked.filter(c => c.isKContent)
  const topNonK = ranked.filter(c => !c.isKContent)

  // 1. 1위 콘텐츠 인사이트
  if (top) {
    const platformStr = top.platforms.length > 0 ? ` on ${top.platforms.join('/')}` : ''
    const sourceStr = top.sources.join(', ')
    insights.push({
      category: 'dominant',
      text: `"${top.representativeTitle}" is dominating this period with the highest engagement score${platformStr}, trending across ${sourceStr}.`,
      evidence: [
        `Final score: ${top.finalScore}`,
        `Sources: ${top.sources.join(', ')}`,
        `Regions: ${top.regions.join(', ') || 'Global'}`,
      ],
      score: top.finalScore,
    })
  }

  // 2. K콘텐츠 최상위
  if (topK.length > 0) {
    const kTop = topK[0]
    const kRank = ranked.indexOf(kTop) + 1
    insights.push({
      category: 'dominant',
      text: `K-Content is strong this week — "${kTop.representativeTitle}" ranks #${kRank} overall, showing global fan demand for Korean content.`,
      evidence: [
        `K-content mention score: ${kTop.mentionScore}`,
        `Platforms: ${kTop.platforms.join(', ') || 'Multiple'}`,
      ],
      score: kTop.finalScore,
    })
  }

  // 3. 신규 진입 (aliases 없고 소스 하나인 것)
  const newcomers = ranked.filter(c => c.aliases.length === 0 && c.sources.length === 1).slice(0, 2)
  for (const nc of newcomers) {
    const rank = ranked.indexOf(nc) + 1
    if (rank <= 10) {
      insights.push({
        category: 'newcomer',
        text: `"${nc.representativeTitle}" appears as a new entry at #${rank} — early signals worth watching.`,
        evidence: [`Source: ${nc.sources[0]}`, `Score: ${nc.finalScore}`],
        score: nc.finalScore,
      })
    }
  }

  // 4. 멀티소스 강자 (3개 이상 소스에서 동시 언급)
  const multiSource = ranked.filter(c => c.sources.length >= 3).slice(0, 2)
  for (const ms of multiSource) {
    insights.push({
      category: 'rising',
      text: `"${ms.representativeTitle}" is trending across ${ms.sources.length} different platforms (${ms.sources.join(', ')}), indicating broad cross-platform buzz.`,
      evidence: [`Source diversity bonus applied`, `Regions: ${ms.regions.join(', ') || 'Multiple'}`],
      score: ms.finalScore,
    })
  }

  // 5. 배우 언급 인사이트
  const actorMap = new Map<string, number>()
  for (const cluster of ranked.slice(0, 10)) {
    for (const actor of cluster.actors) {
      actorMap.set(actor, (actorMap.get(actor) ?? 0) + cluster.finalScore)
    }
  }
  const topActors = [...actorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topActors.length > 0) {
    const actorNames = topActors.map(([name]) => name).join(', ')
    insights.push({
      category: 'actor',
      text: `Most mentioned actors in top content: ${actorNames} — strong fan engagement signals.`,
      evidence: topActors.map(([name, score]) => `${name}: ${score}pts`),
      score: topActors[0][1],
    })
  }

  // 6. 장르 트렌드
  const genreMap = new Map<string, number>()
  for (const cluster of ranked.slice(0, 15)) {
    for (const genre of cluster.genres) {
      genreMap.set(genre, (genreMap.get(genre) ?? 0) + 1)
    }
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topGenres.length > 0) {
    const genreStr = topGenres.map(([g, c]) => `${g}(${c})`).join(', ')
    insights.push({
      category: 'genre',
      text: `Dominant genres this period: ${genreStr} — align content strategy accordingly.`,
      evidence: topGenres.map(([g, c]) => `${g}: appears in ${c} top titles`),
      score: 50,
    })
  }

  // 7. 지역별 K콘텐츠 강세
  const regionKMap = new Map<string, number>()
  for (const cluster of topK) {
    for (const region of cluster.regions) {
      regionKMap.set(region, (regionKMap.get(region) ?? 0) + cluster.finalScore)
    }
  }
  const topRegions = [...regionKMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topRegions.length > 0) {
    const regionStr = topRegions.map(([r]) => r).join(', ')
    insights.push({
      category: 'regional',
      text: `K-Content is strongest in: ${regionStr} — prioritize these markets for community engagement.`,
      evidence: topRegions.map(([r, s]) => `${r}: ${s}pts`),
      score: 40,
    })
  }

  // 점수 내림차순 정렬 후 상위 8개만
  return insights.sort((a, b) => b.score - a.score).slice(0, 8)
}

// ============================================================
// Reddit 카테고리 분류 요약
// ============================================================

export function categorizeRedditPosts(posts: RedditPost[]): RedditCategorySummary {
  const recommendations: Map<string, number> = new Map()
  const reviews: Map<string, { count: number; positiveCount: number; negativeCount: number }> = new Map()
  const actors: Map<string, { count: number; contexts: string[] }> = new Map()
  const culturalTopics: Map<string, number> = new Map()

  // 추천 요청 키워드
  const recKeywords = ['recommend', 'suggestion', 'similar to', 'like', 'looking for', 'what should', 'any good']
  // 리뷰 키워드
  const reviewKeywords = ['review', 'finished', 'just watched', 'episode', 'season', 'thoughts on', 'opinion']
  // 긍정 키워드
  const positiveKeywords = ['love', 'amazing', 'great', 'excellent', 'masterpiece', 'best', 'favorite', 'recommend', 'worth']
  // 부정 키워드
  const negativeKeywords = ['hate', 'bad', 'boring', 'disappointing', 'worst', 'skip', 'drop', 'overrated']
  // 문화 질문 키워드
  const cultureKeywords = ['korean culture', 'korea', 'language', 'learn korean', 'travel', 'food', 'customs', 'tradition']

  // 드라마 제목 추출 패턴
  const titlePattern = /["'「」『』]([^"'「」『』]{2,40})["'「」『』]/g

  for (const post of posts) {
    const fullText = (post.title + ' ' + post.comments.map(c => c.body).join(' ')).toLowerCase()

    // 추천 요청 분류
    if (recKeywords.some(k => fullText.includes(k))) {
      const matches = [...(post.title + ' ' + post.comments.map(c => c.body).join(' ')).matchAll(titlePattern)]
      for (const match of matches) {
        const title = match[1].trim()
        recommendations.set(title, (recommendations.get(title) ?? 0) + 1)
      }
    }

    // 리뷰 분류
    if (reviewKeywords.some(k => fullText.includes(k))) {
      const matches = [...(post.title).matchAll(titlePattern)]
      for (const match of matches) {
        const title = match[1].trim()
        const posCount = positiveKeywords.filter(k => fullText.includes(k)).length
        const negCount = negativeKeywords.filter(k => fullText.includes(k)).length
        const existing = reviews.get(title) ?? { count: 0, positiveCount: 0, negativeCount: 0 }
        reviews.set(title, {
          count: existing.count + 1,
          positiveCount: existing.positiveCount + posCount,
          negativeCount: existing.negativeCount + negCount,
        })
      }
    }

    // 문화 질문 분류
    if (cultureKeywords.some(k => fullText.includes(k))) {
      for (const keyword of cultureKeywords) {
        if (fullText.includes(keyword)) {
          culturalTopics.set(keyword, (culturalTopics.get(keyword) ?? 0) + 1)
        }
      }
    }
  }

  // 핫 포스트 (스코어 상위 5개)
  const hotPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 5)

  return {
    recommendations: [...recommendations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([title, count]) => ({ title, count })),
    reviews: [...reviews.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([title, data]) => ({
        title,
        sentiment: data.positiveCount > data.negativeCount
          ? 'positive'
          : data.negativeCount > data.positiveCount
            ? 'negative'
            : 'mixed' as 'positive' | 'mixed' | 'negative',
        count: data.count,
      })),
    actorMentions: [...actors.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([name, data]) => ({ name, count: data.count, context: data.contexts[0] ?? '' })),
    culturalQuestions: [...culturalTopics.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([topic, count]) => ({ topic, count })),
    hotPosts,
  }
}
