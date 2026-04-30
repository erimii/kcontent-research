// ============================================================
// YouTube SNS 버즈 크롤러 (youtubei.js / 무인증)
// 해시태그별 검색 → 영상 50개 + 각 댓글 30개 수집
// ============================================================

import type { YoutubeVideo, YoutubeComment } from '../types/index.js'

// 검색 해시태그 (사용자 명세)
const HASHTAGS = ['#kdrama', '#kdramamemes', '#koreanactor', '#koreanculture', '#kpop', '#koreandrama']

// 공식 채널 패턴 (verified or 알려진 K-콘텐츠 공식 계정)
const OFFICIAL_PATTERNS = [
  /\bnetflix\b/i, /\bkocowa\b/i, /\bviki\b/i, /\bcjenm\b/i, /\bkbs\b/i, /\bsbs\b/i,
  /\bmbc\b/i, /\btvn\b/i, /\bjtbc\b/i, /\bdisney\+?\b/i, /\bpr?ime video\b/i,
  /\bhybe\b/i, /\bsm entertainment\b/i, /\byg entertainment\b/i, /\bjyp\b/i,
  /\bsony pictures\b/i, /\bsony animation\b/i, /\bwarner\b/i, /\buniversal\b/i,
  /\bkocca\b/i, /\bkpop entertainment\b/i, /\bofficial\b/i,
]

function viewsToNumber(s: string): number {
  if (!s) return 0
  const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = (m[2] || '').toUpperCase()
  if (unit === 'K') return Math.round(n * 1000)
  if (unit === 'M') return Math.round(n * 1_000_000)
  if (unit === 'B') return Math.round(n * 1_000_000_000)
  return Math.round(n)
}

function classifyContentType(title: string, description: string = ''): YoutubeVideo['contentType'] {
  const t = `${title} ${description}`.toLowerCase()
  // MV / 명장면 / 클립 (K-pop MV는 명장면 카테고리로 흡수)
  if (/\b(scene|moment|highlight|clip|kiss scene|finale|m\/?v|music video|official (lyric )?video|mv\b|teaser|trailer)\b/.test(t)) return 'scene'
  if (/\b(meme|funny|hilarious|jokes|crack)\b/.test(t)) return 'meme'
  if (/\b(edit|fmv|amv|tribute|fan video|fanvid|compilation)\b/.test(t)) return 'edit'
  if (/\b(reaction|react|reacting|first time watching)\b/.test(t)) return 'reaction'
  if (/\b(review|recommendation|recommend|top \d+|ranking|tier list|honest opinion)\b/.test(t)) return 'review'
  if (/\b(actor|actress|interview|behind the scenes|bts of|profile|dance practice|performance)\b/.test(t)) return 'actor'
  return 'other'
}

function isOfficialChannel(channel: string): boolean {
  return OFFICIAL_PATTERNS.some((re) => re.test(channel))
}

// ── 단일 해시태그 검색 → 영상 메타 추출 ─────────────────────
async function searchHashtag(yt: any, tag: string, limit: number): Promise<Partial<YoutubeVideo>[]> {
  try {
    const res = await yt.search(tag, { type: 'video', sort_by: 'view_count' })
    const out: Partial<YoutubeVideo>[] = []
    for (const v of res.results || []) {
      if (!v?.id) continue
      const title = v.title?.text || v.title?.toString?.() || ''
      const channel = v.author?.name || ''
      const viewsText = v.view_count?.text || v.short_view_count?.text || ''
      const thumb = v.thumbnails?.[0]?.url || v.best_thumbnail?.url || undefined
      out.push({
        id: v.id,
        title,
        channel,
        channelVerified: !!v.author?.is_verified,
        thumbnail: thumb,
        viewsText,
        views: viewsToNumber(viewsText),
        duration: v.duration?.text,
        publishedText: v.published?.text,
        hashtag: tag,
      })
      if (out.length >= limit) break
    }
    return out
  } catch (e) {
    console.warn(`  [YouTube] ${tag} 검색 실패:`, (e as Error).message)
    return []
  }
}

