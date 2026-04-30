// ============================================================
// MDL 드라마별 분석
// - 리뷰를 RedditComment 형태로 변환 → deepAnalysis 재활용
// - 평점 분포(별점 5단계 → 4구간) 산출
// - 자연어 인기 사유 + 감정 요약 + 쟁점 클러스터
// ============================================================

import type {
  MdlDrama,
  MdlDramaAnalysis,
  MdlReview,
  MdlSummary,
  RedditComment,
  RedditPost,
  DebateTopic,
} from '../types/index.js'
import { deepAnalyzePosts } from './deepAnalysis.js'

// MdlReview → RedditComment 변환 (deepAnalysis 재활용용)
function reviewToComment(r: MdlReview, idx: number): RedditComment {
  return {
    id: `mdl_${idx}_${r.username}`,
    body: [r.title, r.body].filter(Boolean).join(' — '),
    score: r.helpful,
    depth: 0,
  }
}

// 드라마를 RedditPost 셰입으로 래핑하면 deepAnalyzePosts(post[]).deepAnalysis가 재활용됨
function dramaToFakePost(d: MdlDrama): RedditPost {
  const comments = d.reviews.map((r, i) => reviewToComment(r, i))
  return {
    id: d.slug,
    subreddit: 'mdl',
    title: d.title,
    selftext: d.description || '',
    url: d.url,
    score: Math.round(d.rating * 10),
    commentCount: d.reviews.length,
    createdAt: new Date().toISOString(),
    comments,
    flair: d.year ? `${d.year}` : undefined,
  }
}

function buildRatingBreakdown(reviews: MdlReview[]) {
  if (reviews.length === 0) {
    return {
      avgOverall: 0,
      distribution: { '9-10': 0, '7-9': 0, '5-7': 0, 'below5': 0 },
    }
  }
  const overalls = reviews.map((r) => r.ratings.overall).filter((n) => n > 0)
  const story = reviews.map((r) => r.ratings.story).filter((n): n is number => typeof n === 'number')
  const acting = reviews.map((r) => r.ratings.acting).filter((n): n is number => typeof n === 'number')
  const music = reviews.map((r) => r.ratings.music).filter((n): n is number => typeof n === 'number')
  const rewatch = reviews.map((r) => r.ratings.rewatch).filter((n): n is number => typeof n === 'number')

  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : undefined)

  const distribution = { '9-10': 0, '7-9': 0, '5-7': 0, 'below5': 0 }
  for (const n of overalls) {
    if (n >= 9) distribution['9-10']++
    else if (n >= 7) distribution['7-9']++
    else if (n >= 5) distribution['5-7']++
    else distribution['below5']++
  }

  return {
    avgOverall: overalls.length ? avg(overalls)! : 0,
    avgStory: avg(story),
    avgActing: avg(acting),
    avgMusic: avg(music),
    avgRewatch: avg(rewatch),
    distribution,
  }
}

function buildPopularityReason(d: MdlDrama, breakdown: ReturnType<typeof buildRatingBreakdown>): string {
  const parts: string[] = []
  if (d.rating >= 8.5) parts.push(`MDL 평점 ${d.rating}/10으로 글로벌 시청자에게 호평`)
  else if (d.rating >= 8.0) parts.push(`MDL 평점 ${d.rating}/10의 안정적인 평가`)
  else parts.push(`MDL 평점 ${d.rating}/10`)

  const dist = breakdown.distribution
  const total = (dist['9-10'] + dist['7-9'] + dist['5-7'] + dist['below5']) || 1
  const high = (dist['9-10'] + dist['7-9']) / total
  if (high >= 0.7) parts.push(`리뷰의 ${Math.round(high * 100)}%가 7점 이상으로 호의적`)
  else if (dist['below5'] / total >= 0.3) parts.push(`5점 미만 리뷰가 ${Math.round((dist['below5'] / total) * 100)}%로 평가 분열`)

  if (breakdown.avgStory && breakdown.avgActing) {
    if (breakdown.avgActing > breakdown.avgStory + 0.5) parts.push(`연기력(${breakdown.avgActing.toFixed(1)})이 스토리(${breakdown.avgStory.toFixed(1)})보다 높게 평가됨`)
    else if (breakdown.avgStory > breakdown.avgActing + 0.5) parts.push(`스토리(${breakdown.avgStory.toFixed(1)})가 연기(${breakdown.avgActing.toFixed(1)})보다 높게 평가됨`)
  }

  if (d.year) parts.push(`${d.year}년 ${d.episodes ? d.episodes + '부작' : ''}`.trim())

  let text = parts.join(', ')
  if (text && !/[.!?]$/.test(text)) text += '.'
  return text || '시청자 평가 데이터가 누적 중입니다.'
}

function buildSentimentSummary(pos: number, neg: number): string {
  const total = pos + neg
  if (total === 0) return '리뷰 표본이 부족해 감정 분포 판단이 어렵습니다.'
  const posR = pos / total
  if (posR >= 0.7) return `리뷰의 ${Math.round(posR * 100)}%가 긍정적이며 호의적 분위기가 우세합니다.`
  if (posR <= 0.3) return `리뷰의 ${Math.round((1 - posR) * 100)}%가 비판적으로, 부정적 평가가 다수입니다.`
  if (Math.abs(posR - 0.5) < 0.15) return `긍정 ${Math.round(posR * 100)}% · 부정 ${Math.round((1 - posR) * 100)}%로 평가가 양분되어 있습니다.`
  return posR > 0.5 ? `긍정(${Math.round(posR * 100)}%)이 부정(${Math.round((1 - posR) * 100)}%)을 앞서며 호의적 우세입니다.` : `부정(${Math.round((1 - posR) * 100)}%)이 긍정(${Math.round(posR * 100)}%)을 앞서며 비판적 우세입니다.`
}

