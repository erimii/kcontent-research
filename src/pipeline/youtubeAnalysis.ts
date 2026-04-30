// ============================================================
// YouTube SNS 버즈 분석
// 1) 인기 콘텐츠 TOP, 2) 콘텐츠 유형 분포, 3) 발화 phrase,
// 4) 댓글 반응 패턴, 5) 자연어 인사이트
// ============================================================

import type {
  YoutubeVideo,
  YoutubeSummary,
  YoutubeContentType,
  YoutubeContentTypeStat,
  YoutubeChannelTypeStat,
  YoutubeChannelType,
  YoutubeReactionPattern,
  YoutubePhrase,
} from '../types/index.js'
import { crawlYoutubeBuzz } from '../crawlers/youtube.js'

const CHANNEL_TYPE_LABEL: Record<YoutubeChannelType, string> = {
  official: '✓ 공식 (Netflix·방송사·엔터사)',
  influencer: '🎤 K-드라마 인플루언서',
  community: '🌐 일반 사용자',
}

const CONTENT_TYPE_LABEL: Record<YoutubeContentType, string> = {
  scene: '🎬 명장면 클립',
  meme: '😂 밈',
  edit: '✂️ 편집/팬영상',
  reaction: '🤯 반응 영상',
  review: '⭐ 리뷰/추천',
  actor: '🌟 배우 중심',
  other: '🌐 기타',
}

