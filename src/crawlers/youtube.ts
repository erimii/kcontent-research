// ============================================================
// YouTube SNS 버즈 크롤러 (youtubei.js / 무인증)
// 해시태그별 검색 → 영상 50개 + 각 댓글 30개 수집
// ============================================================

import type { YoutubeVideo, YoutubeComment } from '../types/index.js'
import { KNOWN_ACTORS_STATIC, KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'

// 검색 해시태그 — 공식·드라마 리뷰 영상 잘 노출되는 태그 위주로 확장
const HASHTAGS = [
  '#kdrama', '#koreandrama', '#netflixkdrama',
  '#kdramareview', '#kdramarecap', '#kdramareaction',
  '#koreanactor', '#kdramaclip', '#kdramashorts',
  '#kvariety', '#kvarietyshow', '#koreanvariety',
  '#runningman', '#knowingbros',
]

// ── 공식 채널 패턴 (Netflix/방송사/엔터사) ─────────────
const OFFICIAL_PATTERNS = [
  // OTT
  /\bnetflix\b/i, /\bnetflix korea\b/i, /\bnetflix asia\b/i, /\bnetflix k-content\b/i,
  /the swoon/i,  // Netflix K-콘텐츠 BTS 공식 채널
  /\bkocowa\b/i, /\bviki\b/i, /\bdisney\+?\b/i, /\bpr?ime video\b/i,
  /\bhbo\b/i, /\bapple tv\+?\b/i, /\bhulu\b/i, /\bparamount\+?\b/i,
  // 한국 방송사
  /\bkbs\b/i, /\bsbs\b/i, /\bmbc\b/i, /\btvn\b/i, /\bjtbc\b/i, /\bena\b/i, /\bocn\b/i,
  /\bcjenm\b/i, /\bcj enm\b/i, /\bstudio dragon\b/i,
  // K-pop 엔터사
  /\bhybe\b/i, /\bsm entertainment\b/i, /\byg entertainment\b/i, /\bjyp\b/i,
  /\bstone music\b/i, /\bbighit\b/i, /\bsource music\b/i, /\bbelift\b/i,
  // 영화·미디어
  /\bsony pictures\b/i, /\bsony animation\b/i, /\bwarner\b/i, /\buniversal\b/i,
  /\bkocca\b/i, /\bkpop entertainment\b/i,
  // (이전 generic /\bofficial\b/ 제거 — cover band 등 자칭 official 채널 오탐 방지)
]

// ── K-드라마/K-콘텐츠 인플루언서 채널 패턴 ──────────────
const INFLUENCER_PATTERNS = [
  /the daebak (show|company)/i, /\bdkdktv\b/i, /\bsoompi\b/i,
  /marli ray/i, /avenue x/i, /cinema jenny/i, /the kdrama (queen|critic)/i,
  /joan day/i, /the k2 critic/i, /sunny stories/i, /korean dramaland/i,
  /dramamilk/i, /asianwiki/i, /viu/i, /spoiler-free reviews/i,
  /\bkdrama\b.*?(reviews?|recaps?|reactions?|breakdown|recommend)/i,
  /(reviews?|recaps?|reactions?|recommend).*?\bkdrama\b/i,
  /korean? dramas? (review|recap|reaction)/i,
  /\bkpop (insider|now|news)\b/i,
]

function classifyChannelType(channel: string): 'official' | 'influencer' | 'community' {
  if (OFFICIAL_PATTERNS.some((re) => re.test(channel))) return 'official'
  if (INFLUENCER_PATTERNS.some((re) => re.test(channel))) return 'influencer'
  return 'community'
}

// ── K-content 마커 (제목·설명·해시태그가 실제 K-콘텐츠 다루는지 검증) ──
// kpop은 제외 (사용자 정책: kpop 트랙 제외, 드라마·버라이어티 중심)
const K_CONTENT_KEYWORDS = [
  /\b(korean|korea\b)/i,
  /\bk-?drama\b/i,
  /\bk-?variety\b/i,
  /\bk-?content\b/i,
  /\bhallyu\b/i,
  /\bkbs\b|\bsbs\b|\bmbc\b|\btvn\b|\bjtbc\b/i,
  /\bnetflix korea\b|\bthe swoon\b|\bkocowa\b/i,
  // 대표 K-쇼명
  /\brunning man\b|\bknowing bros\b|\bmen on a mission\b|\bi live alone\b|\bnew journey to the west\b/i,
  /\b(squid game|kingdom|crash landing|extraordinary attorney|business proposal|all of us are dead|reply 19\d\d)\b/i,
]
const HANGUL_RE = /[가-힣]/

const KNOWN_ACTOR_LOWER = new Set(KNOWN_ACTORS_STATIC.map((s) => s.toLowerCase()))
const KNOWN_DRAMA_LOWER = new Set(KNOWN_DRAMAS_STATIC.map((s) => s.toLowerCase()))

// 비-K 드라마 명시적 제외 (제목에 등장하면 무조건 탈락)
const NON_K_DRAMA_RE = /\b(c-?drama|chinese drama|j-?drama|japanese drama|thai drama|t-?drama|taiwanese drama|filipino drama|indian drama|turkish drama|donghua)\b/i

// 북미 외 언어/로컬 신호 — 채널 주인이 북미일 가능성을 낮추는 명백한 단서
// (한국어/한자는 K-content이므로 제외 대상 아님)
const NON_NA_SCRIPT_RE = /[ऀ-ॿ؀-ۿЀ-ӿ฀-๿]/  // Devanagari + Arabic + Cyrillic + Thai
const NON_NA_LATIN_WORDS_RE = /\b(bhai|yaar|matlab|achha|kya hai|mera|hamara|tumhara|nahi|haan ji|bik gaya|ek number|sab kuch|filipino po|talaga|naman po)\b/i
// 자주 등장하는 인도 영문 리액션 채널 패턴 — Hindi 단음절 단어가 영어 문장 안에 섞임
const HINDI_INTERMIX_RE = /\b(bhai|yaar)\b/i

// 공식 채널이라도 비-NA 지역 분점/현지화 채널이면 제외
// (Netflix Korea / KBS WORLD TV는 통과, KBS WORLD Latino / Disney+ Philippines / Viu Indonesia 등은 탈락)
const NON_NA_REGIONAL_OFFICIAL_RE = /\b(philippines|filipino|india|indonesia|vietnam|malaysia|thailand|thai\b|brasil|brazil|brasileir|latino|latina|español|espanol|french|francais|deutschland|polska|t[üu]rkiye|t[üu]rkce|arabia|arabic)\b/i

function hasKContentMarker(title: string, description: string, hashtag: string, channel: string = ''): boolean {
  const text = `${title} ${description}`
  const fullText = `${title} ${description} ${channel}`
  // 비-K 드라마 명시 → 즉시 탈락
  if (NON_K_DRAMA_RE.test(text)) return false
  // 북미 외 언어 신호 → 제목·설명·채널명 어디서든 등장 시 즉시 탈락
  if (NON_NA_SCRIPT_RE.test(fullText)) return false
  if (NON_NA_LATIN_WORDS_RE.test(fullText)) return false
  if (HINDI_INTERMIX_RE.test(fullText)) return false
  if (HANGUL_RE.test(text)) return true
  if (K_CONTENT_KEYWORDS.some((re) => re.test(text))) return true
  // 해시태그가 명확한 K-드라마/K-콘텐츠 태그면 통과 (kpop 제외이므로 안전)
  if (/^#k(drama|orean|netflix|variety|content|wave)/i.test(hashtag)) {
    // 단, K-쇼명 해시태그(#runningman/#knowingbros)는 게스트 영상 누수 방지를 위해 별도 마커 요구
    if (!/^#(runningman|knowingbros|kvariety)/i.test(hashtag)) return true
  }
  // 알려진 K-배우/드라마 이름 매칭
  const lower = text.toLowerCase()
  for (const a of KNOWN_ACTOR_LOWER) if (a.length >= 6 && lower.includes(a)) return true
  for (const d of KNOWN_DRAMA_LOWER) if (d.length >= 5 && lower.includes(d)) return true
  return false
}

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

// (호환용) channelType === 'official' 인지 빠른 검사
function isOfficialChannel(channel: string): boolean {
  return classifyChannelType(channel) === 'official'
}

// ── 단일 해시태그 검색 → 영상 메타 추출 ─────────────────────
async function searchHashtag(yt: any, tag: string, limit: number): Promise<Partial<YoutubeVideo>[]> {
  try {
    // upload_date: 'month' = 최근 1개월 업로드 영상만 (트렌드성 + 인기도 균형)
    const res = await yt.search(tag, { type: 'video', sort_by: 'view_count', upload_date: 'month' })
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
    let commentCount: number | undefined
    try {
      const cmts = await yt.getComments(video.id)
      // 총 댓글 수 (가능한 경로 여러 군데 시도)
      const totalText =
        cmts.header?.count?.text ||
        cmts.header?.comment_count?.text ||
        cmts.header?.contents?.[0]?.text ||
        cmts.header?.title?.text || ''
      const parsedTotal = totalText ? viewsToNumber(totalText) : 0
      if (parsedTotal > 0) commentCount = parsedTotal

      const list = cmts.contents || []
      for (const c of list) {
        const cm = c.comment
        if (!cm) continue
        const text = cm.content?.text || ''
        if (!text || text.length < 4) continue
        // reply_count: "3.2K" 같은 문자열 또는 숫자
        const replyCountRaw = cm.reply_count
        const replyCount = typeof replyCountRaw === 'number'
          ? replyCountRaw
          : (replyCountRaw ? viewsToNumber(String(replyCountRaw)) : 0)
        comments.push({
          author: cm.author?.name || 'anon',
          text: text.slice(0, 800),
          likes: typeof cm.like_count === 'number' ? cm.like_count : viewsToNumber(cm.like_count || ''),
          replyCount,
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
      commentCount,
      hashtag: video.hashtag || '',
      contentType: classifyContentType(title, description),
      channelType: classifyChannelType(channel),
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
    perTagLimit = 20,
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

  // community 영상 제외 — official + influencer + 외국인 리액션/리뷰 영상 유지
  // (community 채널이라도 영상 자체가 kdrama reaction/review/recap이면 포함 — 외국 개인 유튜버 커버)
  const REACTION_REVIEW_TITLE = /\b(reaction|reacting|react to|first time watching|review|recap|recapped|breakdown|explained|ranking|tier list|top \d+|best (kdrama|korean)|recommend|watched)\b/i
  const channelFiltered = dedup.filter((v) => {
    const t = classifyChannelType(v.channel || '')
    if (t === 'official' || t === 'influencer') return true
    // community 채널 → 영상 제목이 리액션/리뷰성이면 포함 (해시태그 검색 결과라 kdrama 맥락은 보장됨)
    return REACTION_REVIEW_TITLE.test(v.title || '')
  })

  // 1차 K-content 마커 필터 — title + 채널명 + 해시태그 (description 없음)
  // 공식 채널은 K-marker 면제 (description 없는 단계라 정확도 떨어짐 — 2차 단계에서 재검사)
  // 단 비-NA 지역 분점은 채널명 기준 즉시 탈락
  const filtered = channelFiltered.filter((v) => {
    const ch = v.channel || ''
    const isOfficial = classifyChannelType(ch) === 'official'
    if (isOfficial) {
      if (NON_NA_REGIONAL_OFFICIAL_RE.test(ch)) return false
      return true  // 1차에선 통과, 2차(detail fetch 후)에서 K-marker 재검사
    }
    return hasKContentMarker(v.title || '', '', v.hashtag || '', ch)
  })
  const droppedByKMarker = channelFiltered.length - filtered.length

  const officialN = filtered.filter((v) => classifyChannelType(v.channel || '') === 'official').length
  const influencerN = filtered.filter((v) => classifyChannelType(v.channel || '') === 'influencer').length
  const communityN = filtered.length - officialN - influencerN
  console.log(`  [YouTube] 채널 필터링 후 ${filtered.length}개 (공식 ${officialN} · 인플루언서 ${influencerN} · 외국인 리액션 ${communityN}) · K-marker 누수 ${droppedByKMarker}건 제거`)

  // views 정렬 후 상위 N개에 대해 댓글 수집
  // 공식 채널은 1차 K-marker 면제로 통과했으므로 2차에서 description까지 검사하여 일부 탈락 → 오버샘플(50%)
  const oversample = Math.ceil(topN * 1.5)
  const candidates = filtered.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, oversample)
  console.log(`  [YouTube] 상위 ${candidates.length}개 영상 댓글 수집 중... (목표 ${topN}, 오버샘플 ${oversample})`)

  const fetched: YoutubeVideo[] = []
  const tasks = candidates.map((v) => fetchVideoDetail(yt, v, commentsPerVideo))
  // 동시성 제한 (5개씩)
  const batch = 5
  for (let i = 0; i < tasks.length; i += batch) {
    const slice = tasks.slice(i, i + batch)
    const settled = await Promise.allSettled(slice)
    for (const r of settled) if (r.status === 'fulfilled' && r.value) fetched.push(r.value)
  }

  // 2차 K-marker 필터 — description까지 포함하여 모든 영상(공식 채널 포함) 재검사
  // 비-K 콘텐츠가 공식 채널에서 업로드된 케이스 차단 (예: Netflix 본채널의 Kylie, Billie Eilish)
  const verified = fetched.filter((v) => hasKContentMarker(v.title || '', v.description || '', v.hashtag || '', v.channel || ''))
  const droppedBy2nd = fetched.length - verified.length
  // 최종 topN
  const videos = verified.slice(0, topN)

  console.log(`  [YouTube] 총 ${videos.length}개 영상 (댓글 합계 ${videos.reduce((s, v) => s + v.comments.length, 0)}개) · 2차 K-marker로 ${droppedBy2nd}건 제거`)
  return { videos, searchedHashtags: hashtags }
}