// ── 단일 영상 상세 + 댓글 수집 ──────────────────────────────
async function fetchVideoDetail(yt: any, video: Partial<YoutubeVideo>, maxComments: number): Promise<YoutubeVideo | null> {
  if (!video.id) return null
  try {
    const info = await yt.getInfo(video.id)
    const description = info.basic_info?.short_description || ''
    const likes = info.basic_info?.like_count
    const fullViews = info.basic_info?.view_count
    const title = info.basic_info?.title || video.title || ''
    const channel = info.basic_info?.channel?.name || video.channel || ''

    let comments: YoutubeComment[] = []
    try {
      const cmts = await yt.getComments(video.id)
      const list = cmts.contents || []
      for (const c of list) {
        const cm = c.comment
        if (!cm) continue
        const text = cm.content?.text || ''
        if (!text || text.length < 4) continue
        comments.push({
          author: cm.author?.name || 'anon',
          text: text.slice(0, 800),
          likes: typeof cm.like_count === 'number' ? cm.like_count : viewsToNumber(cm.like_count || ''),
        })
        if (comments.length >= maxComments) break
      }
    } catch {}

    return {
      id: video.id,
      title,
      channel,
      channelVerified: video.channelVerified,
      thumbnail: video.thumbnail,
      views: typeof fullViews === 'number' ? fullViews : (video.views || 0),
      viewsText: video.viewsText || '',
      likes: typeof likes === 'number' ? likes : undefined,
      duration: video.duration,
      publishedText: video.publishedText,
      description: description.slice(0, 1500),
      hashtag: video.hashtag || '',
      contentType: classifyContentType(title, description),
      isOfficial: isOfficialChannel(channel),
      comments,
    }
  } catch (e) {
    console.warn(`  [YouTube] ${video.id} 상세 실패:`, (e as Error).message)
    return null
  }
}

// ── 메인 ───────────────────────────────────────────────────
export async function crawlYoutubeBuzz(
  options: { hashtags?: string[]; perTagLimit?: number; topN?: number; commentsPerVideo?: number } = {}
): Promise<{ videos: YoutubeVideo[]; searchedHashtags: string[] }> {
  const {
    hashtags = HASHTAGS,
    perTagLimit = 12,
    topN = 30,
    commentsPerVideo = 30,
  } = options

  // youtubei.js는 ESM-only — dynamic import
  const { Innertube } = await import('youtubei.js')
  const yt = await Innertube.create({ retrieve_player: false })

  // 해시태그별 검색 → 메타 합치기
  console.log(`  [YouTube] ${hashtags.length}개 해시태그 검색 중...`)
  const allMeta: Partial<YoutubeVideo>[] = []
  for (const tag of hashtags) {
    const items = await searchHashtag(yt, tag, perTagLimit)
    allMeta.push(...items)
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log(`  [YouTube] 메타 ${allMeta.length}개 (${hashtags.length}개 해시태그)`)

  // id 기준 dedup, 가장 큰 views 유지
  const merged = new Map<string, Partial<YoutubeVideo>>()
  for (const v of allMeta) {
    if (!v.id) continue
    const ex = merged.get(v.id)
    if (!ex || (v.views || 0) > (ex.views || 0)) merged.set(v.id, v)
  }
  const dedup = [...merged.values()]
  console.log(`  [YouTube] dedup 후 ${dedup.length}개 유니크 영상`)

  // views 정렬 후 상위 N개에 대해 댓글 수집
  const candidates = dedup.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, topN)
  console.log(`  [YouTube] 상위 ${candidates.length}개 영상 댓글 수집 중...`)

  const videos: YoutubeVideo[] = []
  const tasks = candidates.map((v) => fetchVideoDetail(yt, v, commentsPerVideo))
  // 동시성 제한 (5개씩)
  const batch = 5
  for (let i = 0; i < tasks.length; i += batch) {
    const slice = tasks.slice(i, i + batch)
    const settled = await Promise.allSettled(slice)
    for (const r of settled) if (r.status === 'fulfilled' && r.value) videos.push(r.value)
  }

  console.log(`  [YouTube] 총 ${videos.length}개 영상 (댓글 합계 ${videos.reduce((s, v) => s + v.comments.length, 0)}개)`)
  return { videos, searchedHashtags: hashtags }
}