// 댓글 반응 패턴 정의
const REACTION_PATTERNS: { pattern: RegExp; label: string; raw: string; category: YoutubeReactionPattern['category'] }[] = [
  { pattern: /\bomg\b|\bog!?\b|oh my god/i, label: '감정 폭발 (OMG)', raw: 'OMG', category: 'emotion' },
  { pattern: /\bcrying\b|i'?m cry|sobbing|tears/i, label: '눈물 반응', raw: 'crying', category: 'emotion' },
  { pattern: /😭|😢|💔|😍|🥰|😘|🥺/u, label: '이모지 반응', raw: '이모지', category: 'emotion' },
  { pattern: /\bobsessed\b|hooked|addicted/i, label: '몰입/중독', raw: 'obsessed', category: 'emotion' },
  { pattern: /(where (can i )?watch|how to watch|what (drama|show|series) is this|what'?s the name|drama name|title please)/i, label: '정보 요청 (어디서 보나요?)', raw: 'info request', category: 'info_request' },
  { pattern: /\brelatable\b|same|me too|literally me|so real/i, label: '공감 (relatable)', raw: 'relatable', category: 'empathy' },
  { pattern: /\b(masterpiece|iconic|goat|underrated|best (drama|kdrama) ever|10\/10|chef'?s kiss)\b/i, label: '최고 평가 (masterpiece)', raw: 'praise', category: 'praise' },
  { pattern: /\b(boring|disappointing|cringe|overrated|skip|drop|worst)\b/i, label: '비판 (boring/cringe)', raw: 'criticism', category: 'criticism' },
  { pattern: /\b(rewatching|rewatched|nth time|second time)\b/i, label: '재시청', raw: 'rewatch', category: 'empathy' },
  { pattern: /\b(recommend|recommendation|similar to|reminds me of)\b/i, label: '추천 요청·응답', raw: 'recommendation', category: 'info_request' },
]

// stopwords
const STOPWORDS = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','should','could','can','this','that','these','those','it','they','them','their','i','you',
  'he','she','we','my','your','his','her','our','me','him','so','if','because','as','of','at','by','for',
  'with','about','to','from','in','out','on','off','up','down','over','under','then','here','there','when',
  'where','why','how','what','who','all','any','each','few','more','most','other','some','such','no','not',
  'only','own','same','than','too','very','just','don','now','one','really','like','get','got','know','think',
  'see','find','still','much','even','lot','something','someone','anyone','also','lol','tbh','imo','imho',
  'video','watch','watching','please','thanks','thank','guys','everyone','someone',
])

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
}

function extractPhrases(text: string): Set<string> {
  const tokens = tokenize(text)
  const phrases = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    if (STOPWORDS.has(w)) continue
    if (w.length >= 4) phrases.add(w)
    if (i + 1 < tokens.length) {
      const w2 = tokens[i + 1]
      if (!STOPWORDS.has(w2) && w2.length >= 3) phrases.add(`${w} ${w2}`)
    }
  }
  return phrases
}

// ── 1. 인기 콘텐츠 TOP ──────────────────────────────────────
function getTopVideos(videos: YoutubeVideo[], n: number): YoutubeVideo[] {
  return [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, n)
}

// ── 2. 콘텐츠 유형 분포 ─────────────────────────────────────
// ── 2-2. 채널 타입 분포 ─────────────────────────────────────
function buildChannelTypeStats(videos: YoutubeVideo[]): YoutubeChannelTypeStat[] {
  const m = new Map<YoutubeChannelType, { count: number; totalViews: number }>()
  for (const v of videos) {
    const ex = m.get(v.channelType) ?? { count: 0, totalViews: 0 }
    ex.count++
    ex.totalViews += v.views || 0
    m.set(v.channelType, ex)
  }
  return [...m.entries()]
    .map(([t, v]) => ({ channelType: t, label: CHANNEL_TYPE_LABEL[t], count: v.count, totalViews: v.totalViews }))
    .sort((a, b) => b.count - a.count)
}

function buildContentTypeStats(videos: YoutubeVideo[]): YoutubeContentTypeStat[] {
  const m = new Map<YoutubeContentType, { count: number; totalViews: number }>()
  for (const v of videos) {
    const ex = m.get(v.contentType) ?? { count: 0, totalViews: 0 }
    ex.count++
    ex.totalViews += v.views || 0
    m.set(v.contentType, ex)
  }
  return [...m.entries()]
    .map(([type, v]) => ({ type, label: CONTENT_TYPE_LABEL[type], count: v.count, totalViews: v.totalViews }))
    .sort((a, b) => b.count - a.count)
}

// ── 3. 발화 phrase TOP ─────────────────────────────────────
function buildTopPhrases(videos: YoutubeVideo[], topN: number): YoutubePhrase[] {
  const freq = new Map<string, number>()
  for (const v of videos) {
    const text = `${v.title} ${v.description || ''}`
    for (const p of extractPhrases(text)) {
      freq.set(p, (freq.get(p) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .filter(([_, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, topN)
    .map(([phrase, count]) => ({ phrase, count }))
}

// ── 4. 댓글 반응 패턴 ──────────────────────────────────────
function buildReactionPatterns(videos: YoutubeVideo[]): YoutubeReactionPattern[] {
  const stat = REACTION_PATTERNS.map((rp) => ({
    pattern: rp.raw, label: rp.label, category: rp.category, count: 0, examples: [] as string[],
  }))

  for (const v of videos) {
    for (const c of v.comments) {
      for (let i = 0; i < REACTION_PATTERNS.length; i++) {
        if (REACTION_PATTERNS[i].pattern.test(c.text)) {
          stat[i].count++
          if (stat[i].examples.length < 2) {
            const trimmed = c.text.replace(/\s+/g, ' ').trim().slice(0, 140)
            if (!stat[i].examples.includes(trimmed)) stat[i].examples.push(trimmed)
          }
        }
      }
    }
  }
  return stat.filter((s) => s.count > 0).sort((a, b) => b.count - a.count)
}

// ── 5. 자연어 인사이트 ─────────────────────────────────────
function buildOneLineSummary(videos: YoutubeVideo[], stats: YoutubeContentTypeStat[]): string {
  if (videos.length === 0) return 'YouTube 데이터 없음.'
  const top = videos[0]
  const totalViews = videos.reduce((s, v) => s + (v.views || 0), 0)
  const dominant = stats.find((s) => s.type !== 'other') || stats[0]
  const dominantLabel = dominant ? dominant.label : '다양한 유형'
  return `K-콘텐츠 SNS 버즈는 ${dominantLabel} 중심으로 형성되어 있으며, 최상위 영상 '${top.title.slice(0, 80)}${top.title.length > 80 ? '...' : ''}'(${(top.views || 0).toLocaleString()} 조회수)를 비롯해 총 ${videos.length}개 영상이 ${(totalViews / 1_000_000).toFixed(1)}M+ 조회수를 기록했습니다.`
}

function buildBuzzInsight(videos: YoutubeVideo[], stats: YoutubeContentTypeStat[], reactions: YoutubeReactionPattern[]): string {
  const total = videos.length || 1
  const sceneCount = stats.find((s) => s.type === 'scene')?.count || 0
  const memeCount = stats.find((s) => s.type === 'meme')?.count || 0
  const editCount = stats.find((s) => s.type === 'edit')?.count || 0
  const reviewCount = stats.find((s) => s.type === 'review')?.count || 0
  const reactionCount = stats.find((s) => s.type === 'reaction')?.count || 0

  const flowParts: string[] = []
  if (reviewCount > 0) flowParts.push(`리뷰·추천(${reviewCount}건)으로 **토론**이 시작되고`)
  if (sceneCount + reactionCount > 0) flowParts.push(`명장면·반응 영상(${sceneCount + reactionCount}건)으로 **밈화 직전 단계**가 형성되며`)
  if (memeCount + editCount > 0) flowParts.push(`밈·편집 영상(${memeCount + editCount}건)으로 **확산**되는 흐름`)

  const dominantReaction = reactions[0]
  const reactionLine = dominantReaction
    ? ` 댓글에서는 '${dominantReaction.label}' 패턴(${dominantReaction.count}건)이 가장 두드러져, 시청자들이 정보 소비를 넘어 **감정·공감 차원의 적극적 반응**을 보이고 있습니다.`
    : ''

  if (flowParts.length === 0) return `K-콘텐츠 영상이 ${videos.length}개 분석되었으며 특정 흐름은 명확하지 않습니다.${reactionLine}`
  return `${flowParts.join(', ')}이 관찰됩니다.${reactionLine}`
}

function buildFandomFlowInsight(videos: YoutubeVideo[], stats: YoutubeContentTypeStat[]): string {
  const total = videos.length || 1
  const officialCount = videos.filter((v) => v.channelType === 'official').length
  const influencerCount = videos.filter((v) => v.channelType === 'influencer').length
  const officialRatio = officialCount / total
  const influencerRatio = influencerCount / total

  const topVideos = videos.slice(0, 5)
  const topAvgViews = topVideos.reduce((s, v) => s + (v.views || 0), 0) / Math.max(topVideos.length, 1)

  const memeRatio = ((stats.find((s) => s.type === 'meme')?.count || 0)
    + (stats.find((s) => s.type === 'edit')?.count || 0)) / total

  const parts: string[] = []
  if (officialRatio >= 0.7) {
    parts.push(`공식 채널(Netflix·방송사·엔터사) 영상이 ${Math.round(officialRatio * 100)}%로 절대 다수 — **공식 마케팅 주도형 확산** 양상`)
  } else if (officialRatio >= 0.4) {
    parts.push(`공식 ${Math.round(officialRatio * 100)}% · 인플루언서 ${Math.round(influencerRatio * 100)}%로 균형 — **공식 발신 + 리뷰어 증폭** 이상적 확산 구조`)
  } else if (influencerRatio >= 0.5) {
    parts.push(`인플루언서·리뷰어 채널 비중이 ${Math.round(influencerRatio * 100)}%로 우세 — **팬 큐레이션 매개 확산** (오피니언 리더 중심)`)
  } else {
    parts.push(`공식 ${Math.round(officialRatio * 100)}% · 인플루언서 ${Math.round(influencerRatio * 100)}%로 분산`)
  }

  if (memeRatio >= 0.25) parts.push(`밈·편집 영상 ${Math.round(memeRatio * 100)}%로 **팬덤 내부 → 일반 시청자 확산** 단계 진입`)
  else if (topAvgViews >= 10_000_000) parts.push(`상위 영상 평균 조회수 ${(topAvgViews / 1_000_000).toFixed(1)}M으로 **메인스트림 진입** 확인`)
  else if (topAvgViews >= 1_000_000) parts.push(`상위 영상 평균 ${(topAvgViews / 1_000_000).toFixed(1)}M 조회수로 일정 규모 도달`)
  else parts.push(`아직 K-팬덤 핵심층 중심의 소비 단계`)

  return parts.join(', ') + '.'
}

// ── 메인 ───────────────────────────────────────────────────
export async function buildYoutubeSummary(
  options: { hashtags?: string[]; topN?: number; commentsPerVideo?: number } = {}
): Promise<YoutubeSummary> {
  const { videos, searchedHashtags } = await crawlYoutubeBuzz({
    hashtags: options.hashtags,
    perTagLimit: 12,
    topN: options.topN ?? 30,
    commentsPerVideo: options.commentsPerVideo ?? 30,
  })

  const totalComments = videos.reduce((s, v) => s + v.comments.length, 0)
  const topVideos = getTopVideos(videos, 30)
  const contentTypeStats = buildContentTypeStats(videos)
  const channelTypeStats = buildChannelTypeStats(videos)
  const topPhrases = buildTopPhrases(videos, 20)
  const reactionPatterns = buildReactionPatterns(videos)

  const oneLineSummary = buildOneLineSummary(topVideos, contentTypeStats)
  const buzzInsight = buildBuzzInsight(videos, contentTypeStats, reactionPatterns)
  const fandomFlowInsight = buildFandomFlowInsight(videos, contentTypeStats)

  const now = new Date()
  return {
    fetchedAt: now.toISOString(),
    cached: false,
    expiresAt: new Date(now.getTime() + 3 * 3600 * 1000).toISOString(),
    totalVideos: videos.length,
    totalComments,
    searchedHashtags,
    topVideos,
    contentTypeStats,
    channelTypeStats,
    topPhrases,
    reactionPatterns,
    buzzInsight,
    fandomFlowInsight,
    oneLineSummary,
  }
}
