import type { NormalizedItem, ContentCluster, ContentType } from '../types/index.js'
import { detectKorean, K_SUBREDDITS } from './korean-filter.js'
import { cleanDisplayTitle } from './normalizer.js'

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  const inter = [...sa].filter(x => sb.has(x)).length
  return inter / new Set([...sa, ...sb]).size
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function isSame(a: NormalizedItem, b: NormalizedItem): boolean {
  if (a.normalizedTitle === b.normalizedTitle) return true
  // 부분 포함
  const long = a.normalizedTitle.length >= b.normalizedTitle.length ? a.normalizedTitle : b.normalizedTitle
  const short = a.normalizedTitle.length < b.normalizedTitle.length ? a.normalizedTitle : b.normalizedTitle
  if (long.includes(short) && short.length / long.length >= 0.6) return true
  // Jaccard
  if (a.tokens.length >= 2 && b.tokens.length >= 2 && jaccardSimilarity(a.tokens, b.tokens) >= 0.45) return true
  // Levenshtein
  const maxLen = Math.max(a.normalizedTitle.length, b.normalizedTitle.length)
  if (maxLen > 0 && 1 - levenshtein(a.normalizedTitle, b.normalizedTitle) / maxLen >= 0.75) return true
  return false
}

function pickTitle(items: NormalizedItem[]): string {
  const priority: Record<string, number> = { flixpatrol: 3, mydramalist: 2, letterboxd: 2, reddit: 0 }
  const raw = [...items].sort((a, b) => (priority[b.source] ?? 0) - (priority[a.source] ?? 0))[0]?.rawTitle ?? 'Unknown'
  return cleanDisplayTitle(raw)
}

function inferType(items: NormalizedItem[]): ContentType {
  const text = items.map(i => JSON.stringify(i.metadata)).join(' ').toLowerCase()
  if (text.includes('drama') || text.includes('episode') || text.includes('season')) return 'drama'
  if (text.includes('film') || text.includes('movie')) return 'movie'
  if (text.includes('variety') || text.includes('reality')) return 'variety'
  return 'unknown'
}

function isKContent(items: NormalizedItem[]): boolean {
  return items.some(i => {
    // 1. 명시적 K 콘텐츠 플래그
    if ((i.metadata?.isKContent as boolean) === true) return true
    // 2. MDL/Soompi 소스: 이미 한국 기사에서만 추출 → 항상 K 콘텐츠
    if (i.source === 'mydramalist') return true
    if (i.source === 'flixpatrol') return true  // Soompi RSS (한국 기사 전용)
    // 3. 한국 전용 서브레딧
    const sub = i.metadata?.subreddit as string | undefined
    if (sub && K_SUBREDDITS.has(sub)) return true
    // 4. 제목 + 메타데이터로 한국 판별
    const combined = `${i.rawTitle} ${JSON.stringify(i.metadata)}`
    return detectKorean(combined) === 'yes'
  })
}

let counter = 0

export function clusterItems(items: NormalizedItem[]): ContentCluster[] {
  const assigned = new Set<number>()
  const groups: NormalizedItem[][] = []

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue
    const group = [items[i]]
    assigned.add(i)
    for (let j = i + 1; j < items.length; j++) {
      if (!assigned.has(j) && isSame(items[i], items[j])) {
        group.push(items[j])
        assigned.add(j)
      }
    }
    groups.push(group)
  }

  return groups.map(group => {
    const repTitle = pickTitle(group)
    const aliases = [...new Set(group.map(i => i.rawTitle))].filter(t => t !== repTitle)
    const sources = [...new Set(group.map(i => i.source))] as ContentCluster['sources']
    const platforms = [...new Set(group.map(i => i.platform).filter(Boolean))] as string[]
    const regions = [...new Set(group.map(i => i.region).filter(Boolean))] as string[]
    const actors = [...new Set(group.flatMap(i => (i.metadata?.actors as string[]) ?? []))]
    const genres = [...new Set(group.flatMap(i => (i.metadata?.genres as string[]) ?? []))]
    const topComments = group.flatMap(i => (i.metadata?.topComments as string[]) ?? []).filter(c => c?.length > 20).slice(0, 5)
    const timestamps = group.map(i => i.timestamp).sort()

    return {
      clusterId: `cl_${Date.now()}_${counter++}`,
      representativeTitle: repTitle,
      aliases, sources, platforms, regions,
      totalScore: 0, mentionScore: 0, engagementScore: 0, recencyScore: 0, finalScore: 0,
      rawItems: group, topComments,
      firstSeen: timestamps[0] ?? new Date().toISOString(),
      lastSeen: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
      isKContent: isKContent(group),
      actors, genres,
      contentType: inferType(group),
    }
  })
}
