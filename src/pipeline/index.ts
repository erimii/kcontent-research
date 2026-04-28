// ============================================================
// 파이프라인 메인: 수집 → 정규화 → 클러스터링 → 점수화 → 인사이트
// ============================================================

import type {
  NormalizedItem, RankedReport, ReportType,
  RedditPost, FlixPatrolEntry, MyDramaListEntry,
} from '../types/index.js'
import {
  normalizeRedditPost, normalizeFlixPatrol, normalizeMyDramaList,
} from './normalizer.js'
import { clusterItems } from './clusterer.js'
import { scoreAndRank } from './scorer.js'
import { generateInsights, categorizeRedditPosts } from './insight.js'

// ============================================================
// 플랫폼별 그룹화
// ============================================================

function groupByPlatform(clusters: ReturnType<typeof scoreAndRank>) {
  const map: Record<string, typeof clusters> = {}
  for (const cluster of clusters) {
    for (const platform of cluster.platforms) {
      if (!map[platform]) map[platform] = []
      map[platform].push(cluster)
    }
    if (cluster.platforms.length === 0) {
      if (!map['other']) map['other'] = []
      map['other'].push(cluster)
    }
  }
  return map
}

function groupByRegion(clusters: ReturnType<typeof scoreAndRank>) {
  const map: Record<string, typeof clusters> = {}
  for (const cluster of clusters) {
    for (const region of cluster.regions) {
      if (!map[region]) map[region] = []
      map[region].push(cluster)
    }
    if (cluster.regions.length === 0) {
      if (!map['Global']) map['Global'] = []
      map['Global'].push(cluster)
    }
  }
  return map
}

// ============================================================
// 메인 파이프라인 실행
// ============================================================

export interface PipelineInput {
  redditPosts?: RedditPost[]
  flixPatrolEntries?: FlixPatrolEntry[]
  myDramaListEntries?: MyDramaListEntry[]
  reportType?: ReportType
}

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

  // ── Step 1: 정규화 ─────────────────────────────────────────
  const normalized: NormalizedItem[] = [
    ...redditPosts.map(normalizeRedditPost),
    ...flixPatrolEntries.map(normalizeFlixPatrol),
    ...myDramaListEntries.map(normalizeMyDramaList),
  ]

  // 빈 토큰 아이템 제거
  const valid = normalized.filter(n => n.normalizedTitle.length > 2)

  // ── Step 2: 클러스터링 ─────────────────────────────────────
  const clusters = clusterItems(valid)

  // ── Step 3: 점수화 + 랭킹 ──────────────────────────────────
  const ranked = scoreAndRank(clusters)

  // ── Step 4: 그룹화 ─────────────────────────────────────────
  const topByPlatform = groupByPlatform(ranked)
  const topByRegion = groupByRegion(ranked)

  // ── Step 5: 인사이트 생성 ──────────────────────────────────
  const insights = generateInsights(ranked)

  // ── Step 6: Reddit 카테고리 요약 ───────────────────────────
  const redditSummary = redditPosts.length > 0
    ? categorizeRedditPosts(redditPosts)
    : undefined

  // ── 소스 통계 ──────────────────────────────────────────────
  const sourceSummary = [
    {
      source: 'reddit' as const,
      itemCount: redditPosts.length,
      crawledAt: now.toISOString(),
    },
    {
      source: 'flixpatrol' as const,
      itemCount: flixPatrolEntries.length,
      crawledAt: now.toISOString(),
    },
    {
      source: 'mydramalist' as const,
      itemCount: myDramaListEntries.length,
      crawledAt: now.toISOString(),
    },
  ].filter(s => s.itemCount > 0)

  return {
    id: `report_${now.getTime()}`,
    reportType,
    generatedAt: now.toISOString(),
    period: {
      from: periodFrom.toISOString(),
      to: now.toISOString(),
    },
    topContents: ranked.slice(0, 30),
    topByPlatform,
    topByRegion,
    insights,
    sourceSummary,
    redditSummary,
  }
}
