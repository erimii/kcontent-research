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
  YoutubeLanguageStat,
  YoutubeQuotedPhrase,
} from '../types/index.js'
import { crawlYoutubeBuzz } from '../crawlers/youtube.js'
import { KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'
import { detectLang, LANG_META } from '../lib/langDetect.js'

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

// ── 명대사 / catchphrase 추출 ───────────────────────────────
// 1) 따옴표 안 phrase (영어·한글 인용)
// 2) 반복 문장 (같은 문장이 ≥2개 댓글에 등장)
const QUOTE_PATTERNS = [
  /"([^"]{6,80})"/g,      // 영어 큰따옴표
  /「([^」]{4,80})」/g,    // 한국어 따옴표 1
  /『([^』]{4,80})』/g,    // 한국어 따옴표 2
]
const GENERIC_PHRASES = new Set([
  'amazing', 'wow', 'love this', 'love it', 'so good', 'perfect',
  'masterpiece', 'iconic', 'literally me', 'me too', 'same',
  '대박', '최고', '와', '진짜', '정말',
])

function normalizePhrase(s: string): string {
  return s.toLowerCase()
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')  // 이모지 제거
    .replace(/[!?.,;:'"…"""」「『』]+$/, '')  // 끝 punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function isGenericPhrase(phrase: string): boolean {
  const lower = phrase.toLowerCase().trim()
  if (lower.length < 6) return true
  if (GENERIC_PHRASES.has(lower)) return true
  // 단어 1개 또는 2개 매우 짧은 phrase 제외 (예: "so cute")
  if (lower.split(/\s+/).length < 2) return true
  return false
}

// n-gram (4-7 word) 추출 — 짧은 catchphrase 잡기
const NGRAM_STOPWORDS = new Set([
  'a','an','the','and','or','but','is','are','was','were','be','been','have','has','had',
  'do','does','did','will','would','should','could','can','this','that','these','those',
  'i','you','he','she','it','we','they','my','your','his','her','our','their',
  'in','on','at','to','for','with','about','from','of','as','by',
  'so','if','because','then','here','there','when','where','why','how','what','who',
])

function extractNgramPhrases(texts: string[]): Map<string, { count: number; original: string }> {
  const acc = new Map<string, { count: number; original: string }>()
  // 같은 댓글 내 같은 phrase는 1회만 카운트 (스팸 방지)
  for (const text of texts) {
    if (!text) continue
    const cleaned = text.toLowerCase()
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, ' ')  // 이모지 → space
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')                       // 특수문자 → space
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0)
    const seenInThisText = new Set<string>()
    // 4-7 word window
    for (let n = 4; n <= 7; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const slice = tokens.slice(i, i + n)
        // 첫·마지막 단어가 stopword면 스킵
        if (NGRAM_STOPWORDS.has(slice[0])) continue
        if (NGRAM_STOPWORDS.has(slice[slice.length - 1])) continue
        // 모두 stopword만이면 스킵
        if (slice.every((t) => NGRAM_STOPWORDS.has(t) || t.length < 3)) continue
        const phrase = slice.join(' ')
        if (phrase.length < 12 || phrase.length > 60) continue
        if (seenInThisText.has(phrase)) continue
        seenInThisText.add(phrase)
        const ex = acc.get(phrase)
        if (ex) ex.count++
        else acc.set(phrase, { count: 1, original: phrase })
      }
    }
  }
  return acc
}

