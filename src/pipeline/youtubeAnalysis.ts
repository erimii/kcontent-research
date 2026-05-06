// ============================================================
// YouTube SNS 버즈 분석
// 1) 인기 콘텐츠 TOP (engagement score)
// 2) 콘텐츠 유형 분포
// 3) 채널 타입 분포
// 4) 발화 phrase
// 5) 작품별 화제도 (contentGroups)
// 6) 댓글 TOP 10 (좋아요순)
// ============================================================

import type {
  YoutubeVideo,
  YoutubeSummary,
  YoutubeContentType,
  YoutubeContentTypeStat,
  YoutubeChannelTypeStat,
  YoutubeChannelType,
  YoutubePhrase,
  YoutubeContentGroup,
  YoutubeTopComment,
} from '../types/index.js'
import { crawlYoutubeBuzz } from '../crawlers/youtube.js'
import { KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'

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

// ── engagement score ────────────────────────────────────────
function engagementScore(v: YoutubeVideo): number {
  const views = v.views || 0
  const likes = v.likes || 0
  const comments = (typeof v.commentCount === 'number' && v.commentCount > 0)
    ? v.commentCount
    : (v.comments?.length || 0)
  return Math.log10(views + 1) * 1
       + Math.log10(likes + 1) * 2
       + Math.log10(comments + 1) * 5
}

// ── 1. 인기 콘텐츠 TOP ──────────────────────────────────────
function getTopVideos(videos: YoutubeVideo[], n: number): YoutubeVideo[] {
  return [...videos].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, n)
}

// ── 2. 콘텐츠 유형 분포 ─────────────────────────────────────
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

// ── 4. 작품별 화제도 ────────────────────────────────────────
const KSHOWS_STATIC = [
  'Running Man', 'Knowing Bros', 'Men on a Mission', 'I Live Alone',
  'New Journey to the West', 'My Little Old Boy', 'Master in the House',
  '2 Days 1 Night', '1 Night 2 Days', 'Infinite Challenge', 'Hangout with Yoo',
  'The Genius', 'Crime Scene', 'Heart Signal', 'Single Inferno',
]

