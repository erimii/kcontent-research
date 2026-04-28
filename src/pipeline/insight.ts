import type { ContentCluster, InsightSentence, RedditPost, RedditCategorySummary } from '../types/index.js'

export function generateInsights(ranked: ContentCluster[]): InsightSentence[] {
  const insights: InsightSentence[] = []
  if (!ranked.length) return insights

  const top = ranked[0]
  const topK = ranked.filter(c => c.isKContent)

  // 1위 콘텐츠
  if (top) {
    insights.push({
      category: 'dominant',
      text: `"${top.representativeTitle}" is dominating this period — highest engagement across ${top.sources.join(', ')}.`,
      evidence: [`Score: ${top.finalScore}`, `Sources: ${top.sources.join(', ')}`, `Regions: ${top.regions.join(', ') || 'Global'}`],
      score: top.finalScore,
    })
  }

  // K콘텐츠 최상위
  if (topK.length > 0) {
    const kTop = topK[0]
    const kRank = ranked.indexOf(kTop) + 1
    insights.push({
      category: 'dominant',
      text: `K-Content leads with "${kTop.representativeTitle}" at #${kRank} overall — strong global fan demand.`,
      evidence: [`Mention score: ${kTop.mentionScore}`, `Platforms: ${kTop.platforms.join(', ') || 'Multiple'}`],
      score: kTop.finalScore,
    })
  }

  // 멀티소스 버즈
  const multiSource = ranked.filter(c => c.sources.length >= 2).slice(0, 3)
  for (const ms of multiSource) {
    insights.push({
      category: 'rising',
      text: `"${ms.representativeTitle}" trending across ${ms.sources.length} sources (${ms.sources.join(', ')}) — broad cross-platform buzz.`,
      evidence: [`Source diversity: ${ms.sources.length}`],
      score: ms.finalScore,
    })
  }

  // 신규 진입
  const newcomers = ranked.filter(c => c.aliases.length === 0 && c.sources.length === 1).slice(0, 2)
  for (const nc of newcomers) {
    const rank = ranked.indexOf(nc) + 1
    if (rank <= 15) {
      insights.push({
        category: 'newcomer',
        text: `"${nc.representativeTitle}" appears as new entry at #${rank} — early signal worth watching.`,
        evidence: [`Source: ${nc.sources[0]}`, `Score: ${nc.finalScore}`],
        score: nc.finalScore,
      })
    }
  }

  // 장르 트렌드
  const genreMap = new Map<string, number>()
  for (const c of ranked.slice(0, 15)) {
    for (const g of c.genres) genreMap.set(g, (genreMap.get(g) ?? 0) + 1)
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topGenres.length > 0) {
    insights.push({
      category: 'genre',
      text: `Dominant genres: ${topGenres.map(([g, c]) => `${g}(${c})`).join(', ')} — align content strategy accordingly.`,
      evidence: topGenres.map(([g, c]) => `${g}: ${c} titles`),
      score: 40,
    })
  }

  // 배우 언급
  const actorMap = new Map<string, number>()
  for (const c of ranked.slice(0, 10)) {
    for (const a of c.actors) actorMap.set(a, (actorMap.get(a) ?? 0) + c.finalScore)
  }
  const topActors = [...actorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topActors.length > 0) {
    insights.push({
      category: 'actor',
      text: `Most featured actors: ${topActors.map(([n]) => n).join(', ')} — strong fan engagement signals.`,
      evidence: topActors.map(([n, s]) => `${n}: ${s}pts`),
      score: topActors[0][1],
    })
  }

  // 권역별 K콘텐츠
  const regionMap = new Map<string, number>()
  for (const c of topK) {
    for (const r of c.regions) regionMap.set(r, (regionMap.get(r) ?? 0) + c.finalScore)
  }
  const topRegions = [...regionMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topRegions.length > 0) {
    insights.push({
      category: 'regional',
      text: `K-Content strongest in: ${topRegions.map(([r]) => r).join(', ')} — prioritize these markets.`,
      evidence: topRegions.map(([r, s]) => `${r}: ${s}pts`),
      score: 35,
    })
  }

  return insights.sort((a, b) => b.score - a.score).slice(0, 8)
}

export function categorizeRedditPosts(posts: RedditPost[]): RedditCategorySummary {
  const recKW = ['recommend','suggestion','similar to','looking for','what should','any good']
  const posKW = ['love','amazing','great','excellent','best','favorite','worth','masterpiece']
  const negKW = ['hate','bad','boring','disappointing','worst','skip','drop']
  const cultKW = ['korean culture','learn korean','travel','food','customs','tradition','language']
  const titlePat = /["'「」『』]([^"'「」『』]{2,40})["'「」『』]/g

  const recs = new Map<string, number>()
  const reviews = new Map<string, { count: number; pos: number; neg: number }>()
  const cultural = new Map<string, number>()

  for (const p of posts) {
    const full = (p.title + ' ' + p.comments.map(c => c.body).join(' ')).toLowerCase()
    const fullOrig = p.title + ' ' + p.comments.map(c => c.body).join(' ')

    if (recKW.some(k => full.includes(k))) {
      for (const m of fullOrig.matchAll(titlePat)) {
        recs.set(m[1].trim(), (recs.get(m[1].trim()) ?? 0) + 1)
      }
    }
    for (const m of p.title.matchAll(titlePat)) {
      const t = m[1].trim()
      const ex = reviews.get(t) ?? { count: 0, pos: 0, neg: 0 }
      reviews.set(t, {
        count: ex.count + 1,
        pos: ex.pos + posKW.filter(k => full.includes(k)).length,
        neg: ex.neg + negKW.filter(k => full.includes(k)).length,
      })
    }
    for (const kw of cultKW) {
      if (full.includes(kw)) cultural.set(kw, (cultural.get(kw) ?? 0) + 1)
    }
  }

  return {
    recommendations: [...recs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count })),
    reviews: [...reviews.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([title, d]) => ({
      title, count: d.count,
      sentiment: (d.pos > d.neg ? 'positive' : d.neg > d.pos ? 'negative' : 'mixed') as 'positive' | 'mixed' | 'negative',
    })),
    actorMentions: [],
    culturalQuestions: [...cultural.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count })),
    hotPosts: [...posts].sort((a, b) => b.score - a.score).slice(0, 5),
  }
}
