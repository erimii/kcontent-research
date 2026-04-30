// ============================================================
// 6단계 파이프라인 오케스트레이션
// 1. 수집 (이미 완료된 redditPosts 인풋)
// 2. 필터링 (filter.ts)
// 3. 트렌드 분석 (trends.ts)
// 4. 인기 포스트 선정 (insight.ts: categorizeRedditPosts.hotPosts)
// 5. 딥 분석 (deepAnalysis.ts)
// 6. 인사이트 생성 (insight.ts: generateKoreanInsights)
// ============================================================

import type { PipelineInput, RankedReport } from '../types/index.js'
import { normalizeRedditPost } from './normalizer.js'
import { clusterItems } from './clusterer.js'
import { scoreAndRank } from './scorer.js'
import {
  generateInsights,
  categorizeRedditPosts,
  generateKoreanInsights,
} from './insight.js'
import { filterPosts } from './filter.js'
import {
  analyzeContentTrend,
  analyzeSentimentTrend,
  analyzeBehaviorTrend,
  analyzeBySubreddit,
} from './trends.js'
import { deepAnalyzePosts } from './deepAnalysis.js'

export function runPipeline(input: PipelineInput): RankedReport {
  const {
    redditPosts = [],
    reportType = 'daily',
    filterOptions = {},
    extraKnownDramaTitles = [],
  } = input

  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  // ── Stage 2: 필터링 ─────────────────────────────────────────
  const { filtered: cleanPosts, stats: filterStats } = filterPosts(redditPosts, filterOptions)

  // ── Stage 3: 전체 트렌드 분석 ───────────────────────────────
  const contentTrend = analyzeContentTrend(cleanPosts, extraKnownDramaTitles)
  const sentimentTrend = analyzeSentimentTrend(cleanPosts)
  const behaviorTrend = analyzeBehaviorTrend(cleanPosts)
  const subredditInsights = analyzeBySubreddit(cleanPosts)

  // ── Stage 4: 인기 포스트 선정 (legacy redditSummary 그대로 이용) ─
  const redditSummary = cleanPosts.length > 0 ? categorizeRedditPosts(cleanPosts) : undefined
  const hotPosts = redditSummary?.hotPosts ?? []

  // ── Stage 5: 딥 분석 (TOP5) ─────────────────────────────────
  const deepAnalysis = deepAnalyzePosts(hotPosts.slice(0, 5))

  // ── Stage 6: 한국어 해석 인사이트 ─────────────────────────────
  const koreanInsights = generateKoreanInsights({
    content: contentTrend,
    sentiment: sentimentTrend,
    behavior: behaviorTrend,
    subredditInsights,
    deepAnalysis,
  })

  // ── 기존 클러스터·랭킹 파이프라인 (레거시 호환) ───────────────
  const normalized = cleanPosts.map(normalizeRedditPost).filter((n) => {
    if (n.normalizedTitle.length <= 2) return false
    const raw = n.rawTitle.trim()
    const lower = raw.toLowerCase()

    const STATION_NAMES = ['jtbc', 'kbs', 'mbc', 'sbs', 'tvn', 'ocn', 'ena', 'wavve', 'tving', 'netflix']
    if (STATION_NAMES.includes(lower.replace(/[^a-z]/g, ''))) return false

    const MUSIC_SHOWS = ['music core', 'inkigayo', 'the show', 'show champion', 'music bank', 'simply k-pop', 'mcountdown']
    if (MUSIC_SHOWS.some((s) => lower.startsWith(s))) return false

    const hasDramaTitle = n.metadata?.hasDramaTitle as boolean
    if (!hasDramaTitle) return false

    const REDDIT_BAD_TITLES = [
      /^(original|i miss|i am|i was|i'm|i've|i'll|it|this|that|the same|a lot|so much|amazing|great|good|bad|yes|no|okay|ok)$/i,
      /^(wemo check|premieres june|premieres|episode \d+|ep\.\s*\d+)$/i,
      /\b(check!?|update|announcement|confirmed)\b/i,
    ]
    if (REDDIT_BAD_TITLES.some((p) => p.test(lower))) return false
    if (raw.split(/\s+/).length < 2) return false

    return true
  })

  const clusters = clusterItems(normalized)
  const ranked = scoreAndRank(clusters)
  const insights = generateInsights(ranked)

  return {
    id: `report_${now.getTime()}`,
    reportType,
    generatedAt: now.toISOString(),
    period: { from: periodFrom.toISOString(), to: now.toISOString() },
    topContents: ranked.slice(0, 30),
    topByPlatform: {},
    topByRegion: {},
    insights,
    sourceSummary: [
      { source: 'reddit', itemCount: redditPosts.length, crawledAt: now.toISOString() },
    ],
    redditSummary,
    filterStats,
    trends: {
      content: contentTrend,
      sentiment: sentimentTrend,
      behavior: behaviorTrend,
    },
    subredditInsights,
    deepAnalysis,
    koreanInsights,
  }
}