export function analyzeMdlDramas(dramas: MdlDrama[]): MdlSummary {
  // deepAnalysis로 리뷰별 토픽/감정 처리 (드라마 단위로 1개 fake post씩)
  const fakePosts = dramas.map(dramaToFakePost)
  const deepResults = deepAnalyzePosts(fakePosts)

  // 평가 분열 판정 (둘 중 하나 만족 시 polarized=true)
  // 1) MDL 공식 평점 ≥ 8 인데 5점 미만 리뷰 비율이 30% 이상 → 공식 평점과 실제 시청자 분포 불일치
  // 2) 리뷰 댓글 감정 분포가 양분 (긍/부 모두 ≥ 30% AND 차이 < 25%p)
  const detectPolarized = (drama: MdlDrama, breakdown: ReturnType<typeof buildRatingBreakdown>, posRatio: number, negRatio: number): { polarized: boolean; reason?: string } => {
    const dist = breakdown.distribution
    const totalDist = (dist['9-10'] + dist['7-9'] + dist['5-7'] + dist['below5']) || 0
    const below5Ratio = totalDist ? dist['below5'] / totalDist : 0
    if (drama.rating >= 8 && below5Ratio >= 0.3) {
      return { polarized: true, reason: `MDL 평점 ${drama.rating}/10 vs 5점 미만 리뷰 ${Math.round(below5Ratio * 100)}%` }
    }
    if (posRatio >= 0.3 && negRatio >= 0.3 && Math.abs(posRatio - negRatio) < 0.25) {
      return { polarized: true, reason: `댓글 긍정 ${Math.round(posRatio * 100)}% vs 부정 ${Math.round(negRatio * 100)}%` }
    }
    return { polarized: false }
  }

  const analyses: MdlDramaAnalysis[] = dramas.map((d, i) => {
    const breakdown = buildRatingBreakdown(d.reviews)
    const deep = deepResults[i]
    const { polarized, reason: polarizedReason } = detectPolarized(d, breakdown, deep.sentiment.positiveRatio, deep.sentiment.negativeRatio)

    const repReviews = [...d.reviews]
      .sort((a, b) => b.helpful - a.helpful)
      .slice(0, 3)
      .map((r) => {
        const lower = r.body.toLowerCase()
        const POS = ['love', 'amazing', 'great', 'masterpiece', 'beautiful', 'perfect', 'incredible', 'fantastic', 'enjoy']
        const NEG = ['hate', 'bad', 'boring', 'disappointing', 'worst', 'awful', 'terrible']
        const p = POS.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
        const n = NEG.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
        const sentiment: 'positive' | 'negative' | 'neutral' = p > n ? 'positive' : n > p ? 'negative' : 'neutral'
        const trimmed = r.body.length > 280 ? r.body.slice(0, 277) + '...' : r.body
        return {
          username: r.username,
          rating: r.ratings.overall,
          helpful: r.helpful,
          body: trimmed,
          sentiment,
        }
      })

    return {
      drama: {
        slug: d.slug,
        title: d.title,
        nativeTitle: d.nativeTitle,
        url: d.url,
        rating: d.rating,
        posterUrl: d.posterUrl,
        episodes: d.episodes,
        year: d.year,
        description: d.description,
        reviewCount: d.reviews.length,
      },
      reviewSentiment: {
        positive: deep.sentiment.positive,
        negative: deep.sentiment.negative,
        neutral: 0,
        positiveRatio: deep.sentiment.positiveRatio,
        negativeRatio: deep.sentiment.negativeRatio,
      },
      sentimentSummary: buildSentimentSummary(deep.sentiment.positive, deep.sentiment.negative),
      ratingBreakdown: breakdown,
      reviewDebates: deep.commentDebates,
      popularityReason: buildPopularityReason(d, breakdown),
      representativeReviews: repReviews,
      polarized,
      polarizedReason,
    }
  })

  // 집계
  const ratings = dramas.map((d) => d.rating).filter((n) => n > 0)
  const avgRating = ratings.length ? ratings.reduce((s, n) => s + n, 0) / ratings.length : 0

  // 모든 드라마의 debates에서 가장 자주 등장하는 호평/비판 토픽
  const praiseCount = new Map<string, number>()
  const critCount = new Map<string, number>()
  for (const a of analyses) {
    for (const d of a.reviewDebates) {
      if (d.opinionDirection === 'positive') praiseCount.set(d.topic, (praiseCount.get(d.topic) ?? 0) + d.count)
      else if (d.opinionDirection === 'negative') critCount.set(d.topic, (critCount.get(d.topic) ?? 0) + d.count)
    }
  }
  const topPraisedTopic = [...praiseCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const topCriticizedTopic = [...critCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  const totalPos = analyses.reduce((s, a) => s + a.reviewSentiment.positive, 0)
  const totalNeg = analyses.reduce((s, a) => s + a.reviewSentiment.negative, 0)
  const overallSentimentSummary = buildSentimentSummary(totalPos, totalNeg)

  const now = new Date()
  return {
    fetchedAt: now.toISOString(),
    cached: false,
    expiresAt: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
    dramas: analyses,
    aggregate: {
      avgRating,
      topPraisedTopic,
      topCriticizedTopic,
      overallSentimentSummary,
    },
  }
}