function extractQuotedPhrases(texts: string[], topN: number = 5): YoutubeQuotedPhrase[] {
  const acc = new Map<string, { count: number; sample: string; original: string }>()

  for (const text of texts) {
    if (!text) continue

    // 1. 따옴표 안 phrase 추출
    for (const re of QUOTE_PATTERNS) {
      let m
      const reCopy = new RegExp(re.source, re.flags)
      while ((m = reCopy.exec(text)) !== null) {
        const raw = m[1].trim()
        const norm = normalizePhrase(raw)
        if (!norm || isGenericPhrase(norm)) continue
        const ex = acc.get(norm)
        if (ex) ex.count++
        else acc.set(norm, { count: 1, sample: text.slice(0, 100), original: raw })
      }
    }

    // 2. 짧은 문장 (10-80자) 반복 검출
    const trimmed = text.trim()
    if (trimmed.length >= 10 && trimmed.length <= 80) {
      const norm = normalizePhrase(trimmed)
      if (norm && !isGenericPhrase(norm)) {
        const ex = acc.get(norm)
        if (ex) ex.count++
        else acc.set(norm, { count: 1, sample: trimmed.slice(0, 100), original: trimmed })
      }
    }
  }

  // 3. n-gram (4-7 word) 반복 추가
  const ngrams = extractNgramPhrases(texts)
  for (const [phrase, info] of ngrams) {
    if (info.count < 2) continue
    if (acc.has(phrase)) {
      // 따옴표/문장 매칭과 중복: 더 큰 count 유지
      const ex = acc.get(phrase)!
      if (info.count > ex.count) ex.count = info.count
    } else {
      acc.set(phrase, { count: info.count, sample: '', original: info.original })
    }
  }

  // 결과 dedupe: 더 긴 phrase가 더 짧은 phrase를 포함하면 짧은 거 제거
  const all = [...acc.entries()]
    .filter(([, info]) => info.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || b[0].length - a[0].length)

  const kept: typeof all = []
  for (const [norm, info] of all) {
    const isContained = kept.some(([keptNorm]) => keptNorm.includes(norm) && keptNorm !== norm)
    if (!isContained) kept.push([norm, info])
  }

  return kept.slice(0, topN).map(([, info]) => ({
    phrase: info.original.length > 80 ? info.original.slice(0, 77) + '…' : info.original,
    count: info.count,
    sampleVideoTitle: info.sample,
  }))
}

// 댓글 언어 분포 계산 (작품별 글로벌 팬 지형)
function computeLanguageDistribution(texts: string[]): YoutubeLanguageStat[] {
  if (texts.length === 0) return []
  const counts = new Map<string, number>()
  for (const t of texts) {
    const lang = detectLang(t)
    // 'unknown' 또는 LANG_META에 없는 언어(franc 오분류 가능)는 'other'에 흡수
    const key = (lang === 'unknown' || !LANG_META[lang]) ? 'other' : lang
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const total = texts.length

  // 'other'는 항상 마지막에. 나머지는 count 내림차순
  const otherCount = counts.get('other') || 0
  counts.delete('other')
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])

  const TOP_N = 5
  const top = sorted.slice(0, TOP_N)
  const restCount = sorted.slice(TOP_N).reduce((s, [, c]) => s + c, 0) + otherCount

  const stats: YoutubeLanguageStat[] = top.map(([lang, count]) => ({
    lang,
    flag: LANG_META[lang]?.flag || '🌐',
    label: LANG_META[lang]?.label || lang,
    count,
    percent: Math.round((count / total) * 100),
  }))
  if (restCount > 0) {
    stats.push({
      lang: 'other',
      flag: '🌐',
      label: '기타',
      count: restCount,
      percent: Math.round((restCount / total) * 100),
    })
  }
  return stats
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
        replyCount: c.replyCount || 0,
        videoTitle: v.title,
        videoId: v.id,
        videoChannel: v.channel,
      }))
    )
    const topComments = allComments.sort((a, b) => b.likes - a.likes).slice(0, 2)
    // 답글 수 가장 많은 댓글 = 토론 핫스팟 (좋아요 TOP과 다른 차원)
    const sortedByReplies = [...allComments].sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0))
    const discussionHotspot = sortedByReplies[0] && (sortedByReplies[0].replyCount || 0) >= 2
      ? sortedByReplies[0]
      : undefined
    // 작품별 댓글 언어 분포 (전체 댓글 풀 기준)
    const languageDistribution = computeLanguageDistribution(allComments.map((c) => c.text))
    // 자주 인용·반복되는 catchphrase
    const quotedPhrases = extractQuotedPhrases(allComments.map((c) => c.text), 5)
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
      discussionHotspot,
      quotedPhrases,
      languageDistribution,
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