// Title Case 변환 ("vincenzo" → "Vincenzo", "all of us are dead" → "All of Us Are Dead")
const TITLE_CASE_LOWERCASE_WORDS = new Set(['of','the','and','in','on','at','to','for','a','an','is','are','as'])
function toTitleCase(s: string): string {
  return s.split(/\s+/).map((w, i) => {
    if (i > 0 && TITLE_CASE_LOWERCASE_WORDS.has(w.toLowerCase())) return w.toLowerCase()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

function extractContentTitle(video: YoutubeVideo): { title: string; source: 'known' | 'trailer-pattern' | 'show-name' } | null {
  const title = video.title || ''
  const text = `${title} ${video.description || ''}`.toLowerCase()

  // 1. KNOWN_DRAMAS_STATIC 사전 매칭 (4자+ 작품명만)
  // 긴 작품명을 우선 매칭 (예: "All of Us Are Dead"가 "Dead"보다 우선)
  const dramasSorted = [...KNOWN_DRAMAS_STATIC].sort((a, b) => b.length - a.length)
  for (const drama of dramasSorted) {
    if (drama.length < 4) continue
    if (text.includes(drama.toLowerCase())) {
      return { title: toTitleCase(drama), source: 'known' }
    }
  }

  // 2. 트레일러/티저 제목 패턴 — 첫 구분자 앞을 작품명으로
  const m = title.match(/^(.+?)\s*[\|·:—–-]\s*(official\s+trailer|teaser\s*trailer|teaser|episode\s+\d+|highlight\s+trailer|highlight|recap|review|reaction|ep\s*\.?\s*\d+|behind|interview|trailer)/i)
  if (m) {
    let candidate = m[1].trim()
      .replace(/\[[^\]]*\]/g, '')   // 대괄호 메타 제거: [SUB], [ENG SUB] 등
      .replace(/\([^)]*\)/g, '')    // 괄호 메타 제거
      .replace(/\s+/g, ' ')
      .trim()
    if (candidate.length >= 3 && candidate.length <= 60) {
      return { title: candidate, source: 'trailer-pattern' }
    }
  }

  // 3. K-쇼 명시 매칭
  for (const show of KSHOWS_STATIC) {
    if (text.includes(show.toLowerCase())) {
      return { title: show, source: 'show-name' }
    }
  }

  return null
}

function getCommentCount(v: YoutubeVideo): number {
  return (typeof v.commentCount === 'number' && v.commentCount > 0)
    ? v.commentCount
    : (v.comments?.length || 0)
}

function buildContentGroups(videos: YoutubeVideo[], n: number): YoutubeContentGroup[] {
  type Acc = {
    title: string
    matchSource: YoutubeContentGroup['matchSource']
    videos: YoutubeVideo[]
    totalViews: number
    totalLikes: number
    totalComments: number
  }
  const acc = new Map<string, Acc>()

  for (const v of videos) {
    const matched = extractContentTitle(v)
    if (!matched) continue
    const key = matched.title.toLowerCase()
    let entry = acc.get(key)
    if (!entry) {
      entry = {
        title: matched.title,
        matchSource: matched.source,
        videos: [],
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
      }
      acc.set(key, entry)
    }
    entry.videos.push(v)
    entry.totalViews += v.views || 0
    entry.totalLikes += v.likes || 0
    entry.totalComments += getCommentCount(v)
  }

  const groups: YoutubeContentGroup[] = [...acc.values()].map((e) => {
    const sortedVideos = [...e.videos].sort((a, b) => engagementScore(b) - engagementScore(a))
    const topVideo = sortedVideos[0]
    // 이 작품 내 모든 댓글 → 좋아요순 TOP 2
    const allComments = e.videos.flatMap((v) =>
      v.comments.map((c) => ({
        text: c.text,
        author: c.author,
        likes: c.likes || 0,
        videoTitle: v.title,
        videoId: v.id,
        videoChannel: v.channel,
      }))
    )
    const topComments = allComments.sort((a, b) => b.likes - a.likes).slice(0, 2)
    return {
      title: e.title,
      videoCount: e.videos.length,
      totalViews: e.totalViews,
      totalLikes: e.totalLikes,
      totalComments: e.totalComments,
      topVideoId: topVideo.id,
      topVideoTitle: topVideo.title,
      topVideoThumbnail: topVideo.thumbnail,
      topComments,
      matchSource: e.matchSource,
    }
  })

  // 작품 정렬: engagement score (집계값 기준)
  groups.sort((a, b) => {
    const scoreA = Math.log10(a.totalViews + 1) * 1 + Math.log10(a.totalLikes + 1) * 2 + Math.log10(a.totalComments + 1) * 5
    const scoreB = Math.log10(b.totalViews + 1) * 1 + Math.log10(b.totalLikes + 1) * 2 + Math.log10(b.totalComments + 1) * 5
    return scoreB - scoreA
  })

  return groups.slice(0, n)
}

// ── 5. 댓글 TOP 10 (좋아요순) ────────────────────────────────
function buildGlobalTopComments(videos: YoutubeVideo[], n: number): YoutubeTopComment[] {
  const all = videos.flatMap((v) =>
    v.comments.map((c) => ({
      text: c.text,
      author: c.author,
      likes: c.likes || 0,
      videoTitle: v.title,
      videoId: v.id,
      videoChannel: v.channel,
    }))
  )
  return all.sort((a, b) => b.likes - a.likes).slice(0, n)
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
  const contentGroups = buildContentGroups(videos, 6)
  const topComments = buildGlobalTopComments(videos, 10)

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
    contentGroups,
    topComments,
  }
}
