import type {
  ContentCluster, InsightSentence, RedditPost, RedditCategorySummary,
  ContentTrend, SentimentTrend, BehaviorTrend, SubredditInsight,
  DeepAnalysis, KoreanInsight, BehaviorType,
} from '../types/index.js'

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

// ============================================================
// Stage 6: 한국어 해석 인사이트
// ============================================================

const BEHAVIOR_LABEL: Record<BehaviorType, string> = {
  recommendation: '추천 요청',
  review: '리뷰/후기',
  question: '질문',
  discussion: '의견/토론',
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

export function generateKoreanInsights(args: {
  content: ContentTrend
  sentiment: SentimentTrend
  behavior: BehaviorTrend
  subredditInsights: SubredditInsight[]
  deepAnalysis: DeepAnalysis[]
}): KoreanInsight[] {
  const { content, sentiment, behavior, subredditInsights, deepAnalysis } = args
  const out: KoreanInsight[] = []

  // 1. 트렌드 요약 — 무슨 일이 일어나고 있는지
  if (content.topContents.length > 0) {
    const top3 = content.topContents.slice(0, 3).map((c) => `"${c.title}"`).join(', ')
    out.push({
      category: 'trend_summary',
      text: `현재 ${top3}이(가) 가장 많이 언급되며 글로벌 팬덤의 중심 화제로 자리잡고 있습니다.`,
      evidence: content.topContents.slice(0, 5).map((c) => `${c.title}: ${c.count}회`),
    })
  } else if (content.topKeywords.length > 0) {
    const kws = content.topKeywords.slice(0, 5).map((k) => k.keyword).join(', ')
    out.push({
      category: 'trend_summary',
      text: `현재 화두는 ${kws} — 특정 작품보다 일반 키워드 중심의 대화가 활발합니다.`,
      evidence: content.topKeywords.slice(0, 5).map((k) => `${k.keyword}: ${k.count}회`),
    })
  }

  // 2. 팬 반응 특징 — 감정/행동 패턴
  const sentLine = `긍정 ${pct(sentiment.positiveRatio)} · 부정 ${pct(sentiment.negativeRatio)} · 중립 ${pct(sentiment.neutralRatio)}`
  const behTopEntry = (Object.entries(behavior.ratios) as [BehaviorType, number][])
    .sort((a, b) => b[1] - a[1])[0]
  const behTop = behTopEntry ? `${BEHAVIOR_LABEL[behTopEntry[0]]} ${pct(behTopEntry[1])}` : ''
  out.push({
    category: 'fan_reaction',
    text: `감정 분포는 ${sentLine}이며, 게시글 행동은 ${behTop} 비중이 가장 높아 팬들이 능동적으로 ${BEHAVIOR_LABEL[behTopEntry?.[0] ?? 'discussion']}을(를) 주도하는 양상입니다.`,
    evidence: [
      `긍정 ${sentiment.positive}건 / 부정 ${sentiment.negative}건 / 중립 ${sentiment.neutral}건`,
      `행동 분포: ${(Object.entries(behavior.ratios) as [BehaviorType, number][]).map(([k, v]) => `${BEHAVIOR_LABEL[k]} ${pct(v)}`).join(', ')}`,
    ],
  })

  // 3. 콘텐츠 소비 패턴 — TOP 포스트 딥분석 결과
  if (deepAnalysis.length > 0) {
    const avgPos = deepAnalysis.reduce((s, d) => s + d.sentiment.positiveRatio, 0) / deepAnalysis.length
    const totalComments = deepAnalysis.reduce((s, d) => s + d.commentCount, 0)
    const avgComments = Math.round(totalComments / deepAnalysis.length)
    out.push({
      category: 'consumption_pattern',
      text: `상위 ${deepAnalysis.length}개 인기 포스트의 평균 댓글 ${avgComments}개, 댓글 긍정률 ${pct(avgPos)} — 팬들이 단순 소비를 넘어 ${avgPos >= 0.5 ? '적극적 호응으로' : '비판적 토론으로'} 참여하고 있습니다.`,
      evidence: deepAnalysis.slice(0, 3).map((d) => `${d.title.slice(0, 40)}: 댓글 ${d.commentCount}개, 긍정률 ${pct(d.sentiment.positiveRatio)}`),
    })
  }

  // 4. 확장 흐름 — 서브레딧 분포에서 추론
  const totalPosts = subredditInsights.reduce((s, x) => s + x.postCount, 0) || 1
  const koreanSub = subredditInsights.find((s) => s.subreddit === 'korean')
  const travelSub = subredditInsights.find((s) => s.subreddit === 'koreatravel')
  const dramaSubs = subredditInsights.filter((s) =>
    s.subreddit === 'kdramas' || s.subreddit === 'kdrama' || s.subreddit === 'kdramarecommends'
  )
  const dramaPosts = dramaSubs.reduce((s, x) => s + x.postCount, 0)
  const cultPosts = (koreanSub?.postCount ?? 0) + (travelSub?.postCount ?? 0)
  const dramaRatio = dramaPosts / totalPosts
  const cultRatio = cultPosts / totalPosts

  if (cultRatio >= 0.15 && dramaRatio >= 0.4) {
    out.push({
      category: 'expansion',
      text: `드라마 관련 포스트 ${pct(dramaRatio)} 외 한국어/여행 관련 ${pct(cultRatio)} — 콘텐츠 소비가 한국 문화·언어·여행으로 자연스럽게 확장되는 흐름이 관측됩니다.`,
      evidence: subredditInsights.map((s) => `r/${s.subreddit}: ${s.postCount}건 (${s.characteristic})`),
    })
  } else if (dramaRatio >= 0.6) {
    out.push({
      category: 'expansion',
      text: `드라마 카테고리에 ${pct(dramaRatio)}가 집중 — 문화 확장보다는 콘텐츠 자체 소비에 머물러 있어, 추가 확산 트리거가 필요합니다.`,
      evidence: subredditInsights.map((s) => `r/${s.subreddit}: ${s.postCount}건`),
    })
  }

  // 5. 서브레딧별 특성 (옵션)
  if (subredditInsights.length >= 2) {
    const lines = subredditInsights.slice(0, 4).map((s) =>
      `r/${s.subreddit} (${s.characteristic}, ${s.postCount}건, 주 행동: ${BEHAVIOR_LABEL[s.topBehavior]})`
    )
    out.push({
      category: 'subreddit',
      text: `커뮤니티별 성격이 명확합니다 — ${subredditInsights.slice(0, 3).map((s) => `r/${s.subreddit}는 ${BEHAVIOR_LABEL[s.topBehavior]} 중심`).join(', ')}.`,
      evidence: lines,
    })
  }

  return out.slice(0, 5)
}
