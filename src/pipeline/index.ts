import type { PipelineInput, RankedReport } from '../types/index.js'
import { normalizeRedditPost, normalizeFlixPatrol, normalizeMyDramaList } from './normalizer.js'
import { clusterItems } from './clusterer.js'
import { scoreAndRank } from './scorer.js'
import { generateInsights, categorizeRedditPosts } from './insight.js'
import { detectKorean } from './korean-filter.js'

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
  ].filter(n => {
    if (n.normalizedTitle.length <= 2) return false

    // ── 콘텐츠 제목이 아닌 항목 제거 ──────────────────────────
    const raw = n.rawTitle.trim()
    const lower = raw.toLowerCase()

    // 1) 방송국/플랫폼 이름만 단독으로 올 경우 제외
    const STATION_NAMES = ['jtbc', 'kbs', 'mbc', 'sbs', 'tvn', 'ocn', 'ena', 'wavve', 'tving', 'netflix']
    if (STATION_NAMES.includes(lower.replace(/[^a-z]/g, ''))) return false

    // 2) 음악 방송/예능 (드라마/영화 대시보드이므로 제외)
    const MUSIC_SHOWS = ['music core', 'inkigayo', 'the show', 'show champion', 'music bank', 'simply k-pop', 'mcountdown']
    if (MUSIC_SHOWS.some(s => lower.startsWith(s))) return false

    // 3) Reddit: 명확한 드라마 제목이 아니면 제외
    // Reddit 게시물은 대부분 토론글 → 따옴표 안 제목이 있을 때만 콘텐츠로 인정
    if (n.source === 'reddit') {
      const hasDramaTitle = n.metadata?.hasDramaTitle as boolean
      if (!hasDramaTitle) return false

      // 따옴표로 추출됐더라도 너무 짧거나 일반 단어/문장이면 제외
      const titleLower = raw.toLowerCase()
      const REDDIT_BAD_TITLES = [
        /^(original|i miss|i am|i was|i'm|i've|i'll|it|this|that|the same|a lot|so much|amazing|great|good|bad|yes|no|okay|ok)$/i,
        /^(wemo check|premieres june|premieres|episode \d+|ep\.\s*\d+)$/i,
        /\b(check!?|update|announcement|confirmed)\b/i,
      ]
      if (REDDIT_BAD_TITLES.some(p => p.test(titleLower))) return false

      // 2단어 미만인 경우 너무 짧아서 제외
      if (raw.split(/\s+/).length < 2) return false
    }

    // 4) Soompi/MDL에서 너무 긴 제목 (문장형) 제외
    if (n.source !== 'reddit') {
      const wordCount = raw.split(/\s+/).length
      if (wordCount > 10) return false
    }

    return true
  })

  // Step 1.5: 비한국 콘텐츠 제거
  // 소스별 기준:
  // - reddit: 서브레딧 자체가 K-드라마 전용 → unknown 허용 (단, 드라마 제목 명시된 것만)
  // - flixpatrol(soompi): 한국 기사에서만 제목 추출 → unknown 허용
  // - mydramalist: 한국 관련 기사에서만 제목 추출 → unknown 허용
  // 단, 모든 소스에서 'no'로 명확히 비한국인 경우만 제외
  const kFiltered = normalized.filter(n => {
    const metaStr = JSON.stringify(n.metadata)
    const combined = `${n.rawTitle} ${n.normalizedTitle} ${metaStr}`
    const combinedResult = detectKorean(combined)

    // 명백히 비한국 콘텐츠 → 제외
    if (combinedResult === 'no') return false

    // 모든 소스: 크롤러 단계에서 이미 한국 관련 필터링 완료
    // → unknown 포함 모두 허용 (추가 필터링 불필요)
    return true
  })
  const removedCount = normalized.length - kFiltered.length
  if (removedCount > 0) {
    console.log(`  [Pipeline] 비한국 콘텐츠 ${removedCount}개 제거 (전체 ${normalized.length}개 → ${kFiltered.length}개)`)
  }

  // Step 2: 클러스터링 (비한국 제거된 kFiltered 사용)
  const clusters = clusterItems(kFiltered)

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
