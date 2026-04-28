import type { PipelineInput, RankedReport } from '../types/index.js'
import { normalizeRedditPost, normalizeFlixPatrol, normalizeMyDramaList } from './normalizer.js'
import { clusterItems } from './clusterer.js'
import { scoreAndRank } from './scorer.js'
import { generateInsights, categorizeRedditPosts } from './insight.js'

export function runPipeline(input: PipelineInput): RankedReport {
  const {
    redditPosts = [],
    flixPatrolEntries = [],
    myDramaListEntries = [],
    reportType = 'daily',
  } = input

  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  // Step 1: 정규화
  const normalized = [
    ...redditPosts.map(normalizeRedditPost),
    ...flixPatrolEntries.map(normalizeFlixPatrol),
    ...myDramaListEntries.map(normalizeMyDramaList),
  ].filter(n => n.normalizedTitle.length > 2)

  // Step 2: 클러스터링
  const clusters = clusterItems(normalized)

  // Step 3: 점수화 + 랭킹
  const ranked = scoreAndRank(clusters)

  // Step 4: 그룹화
  const topByPlatform: Record<string, typeof ranked> = {}
  const topByRegion: Record<string, typeof ranked> = {}
  for (const c of ranked) {
    for (const p of c.platforms) {
      if (!topByPlatform[p]) topByPlatform[p] = []
      topByPlatform[p].push(c)
    }
    if (!c.platforms.length) {
      topByPlatform['other'] = topByPlatform['other'] ?? []
      topByPlatform['other'].push(c)
    }
    for (const r of c.regions) {
      if (!topByRegion[r]) topByRegion[r] = []
      topByRegion[r].push(c)
    }
    if (!c.regions.length) {
      topByRegion['Global'] = topByRegion['Global'] ?? []
      topByRegion['Global'].push(c)
    }
  }

  // Step 5: 인사이트
  const insights = generateInsights(ranked)

  // Step 6: Reddit 카테고리 요약
  const redditSummary = redditPosts.length > 0 ? categorizeRedditPosts(redditPosts) : undefined

  return {
    id: `report_${now.getTime()}`,
    reportType,
    generatedAt: now.toISOString(),
    period: { from: periodFrom.toISOString(), to: now.toISOString() },
    topContents: ranked.slice(0, 30),
    topByPlatform,
    topByRegion,
    insights,
    sourceSummary: [
      { source: 'reddit', itemCount: redditPosts.length, crawledAt: now.toISOString() },
      { source: 'flixpatrol', itemCount: flixPatrolEntries.length, crawledAt: now.toISOString() },
      { source: 'mydramalist', itemCount: myDramaListEntries.length, crawledAt: now.toISOString() },
    ].filter(s => s.itemCount > 0),
    redditSummary,
  }
}
