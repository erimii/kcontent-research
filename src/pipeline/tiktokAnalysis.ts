// ============================================================
// TikTok SNS 버즈 분석
// 1) 인기 클립 TOP (engagement score: views×1 + likes×2 + comments×5 + shares×3)
// 2) 작품별 화제도 (영상 → 작품 단위 집계)
// 3) 트렌딩 사운드 (sound 재사용 횟수)
// 4) 크리에이터 랭킹
// ============================================================

import type {
  TikTokVideo, TikTokSummary, TikTokContentGroup, TikTokTopComment,
  TikTokTrendingSound, TikTokTopCreator, TikTokAuthor, TikTokDiagnostics,
} from '../types/index.js'
import { crawlTiktokBuzz } from '../crawlers/tiktok.js'
import { crawlTiktokWebBuzz } from '../crawlers/tiktokWeb.js'
import { KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'

// ── engagement score (TikTok: views/likes/comments/shares) ──
function engagementScore(v: TikTokVideo): number {
  return Math.log10((v.views || 0) + 1) * 1
       + Math.log10((v.likes || 0) + 1) * 2
       + Math.log10((v.commentCount || 0) + 1) * 5
       + Math.log10((v.shares || 0) + 1) * 3
}

// ── Title Case (YouTube와 동일 헬퍼) ────────────────────────
const TITLE_CASE_LOWERCASE = new Set(['of','the','and','in','on','at','to','for','a','an','is','are','as'])
function toTitleCase(s: string): string {
  return s.split(/\s+/).map((w, i) => {
    if (i > 0 && TITLE_CASE_LOWERCASE.has(w.toLowerCase())) return w.toLowerCase()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

const KSHOWS_STATIC = [
  'Running Man', 'Knowing Bros', 'Men on a Mission', 'I Live Alone',
  'New Journey to the West', 'My Little Old Boy', 'Master in the House',
  '2 Days 1 Night', 'Infinite Challenge', 'Hangout with Yoo',
  'Heart Signal', 'Single Inferno',
]

// ── 작품 식별 ─────────────────────────────────────────────
function extractContentTitle(video: TikTokVideo): { title: string; source: TikTokContentGroup['matchSource'] } | null {
  const text = `${video.description} ${video.sound?.title || ''}`.toLowerCase()

  // 1. KNOWN_DRAMAS_STATIC 사전 — 긴 작품명 우선
  const dramasSorted = [...KNOWN_DRAMAS_STATIC].sort((a, b) => b.length - a.length)
  for (const drama of dramasSorted) {
    if (drama.length < 4) continue
    if (text.includes(drama.toLowerCase())) {
      return { title: toTitleCase(drama), source: 'known' }
    }
  }

  // 2. caption 패턴 (TikTok caption은 짧음, 해시태그 위주)
  // ex: "Squid Game season 2 best scene 🤯 #kdrama" → "Squid Game season 2 best scene"
  const cleaned = video.description.replace(/#[\w가-힣]+/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
  if (cleaned.length >= 4 && cleaned.length <= 80) {
    const m = cleaned.match(/^(.{3,60}?)\s*[-—|·:]?\s*(scene|reaction|recap|review|edit|moment|ending|kiss)/i)
    if (m && m[1].trim().length >= 3) {
      return { title: toTitleCase(m[1].trim()), source: 'caption-pattern' }
    }
  }

  // 3. K-쇼 명시
  for (const show of KSHOWS_STATIC) {
    if (text.includes(show.toLowerCase())) {
      return { title: show, source: 'show-name' }
    }
  }

  return null
}

function getTopVideos(videos: TikTokVideo[], n: number): TikTokVideo[] {
  return [...videos].sort((a, b) => engagementScore(b) - engagementScore(a)).slice(0, n)
}

// ── 작품별 화제도 ────────────────────────────────────────
function buildContentGroups(videos: TikTokVideo[], n: number): TikTokContentGroup[] {
  type Acc = {
    title: string
    matchSource: TikTokContentGroup['matchSource']
    videos: TikTokVideo[]
    totalViews: number
    totalLikes: number
    totalShares: number
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
        title: matched.title, matchSource: matched.source,
        videos: [], totalViews: 0, totalLikes: 0, totalShares: 0, totalComments: 0,
      }
      acc.set(key, entry)
    }
    entry.videos.push(v)
    entry.totalViews += v.views || 0
    entry.totalLikes += v.likes || 0
    entry.totalShares += v.shares || 0
    entry.totalComments += v.commentCount || 0
  }

  const groups: TikTokContentGroup[] = [...acc.values()].map((e) => {
    const sortedV = [...e.videos].sort((a, b) => engagementScore(b) - engagementScore(a))
    const topV = sortedV[0]
    const allComments: TikTokTopComment[] = e.videos.flatMap((v) =>
      v.comments.map((c) => ({
        text: c.text, author: c.author, likes: c.likes,
        videoId: v.id, videoUrl: v.url, videoDescription: v.description,
      }))
    )
    const topComments = allComments.sort((a, b) => b.likes - a.likes).slice(0, 2)
    return {
      title: e.title,
      videoCount: e.videos.length,
      totalViews: e.totalViews,
      totalLikes: e.totalLikes,
      totalShares: e.totalShares,
      totalComments: e.totalComments,
      topVideoId: topV.id,
      topVideoUrl: topV.url,
      topVideoCover: topV.cover,
      topVideoDescription: topV.description,
      topComments,
      matchSource: e.matchSource,
    }
  })

  groups.sort((a, b) => {
    const scoreA = Math.log10(a.totalViews + 1) * 1 + Math.log10(a.totalLikes + 1) * 2 + Math.log10(a.totalComments + 1) * 5 + Math.log10(a.totalShares + 1) * 3
    const scoreB = Math.log10(b.totalViews + 1) * 1 + Math.log10(b.totalLikes + 1) * 2 + Math.log10(b.totalComments + 1) * 5 + Math.log10(b.totalShares + 1) * 3
    return scoreB - scoreA
  })
  return groups.slice(0, n)
}

// ── 트렌딩 사운드 (데이터셋 내 재사용 횟수) ────────────────
function buildTrendingSounds(videos: TikTokVideo[], n: number): TikTokTrendingSound[] {
  type Acc = {
    id: string; title: string; authorName: string; cover?: string
    videos: TikTokVideo[]; totalViews: number
  }
  const acc = new Map<string, Acc>()
  for (const v of videos) {
    if (!v.sound?.id) continue
    let e = acc.get(v.sound.id)
    if (!e) {
      e = { id: v.sound.id, title: v.sound.title, authorName: v.sound.authorName, cover: v.sound.cover, videos: [], totalViews: 0 }
      acc.set(v.sound.id, e)
    }
    e.videos.push(v)
    e.totalViews += v.views || 0
  }
  const sounds: TikTokTrendingSound[] = [...acc.values()]
    .filter((e) => e.videos.length >= 2)
    .map((e) => {
      const top = [...e.videos].sort((a, b) => engagementScore(b) - engagementScore(a))[0]
      return {
        id: e.id, title: e.title, authorName: e.authorName, cover: e.cover,
        videoCount: e.videos.length, totalViews: e.totalViews,
        sampleVideoId: top.id, sampleVideoUrl: top.url, sampleVideoDescription: top.description,
      }
    })
    .sort((a, b) => (b.videoCount + Math.log10(b.totalViews + 1)) - (a.videoCount + Math.log10(a.totalViews + 1)))
    .slice(0, n)
  return sounds
}

// ── 크리에이터 랭킹 ────────────────────────────────────────
function buildTopCreators(videos: TikTokVideo[], n: number): TikTokTopCreator[] {
  type Acc = {
    author: TikTokAuthor
    videos: TikTokVideo[]
    totalViews: number; totalLikes: number
  }
  const acc = new Map<string, Acc>()
  for (const v of videos) {
    const key = v.author.uniqueId || v.author.id
    if (!key) continue
    let e = acc.get(key)
    if (!e) {
      e = { author: v.author, videos: [], totalViews: 0, totalLikes: 0 }
      acc.set(key, e)
    }
    e.videos.push(v)
    e.totalViews += v.views || 0
    e.totalLikes += v.likes || 0
  }
  const creators: TikTokTopCreator[] = [...acc.values()].map((e) => {
    const top = [...e.videos].sort((a, b) => engagementScore(b) - engagementScore(a))[0]
    return {
      author: e.author,
      videoCount: e.videos.length,
      totalViews: e.totalViews,
      totalLikes: e.totalLikes,
      topVideoId: top.id, topVideoUrl: top.url, topVideoDescription: top.description,
    }
  })
  creators.sort((a, b) => {
    const sa = Math.log10(a.totalViews + 1) * 1 + Math.log10(a.totalLikes + 1) * 2 + a.videoCount * 0.5
    const sb = Math.log10(b.totalViews + 1) * 1 + Math.log10(b.totalLikes + 1) * 2 + b.videoCount * 0.5
    return sb - sa
  })
  return creators.slice(0, n)
}

// ── DB에 저장된 영상으로 summary 생성 (cron 모드 — crawl 우회) ──
export function buildSummaryFromVideos(
  videos: TikTokVideo[],
  searchedKeywords: string[],
  diagnostics?: TikTokDiagnostics,
): TikTokSummary {
  const totalComments = videos.reduce((s, v) => s + (v.comments?.length || 0), 0)
  const topVideos = getTopVideos(videos, 30)
  const contentGroups = buildContentGroups(videos, 6)
  const trendingSounds = buildTrendingSounds(videos, 8)
  const topCreators = buildTopCreators(videos, 8)

  const now = new Date()
  return {
    fetchedAt: now.toISOString(),
    cached: false,
    expiresAt: new Date(now.getTime() + 3 * 3600 * 1000).toISOString(),
    totalVideos: videos.length,
    totalComments,
    searchedKeywords,
    topVideos,
    contentGroups,
    trendingSounds,
    topCreators,
    ...(diagnostics ? { diagnostics } : {}),
  }
}

// ── 메인 — API 라이브러리 트랙 (legacy, 2026-05-07 옵션 B 시도 후 롤백) ────
//   옵션 B(Playwright + 사용자 cookie) 시도 결과: TikTok DataDome가 stealth 플러그인 + 25개
//   cookie + webdriver 숨김에도 captcha 페이지를 강제 → headless 트랙 0건.
//   `crawlTiktokWebBuzz`는 보존하되 호출 안 함. 추후 Tier 3 (headful Chrome profile)
//   도입 시 그 위에 다시 얹는 방향이 현실적.
export async function buildTiktokSummary(
  options: { keywords?: string[]; topN?: number; commentsPerVideo?: number } = {}
): Promise<TikTokSummary> {
  const { videos, searchedKeywords, diagnostics } = await crawlTiktokBuzz({
    keywords: options.keywords,
    perKeywordLimit: 20,
    topN: options.topN ?? 30,
    commentsPerVideo: options.commentsPerVideo ?? 20,
  })
  return buildSummaryFromVideos(videos, searchedKeywords, diagnostics)
}

// Playwright 트랙 — 보존용. `import { buildTiktokSummaryWeb }`로 명시 호출 가능.
export async function buildTiktokSummaryWeb(): Promise<TikTokSummary> {
  const { videos, searchedKeywords } = await crawlTiktokWebBuzz()
  return buildSummaryFromVideos(videos, searchedKeywords)
}
