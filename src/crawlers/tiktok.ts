// ============================================================
// TikTok SNS 버즈 크롤러
// @tobyg74/tiktok-api-dl + 사용자 sessionid 쿠키 (~/Desktop/secret/001/tiktok-cookies.json)
// 키워드 검색 → 영상 메타·통계·댓글 → 2단계 K-content 마커 필터
// ============================================================

import fs from 'fs'
import os from 'os'
import path from 'path'
import { KNOWN_ACTORS_STATIC, KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'
import type {
  TikTokVideo, TikTokComment, TikTokAuthor, TikTokSound, TikTokChannelType,
} from '../types/index.js'

// ── 검색 키워드 (단일 영문 단어만 — 띄어쓰기는 라이브러리 retry 누적으로 매우 느려짐) ──
const KEYWORDS = ['kdrama', 'koreandrama', 'kdramareview', 'kdramareaction', 'kdramaclip', 'kvarietyshow', 'lovelyrunner']
const PAGES_PER_KEYWORD = 3
const PER_REQUEST_TIMEOUT_MS = 15000     // 단일 (kw, page) timeout (라이브러리 retry 누적 캡)
const RETRY_FAILED_AT_END = true         // 1차 실패한 (kw, page)들 끝에 한 번만 재시도
const SEARCH_CONCURRENCY = 6             // 동시 search 호출 수 (병렬화로 wall-clock 단축)

// ── 쿠키 로드 (mtime 기반 cache invalidation) ───────────────
const COOKIE_PATH = path.join(os.homedir(), 'Desktop/secret/001/tiktok-cookies.json')
let cookieCache: { mtime: number; cookies: { name: string; value: string }[] } | null = null
function loadTiktokCookies(): { name: string; value: string }[] | null {
  try {
    if (!fs.existsSync(COOKIE_PATH)) {
      console.warn(`[TikTok] 쿠키 파일 없음: ${COOKIE_PATH}`)
      return null
    }
    const stat = fs.statSync(COOKIE_PATH)
    const mtime = stat.mtimeMs
    if (cookieCache && cookieCache.mtime === mtime) return cookieCache.cookies
    const arr = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    const cookies = arr.filter((c: any) => c.name && c.value)
    cookieCache = { mtime, cookies }
    console.log(`[TikTok] 쿠키 로드: ${cookies.length}개 항목 (mtime=${new Date(mtime).toISOString()})`)
    return cookies
  } catch (e) {
    console.warn(`[TikTok] 쿠키 로드 실패: ${(e as Error).message}`)
    return null
  }
}

// ── 채널 분류 패턴 (YouTube 패턴 적응) ────────────────────
const OFFICIAL_NICK_PATTERNS = [
  /\bnetflix(\s|_)?(korea|asia|kr|kcontent)\b/i, /the swoon/i, /kocowa/i, /\bviki\b/i,
  /\bkbs( world)?\b/i, /\bsbs( now)?\b/i, /\bmbc( world)?\b/i, /\btvn(asia)?\b/i, /\bjtbc\b/i, /\bena\b/i, /\bocn\b/i,
  /studio dragon/i, /\bcjenm\b/i, /\bcj enm\b/i,
  /\bhybe\b/i, /\bsm( entertainment)?\b/i, /\byg( entertainment)?\b/i, /\bjyp( entertainment)?\b/i,
  /bighit/i, /source music/i, /belift/i,
]
const CREATOR_PATTERNS = [
  /\bkdrama (review|recap|reaction|fan|news|love|lover|life|world|tok|edit)/i,
  /\b(review|recap|reaction)\b.*?\bkdrama\b/i,
  /\bkdramatime\b/i, /\bkoreanaddict\b/i, /\bkdramaverse\b/i, /\bdramabean\b/i,
  /\bkdrama (queen|critic|update|talk|spoiler)/i,
  /\bkpop (insider|now|news|review)\b/i,
]

function classifyChannelType(nickname: string, uniqueId: string, signature: string = ''): TikTokChannelType {
  const text = `${nickname} ${uniqueId} ${signature}`
  if (OFFICIAL_NICK_PATTERNS.some((re) => re.test(text))) return 'official'
  if (CREATOR_PATTERNS.some((re) => re.test(text))) return 'creator'
  return 'community'
}

// ── 비-K 콘텐츠 / 비-NA 신호 (YouTube와 동일) ──────────────
const NON_K_DRAMA_RE = /\b(c-?drama|chinese drama|j-?drama|japanese drama|thai drama|t-?drama|taiwanese drama|filipino drama|indian drama|turkish drama|donghua)\b/i
const NON_NA_SCRIPT_RE = /[ऀ-ॿ؀-ۿЀ-ӿ฀-๿]/  // Devanagari + Arabic + Cyrillic + Thai
const NON_NA_LATIN_WORDS_RE = /\b(bhai|yaar|matlab|achha|kya hai|mera|hamara|tumhara|bik gaya|ek number|talaga|naman po)\b/i
const HINDI_INTERMIX_RE = /\b(bhai|yaar)\b/i
const NON_NA_REGIONAL_OFFICIAL_RE = /\b(philippines|filipino|india|indonesia|vietnam|malaysia|thailand|brasil|brazil|brasileir|latino|latina|español|espanol|deutschland|polska|t[üu]rkiye|t[üu]rkce|arabia|arabic)\b/i

// ── K-content 마커 ────────────────────────────────────────
const K_CONTENT_KEYWORDS = [
  /\b(korean|korea\b)/i,
  /\bk-?drama\b/i,
  /\bk-?variety\b/i,
  /\bk-?content\b/i,
  /\bhallyu\b/i,
  /\bkbs\b|\bsbs\b|\bmbc\b|\btvn\b|\bjtbc\b/i,
]
const HANGUL_RE = /[가-힣]/
const KNOWN_ACTOR_LOWER = new Set(KNOWN_ACTORS_STATIC.map((s) => s.toLowerCase()))
const KNOWN_DRAMA_LOWER = new Set(KNOWN_DRAMAS_STATIC.map((s) => s.toLowerCase()))

function hasKContentMarker(caption: string, channelMeta: string, hashtags: string[]): boolean {
  const text = `${caption}`
  const fullText = `${caption} ${channelMeta}`
  if (NON_K_DRAMA_RE.test(text)) return false
  if (NON_NA_SCRIPT_RE.test(fullText)) return false
  if (NON_NA_LATIN_WORDS_RE.test(fullText)) return false
  if (HINDI_INTERMIX_RE.test(fullText)) return false
  if (HANGUL_RE.test(text)) return true
  if (K_CONTENT_KEYWORDS.some((re) => re.test(text))) return true
  // 해시태그가 #k...로 시작하면 통과 (단 너무 일반적인 #kpop 단독은 마커 약함 — kdrama·korean 류만)
  if (hashtags.some((h) => /^#?k(drama|orean|netflix|content|wave|hallyu|variety)/i.test(h))) return true
  // 알려진 K-배우/드라마 이름 매칭
  const lower = text.toLowerCase()
  for (const a of KNOWN_ACTOR_LOWER) if (a.length >= 6 && lower.includes(a)) return true
  for (const d of KNOWN_DRAMA_LOWER) if (d.length >= 5 && lower.includes(d)) return true
  return false
}

// ── community 채널 caption 통과 (외국 개인 K-팬 커버) ──────
const REACTION_REVIEW_CAPTION = /\b(reaction|reacting|first time watching|review|recap|breakdown|explained|edit|fmv|amv|favorite)\b/i
// K-content 해시태그 (caption에 명시되어 있으면 community도 통과)
const K_HASHTAG_RE = /^#?k(drama|orean|netflix|content|wave|hallyu|variety)/i

function extractHashtags(caption: string): string[] {
  return (caption.match(/#[\w가-힣]+/g) || []).map((s) => s.toLowerCase())
}

// ── 메인 크롤러 ───────────────────────────────────────────
export async function crawlTiktokBuzz(
  options: { keywords?: string[]; perKeywordLimit?: number; topN?: number; commentsPerVideo?: number } = {}
): Promise<{ videos: TikTokVideo[]; searchedKeywords: string[] }> {
  const {
    keywords = KEYWORDS,
    perKeywordLimit = 20,
    topN = 30,
    commentsPerVideo = 20,
  } = options

  const cookies = loadTiktokCookies()
  if (!cookies) {
    console.warn('[TikTok] 쿠키 없음 → 빈 결과 반환')
    return { videos: [], searchedKeywords: keywords }
  }

  // dynamic import (ESM-only)
  const ttPkg: any = await import('@tobyg74/tiktok-api-dl')
  const TT = ttPkg.default || ttPkg
  const Search = TT.Search
  const GetVideoComments = TT.GetVideoComments

  // 1. 키워드별 검색 — (kw, page) 작업을 병렬 batch로 실행
  // 라이브러리 내부 retry는 10회 누적되어 매우 느려지므로 wrapper에서 짧은 timeout으로 캡
  // 1차 실패한 작업은 마지막에 한 번 더 재시도 (TikTok 일시 거부는 자주 두 번째에 풀림)
  console.log(`  [TikTok] ${keywords.length}개 키워드 × ${PAGES_PER_KEYWORD}페이지 병렬 검색 중...`)
  const allRaw: any[] = []
  type Task = { kw: string; page: number }
  const allTasks: Task[] = []
  for (const kw of keywords) for (let p = 1; p <= PAGES_PER_KEYWORD; p++) allTasks.push({ kw, page: p })

  const oneSearch = async (t: Task): Promise<{ task: Task; items: any[]; ok: boolean }> => {
    try {
      const searchPromise = Search(t.kw, { type: 'video', cookie: cookies, page: t.page })
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout-${PER_REQUEST_TIMEOUT_MS / 1000}s`)), PER_REQUEST_TIMEOUT_MS))
      const r: any = await Promise.race([searchPromise, timeoutPromise])
      if (r?.status === 'success' && Array.isArray(r?.result) && r.result.length > 0) {
        return { task: t, items: r.result.slice(0, perKeywordLimit), ok: true }
      }
      return { task: t, items: [], ok: false }
    } catch {
      return { task: t, items: [], ok: false }
    }
  }

  // batch 병렬 실행
  const runBatched = async (tasks: Task[]): Promise<{ task: Task; items: any[]; ok: boolean }[]> => {
    const out: { task: Task; items: any[]; ok: boolean }[] = []
    for (let i = 0; i < tasks.length; i += SEARCH_CONCURRENCY) {
      const slice = tasks.slice(i, i + SEARCH_CONCURRENCY)
      const settled = await Promise.allSettled(slice.map(oneSearch))
      for (const s of settled) if (s.status === 'fulfilled') out.push(s.value)
      // batch 간 짧은 cooldown (rate limit 회피)
      if (i + SEARCH_CONCURRENCY < tasks.length) await new Promise((res) => setTimeout(res, 800))
    }
    return out
  }

  const firstResults = await runBatched(allTasks)
  for (const r of firstResults) {
    if (r.ok) for (const it of r.items) allRaw.push({ ...it, _searchKeyword: r.task.kw, _page: r.task.page })
  }
  const failed = firstResults.filter((r) => !r.ok).map((r) => r.task)
  let retryGained = 0

  if (RETRY_FAILED_AT_END && failed.length > 0) {
    console.log(`  [TikTok] 1차 실패 ${failed.length}개 재시도 중...`)
    await new Promise((res) => setTimeout(res, 3000))
    const retryResults = await runBatched(failed)
    for (const r of retryResults) {
      if (r.ok) {
        for (const it of r.items) allRaw.push({ ...it, _searchKeyword: r.task.kw, _page: r.task.page })
        retryGained++
      }
    }
  }

  const totalOk = firstResults.filter((r) => r.ok).length + retryGained
  console.log(`  [TikTok] raw ${allRaw.length}개 (총 ${allTasks.length}작업, 성공 ${totalOk}, 재시도 회수 +${retryGained})`)

  // 2. id dedup, 더 큰 playCount 유지
  const merged = new Map<string, any>()
  for (const v of allRaw) {
    if (!v?.id) continue
    const ex = merged.get(v.id)
    const newViews = v.stats?.playCount || 0
    const exViews = ex?.stats?.playCount || 0
    if (!ex || newViews > exViews) merged.set(v.id, v)
  }
  const dedup = [...merged.values()]
  console.log(`  [TikTok] dedup 후 ${dedup.length}개 유니크 영상`)

  // 2.5. 시간 필터 — 단계적 fallback (30일 → 60일 → 90일)
  // 30일 이내가 너무 적으면(<MIN_RECENT) 60일·90일로 점진적 완화
  // createTime: Unix 초 단위. 메타 누락 시(0/undefined) 보수적으로 통과
  const MIN_RECENT = 15  // 최종 topN=30 채우려면 이 정도는 있어야 안전
  const NOW_SEC = Math.floor(Date.now() / 1000)
  const filterByDays = (days: number) => {
    const cutoff = NOW_SEC - days * 24 * 3600
    return dedup.filter((v) => {
      const ct = v.createTime || 0
      if (!ct) return true
      return ct >= cutoff
    })
  }
  let recent = filterByDays(30)
  let appliedWindow = 30
  if (recent.length < MIN_RECENT) {
    const r60 = filterByDays(60)
    if (r60.length > recent.length) { recent = r60; appliedWindow = 60 }
  }
  if (recent.length < MIN_RECENT) {
    const r90 = filterByDays(90)
    if (r90.length > recent.length) { recent = r90; appliedWindow = 90 }
  }
  const droppedByDate = dedup.length - recent.length
  console.log(`  [TikTok] ${appliedWindow}일 이내 필터 후 ${recent.length}개 (${droppedByDate}개 제거)${appliedWindow > 30 ? ' — 30일이 부족해 fallback 확장' : ''}`)

  // 3. 1차 필터 — 채널 분류 + caption 마커 (description 없는 단계)
  const channelFiltered = recent.filter((v) => {
    const a = v.author || {}
    const ct = classifyChannelType(a.nickname || '', a.uniqueId || '', a.signature || '')
    if (ct === 'official' || ct === 'creator') return true
    // community 채널 통과 조건 (둘 중 하나):
    // 1) caption이 reaction/review/recap/edit 등 명시 키워드 포함
    // 2) caption 해시태그에 #kdrama / #koreandrama / #kvariety 등 K-content 태그 포함
    if (REACTION_REVIEW_CAPTION.test(v.desc || '')) return true
    const hashtags = extractHashtags(v.desc || '')
    return hashtags.some((h) => K_HASHTAG_RE.test(h))
  })

  const filtered1 = channelFiltered.filter((v) => {
    const a = v.author || {}
    const ct = classifyChannelType(a.nickname || '', a.uniqueId || '', a.signature || '')
    if (ct === 'official') {
      // 비-NA 지역 분점 즉시 탈락
      const channelMeta = `${a.nickname || ''} ${a.uniqueId || ''}`
      if (NON_NA_REGIONAL_OFFICIAL_RE.test(channelMeta)) return false
      return true  // 1차 면제 (description 없음)
    }
    const hashtags = extractHashtags(v.desc || '')
    return hasKContentMarker(v.desc || '', `${a.nickname || ''} ${a.uniqueId || ''} ${a.signature || ''}`, hashtags)
  })
  console.log(`  [TikTok] 채널·1차 마커 필터 후 ${filtered1.length}개`)

  // 4. engagement 정렬 후 오버샘플 (topN * 1.5)
  const oversample = Math.ceil(topN * 1.5)
  filtered1.sort((a, b) => (b.stats?.playCount || 0) - (a.stats?.playCount || 0))
  const candidates = filtered1.slice(0, oversample)

  // 5. 영상별 댓글 fetch (동시성 5)
  console.log(`  [TikTok] 상위 ${candidates.length}개 영상 댓글 수집 중... (목표 ${topN})`)
  const fetched: TikTokVideo[] = []
  const batch = 5
  for (let i = 0; i < candidates.length; i += batch) {
    const slice = candidates.slice(i, i + batch)
    const tasks = slice.map(async (v: any): Promise<TikTokVideo | null> => {
      const a = v.author || {}
      const url = `https://www.tiktok.com/@${a.uniqueId}/video/${v.id}`
      let comments: TikTokComment[] = []
      try {
        const cmts = await GetVideoComments(url, { cookie: cookies, commentLimit: commentsPerVideo })
        const list: any[] = cmts?.result || cmts?.comments || []
        for (const c of list) {
          const text = c.text || c.content || c.comment_text || ''
          if (!text || text.length < 4) continue
          comments.push({
            text: String(text).slice(0, 800),
            author: c.user?.uniqueId || c.user?.nickname || c.author?.uniqueId || c.author?.nickname || 'anon',
            likes: c.diggCount || c.digg_count || c.likes || 0,
          })
          if (comments.length >= commentsPerVideo) break
        }
      } catch { /* 댓글 실패는 무시, 빈 배열 */ }

      const sound: TikTokSound | undefined = v.music ? {
        id: String(v.music.id || v.music.mid || ''),
        title: v.music.title || v.music.name || '',
        authorName: v.music.authorName || v.music.author || '',
        duration: v.music.duration,
        original: v.music.original,
        cover: v.music.coverThumb || v.music.coverMedium,
      } : undefined

      const author: TikTokAuthor = {
        id: a.id || '',
        uniqueId: a.uniqueId || '',
        nickname: a.nickname || '',
        avatar: a.avatarThumb || a.avatarMedium || a.avatarLarger,
        verified: a.verified,
        followerCount: a.followerCount || a.stats?.followerCount,
        signature: a.signature || '',
      }

      const desc = v.desc || ''
      return {
        id: String(v.id),
        description: desc,
        url,
        cover: v.video?.cover || v.video?.originCover || v.video?.dynamicCover,
        duration: v.video?.duration || v.duration || 0,
        views: v.stats?.playCount || 0,
        likes: v.stats?.diggCount || 0,
        shares: v.stats?.shareCount || 0,
        commentCount: v.stats?.commentCount || 0,
        saved: v.stats?.collectCount || 0,
        publishedAt: v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
        author,
        sound,
        comments,
        hashtags: extractHashtags(desc),
        channelType: classifyChannelType(author.nickname, author.uniqueId, author.signature || ''),
      }
    })
    const settled = await Promise.allSettled(tasks)
    for (const r of settled) if (r.status === 'fulfilled' && r.value) fetched.push(r.value)
  }

  // 6. 2차 K-content 마커 필터 — 댓글 텍스트까지 포함하여 모든 영상 재검사
  const verified = fetched.filter((v) => {
    const channelMeta = `${v.author.nickname} ${v.author.uniqueId} ${v.author.signature || ''}`
    if (v.channelType === 'official' && NON_NA_REGIONAL_OFFICIAL_RE.test(channelMeta)) return false
    return hasKContentMarker(v.description, channelMeta, v.hashtags)
  })
  const droppedBy2nd = fetched.length - verified.length

  const videos = verified.slice(0, topN)
  console.log(`  [TikTok] 총 ${videos.length}개 (댓글 합계 ${videos.reduce((s, v) => s + v.comments.length, 0)}개) · 2차 필터 ${droppedBy2nd}건 제거`)
  return { videos, searchedKeywords: keywords }
}
