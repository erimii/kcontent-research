import type { PipelineInput, RankedReport } from '../types/index.js'
import { normalizeRedditPost } from './normalizer.js'
import { clusterItems } from './clusterer.js'
import { scoreAndRank } from './scorer.js'
import { generateInsights, categorizeRedditPosts } from './insight.js'

export function runPipeline(input: PipelineInput): RankedReport {
  const {
    redditPosts = [],
    reportType = 'daily',
  } = input

  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  // Step 1: 정규화 (Reddit만)
  const normalized = redditPosts.map(normalizeRedditPost).filter(n => {
    if (n.normalizedTitle.length <= 2) return false

    const raw = n.rawTitle.trim()
    const lower = raw.toLowerCase()

    // 방송국/플랫폼 단독 이름 제외
    const STATION_NAMES = ['jtbc', 'kbs', 'mbc', 'sbs', 'tvn', 'ocn', 'ena', 'wavve', 'tving', 'netflix']
    if (STATION_NAMES.includes(lower.replace(/[^a-z]/g, ''))) return false

    // 음악 방송 제외
    const MUSIC_SHOWS = ['music core', 'inkigayo', 'the show', 'show champion', 'music bank', 'simply k-pop', 'mcountdown']
    if (MUSIC_SHOWS.some(s => lower.startsWith(s))) return false

    // Reddit: 따옴표로 명시된 드라마 제목이 있을 때만 포함
    const hasDramaTitle = n.metadata?.hasDramaTitle as boolean
    if (!hasDramaTitle) return false

    const REDDIT_BAD_TITLES = [
      /^(original|i miss|i am|i was|i'm|i've|i'll|it|this|that|the same|a lot|so much|amazing|great|good|bad|yes|no|okay|ok)$/i,
      /^(wemo check|premieres june|premieres|episode \d+|ep\.\s*\d+)$/i,
      /\b(check!?|update|announcement|confirmed)\b/i,
    ]
    if (REDDIT_BAD_TITLES.some(p => p.test(lower))) return false

    // 2단어 미만 제외
    if (raw.split(/\s+/).length < 2) return false

    return true
  })

  // Step 2: 클러스터링
  const clusters = clusterItems(normalized)

  // Step 3: 점수화 + 랭킹
  const ranked = scoreAndRank(clusters)

  // Step 4: 인사이트
  const insights = generateInsights(ranked)

  // Step 5: Reddit 카테고리 요약
  const redditSummary = redditPosts.length > 0 ? categorizeRedditPosts(redditPosts) : undefined

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
  }
}
