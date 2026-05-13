// ============================================================
// Instagram 릴스 팬덤 반응 스캐너 — 분석
//   1) 제목 추출 — 명시 패턴 우선 → 사전 매칭 (이중 모드: 짧은 제목 word-boundary, 긴 제목 substring)
//   2) 반응 유형 분류 (커플 케미형/배우 비주얼형/…)
//   3) 반복 표현 추출 (HARD/WEAK stopwords 분리)
//   4) 캡션 단축 + keyPhrase
//   5) 작품별 화제도 — "작품 미확인 릴스" 가상 그룹 (≥2 reel일 때만 표시)
// ============================================================

import type {
  InstagramReel, InstagramComment, InstagramSummary, InstagramContentGroup, InstagramTopComment,
  InstagramPolarizationSignal, InstagramEmergingTrend,
} from '../types/index.js'
import { crawlInstagramBuzz } from '../crawlers/instagram.js'
import { KNOWN_DRAMAS_STATIC } from '../data/known-dramas-static.js'
import { groqChat } from '../lib/translate.js'

// ───────────────── 제목 정규화 ─────────────────
const TITLE_LOWERCASE_WORDS = new Set(['of', 'the', 'and', 'in', 'on', 'at', 'to', 'for', 'a', 'an', 'is', 'are', 'as'])
function toTitleCase(s: string): string {
  return s.split(/\s+/).map((w, i) => {
    if (i > 0 && TITLE_LOWERCASE_WORDS.has(w.toLowerCase())) return w.toLowerCase()
    if (!w) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

function trimTitleNoise(raw: string): string {
  // trailing emoji / quote / 마침표 / 따옴표 제거. 끝 괄호 한국어 표기는 보존
  return raw
    .trim()
    .replace(/^[""''「『]+|[""''」』]+$/g, '')
    .replace(/[.,!?\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u, '')
    .trim()
}

function engagementScore(r: InstagramReel): number {
  return Math.log10((r.views || 0) + 1) * 1
       + Math.log10((r.comments?.length || 0) + 1) * 5
}

const KSHOWS_STATIC = [
  'Running Man', 'Knowing Bros', 'I Live Alone', 'New Journey to the West',
  'Hangout with Yoo', 'Heart Signal', 'Single Inferno', 'Physical 100',
]

// ───────────────── 1. 제목 추출 ─────────────────
const EXPLICIT_LABEL_RE = /(?:kdrama name|drama name|show name|movie name|movie title|drama title|title|movie|show)\s*:\s*([^#\n\r]+)/i
const EMOJI_LABEL_RE = /🎬\s*:?\s*([^#\n\r]+)/u

type TitleSource = 'explicit-pattern' | 'known' | 'caption-pattern'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function dictionaryMatch(captionLower: string, captionRaw: string): { title: string; source: TitleSource } | null {
  const dramas = [...KNOWN_DRAMAS_STATIC].sort((a, b) => b.length - a.length)
  for (const d of dramas) {
    if (d.length < 4) continue
    const dl = d.toLowerCase()
    if (dl.length >= 8) {
      // 긴 제목: substring 허용
      if (captionLower.includes(dl)) return { title: toTitleCase(d), source: 'known' }
    } else {
      // 짧은 제목 (4~7자): 단어 경계로 EXACT 매칭
      const re = new RegExp(`\\b${escapeRegex(dl)}\\b`, 'i')
      if (re.test(captionRaw)) return { title: toTitleCase(d), source: 'known' }
    }
  }
  for (const show of KSHOWS_STATIC) {
    const sl = show.toLowerCase()
    if (sl.length >= 8) {
      if (captionLower.includes(sl)) return { title: show, source: 'caption-pattern' }
    } else {
      const re = new RegExp(`\\b${escapeRegex(sl)}\\b`, 'i')
      if (re.test(captionRaw)) return { title: show, source: 'caption-pattern' }
    }
  }
  return null
}

function trimLeadingPunct(s: string): string {
  // 선행 콜론/하이픈/공백/이모지 제거 — explicit-pattern 결과 정제용
  return s.replace(/^[:;\-—\s\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/u, '').trim()
}

function formatExplicitTitle(raw: string): string {
  const cleaned = trimLeadingPunct(trimTitleNoise(raw))
  // 괄호 한국어 표기는 보존, 앞부분만 TitleCase
  const parenIdx = cleaned.indexOf('(')
  if (parenIdx > 0) {
    const head = cleaned.slice(0, parenIdx).trim()
    const tail = cleaned.slice(parenIdx)
    return `${toTitleCase(head)} ${tail}`.trim()
  }
  return toTitleCase(cleaned)
}

function extractContentTitle(reel: InstagramReel): { title: string; source: TitleSource } | null {
  const cap = reel.caption || ''
  if (!cap) return null

  // (1) 명시적 라벨 패턴 — 가장 신뢰
  const m1 = cap.match(EXPLICIT_LABEL_RE)
  if (m1 && m1[1]) {
    const t = formatExplicitTitle(m1[1])
    if (t.length >= 2 && t.length <= 80) return { title: t, source: 'explicit-pattern' }
  }
  const m2 = cap.match(EMOJI_LABEL_RE)
  if (m2 && m2[1]) {
    const t = formatExplicitTitle(m2[1])
    if (t.length >= 2 && t.length <= 80) return { title: t, source: 'explicit-pattern' }
  }

  // (2)(3) 사전 매칭 — 이중 모드
  const lower = cap.toLowerCase()
  return dictionaryMatch(lower, cap)
}

// ───────────────── 2. 반응 유형 분류 ─────────────────
const REACTION_KEYWORDS: Record<string, string[]> = {
  '커플 케미형': ['chemistry', 'couple', 'wife', 'husband', 'together',
                 'comfortable', 'down bad', 'in love', 'lovers', 'soulmate'],
  '배우 비주얼형': ['handsome', 'beautiful', 'visual', 'gorgeous', 'pretty',
                   'actor', 'actress', 'face', 'looks', 'stunning'],
  '로맨스 설정형': ['contract marriage', 'arranged marriage', 'royal', 'chaebol',
                   'prince', 'commoner', 'romance', 'rom-com', 'rom com',
                   'enemies to lovers', 'fake dating'],
  '감정 몰입형': ['crying', 'sad', 'heartbroken', 'emotional', "can't move on",
                 'cant move on', 'tears', 'broke me', 'sobbing'],
  'OST 무드형': ['ost', 'sound', 'song', 'music', 'vibe', 'aesthetic', 'soundtrack'],
  '밈/드립형': ['funny', 'meme', 'lol', 'iconic', 'savage', 'dying', '😂', '🤣'],
  '정보 소개형': ['plot:', 'title:', 'drama name', 'episodes', 'airs on',
                'network', 'starring', 'streaming on', 'kdrama name'],
}

function classifyReactionTypes(reel: InstagramReel): string[] {
  const haystack = (
    (reel.caption || '') + ' ' +
    (reel.comments || []).map((c) => c.text).join(' ')
  ).toLowerCase()
  const scores: [string, number][] = []
  for (const [label, kws] of Object.entries(REACTION_KEYWORDS)) {
    const hits = kws.reduce((s, k) => s + (haystack.includes(k) ? 1 : 0), 0)
    if (hits > 0) scores.push([label, hits])
  }
  scores.sort((a, b) => b[1] - a[1])
  return scores.slice(0, 2).map(([label]) => label)
}

function aggregateReactionPoints(reels: InstagramReel[]): { label: string; count: number; sampleText?: string }[] {
  const counts = new Map<string, number>()
  const samples = new Map<string, string>()
  for (const r of reels) {
    for (const label of (r.reactionTypes || [])) {
      counts.set(label, (counts.get(label) || 0) + 1)
      if (!samples.has(label)) {
        const txt = (r.keyPhrase || r.shortCaption || r.caption || '').slice(0, 80)
        if (txt) samples.set(label, txt)
      }
    }
  }
  const out = [...counts.entries()].map(([label, count]) => ({
    label,
    count,
    sampleText: samples.get(label),
  }))
  out.sort((a, b) => b.count - a.count)
  return out
}

// ───────────────── 3. 반복 표현 추출 ─────────────────
const HARD_STOPWORDS = new Set([
  // 플랫폼/메타
  'kdrama', 'kdramas', 'korean', 'koreans', 'koreandrama', 'koreanmovie',
  'drama', 'dramas', 'reel', 'reels', 'video', 'videos', 'watch', 'watching',
  'watched', 'episode', 'episodes', 'follow', 'following', 'comment', 'comments',
  'share', 'shares', 'subscribe', 'dm', 'instagram', 'fyp', 'viral', 'trending',
  'like', 'liked', 'likes', 'liking',
  // 너무 일반적
  'name', 'names', 'made', 'make', 'makes', 'making', 'go', 'going', 'come',
  'come', 'coming', 'get', 'gets', 'getting', 'got', 'see', 'sees', 'seen',
  'one', 'two', 'three', 'first', 'last', 'thing', 'things', 'people',
  'something', 'someone', 'every', 'every', 'each', 'man', 'woman', 'guy',
  'girl', 'boy', 'kid', 'kids', 'people',
])
const WEAK_STOPWORDS = new Set([
  // 일반 영문 (1-gram일 때만 폐기)
  'the', 'and', 'is', 'of', 'in', 'to', 'for', 'a', 'an', 'this', 'that',
  'it', 'you', 'we', 'they', 'he', 'she', 'them', 'on', 'at', 'be', 'are',
  'i', 'my', 'me', 'his', 'her', 'so', 'just', 'will', 'with', 'have', 'has',
  'really', 'such', 'very', 'was', 'were', 'been', 'being', 'do', 'does',
  'did', 'can', 'could', 'would', 'should', 'all', 'no', 'not', 'too',
  // wh-words / 접속사 / 지시
  'who', 'whom', 'what', 'when', 'where', 'why', 'which', 'how', 'whose',
  'their', 'there', 'here', 'but', 'or', 'if', 'then', 'than', 'because',
  'about', 'from', 'after', 'before', 'into', 'onto', 'over', 'under', 'up',
  'down', 'out', 'off', 'as', 'by', 'also', 'still', 'even', 'ever', 'never',
  'now', 'today', 'tomorrow', 'yesterday', 'maybe', 'much', 'many', 'few',
  'more', 'most', 'less', 'least', 'some', 'any', 'other', 'another', 'own',
  'same', 'best', 'better', 'good', 'bad', 'new', 'old',
])

function tokenize(text: string): string[] {
  // 영문/숫자 단어만 추출. 이모지/한글/punctuation 분리.
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(Boolean)
}

function isMeaninglessUnigram(tok: string): boolean {
  if (tok.length < 3) return true
  if (HARD_STOPWORDS.has(tok)) return true
  if (WEAK_STOPWORDS.has(tok)) return true
  if (/^\d+$/.test(tok)) return true
  return false
}

function gramAllowed(toks: string[]): boolean {
  const n = toks.length
  if (toks.some((t) => HARD_STOPWORDS.has(t))) return false
  if (n === 1) {
    return !isMeaninglessUnigram(toks[0])
  }
  if (n === 2) {
    const wc = toks.filter((t) => WEAK_STOPWORDS.has(t)).length
    return wc < 2  // 둘 다 weak이면 폐기
  }
  // n === 3
  const wc = toks.filter((t) => WEAK_STOPWORDS.has(t)).length
  return wc <= 2
}

function extractRepeatedPhrases(reels: InstagramReel[]): { phrase: string; count: number }[] {
  const counts = new Map<string, number>()

  for (const r of reels) {
    const pool = [r.caption || '', ...((r.comments || []).map((c) => c.text || ''))]
    for (const text of pool) {
      const toks = tokenize(text)
      if (toks.length === 0) continue
      // 1~3 gram
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i + n <= toks.length; i++) {
          const slice = toks.slice(i, i + n)
          if (!gramAllowed(slice)) continue
          // 짧은 토큰 (1자) 끼워 있는 n>=2-gram 폐기
          if (slice.some((t) => t.length < 2)) continue
          const key = slice.join(' ')
          if (key.length < 3) continue
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }
    }
  }

  // count >= 2, 상위 8개 정렬 (count desc, length desc — 긴 표현 우선)
  const out: { phrase: string; count: number }[] = []
  for (const [phrase, count] of counts) {
    if (count < 2) continue
    out.push({ phrase, count })
  }
  out.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)

  // 동일 의미 sub-phrase dedup: "in love" + "so in love" 같이 더 긴 것이 있으면 짧은 건 제거
  // (단순 휴리스틱: 어떤 phrase가 다른 phrase에 substring으로 포함되고 빈도 차이 ≤1이면 짧은 것 drop)
  const filtered: { phrase: string; count: number }[] = []
  for (const p of out) {
    let dropped = false
    for (const longer of filtered) {
      if (longer.phrase.includes(p.phrase) && longer.phrase !== p.phrase &&
          longer.count >= p.count - 1) {
        dropped = true
        break
      }
    }
    if (!dropped) filtered.push(p)
    if (filtered.length >= 8) break
  }
  return filtered
}

// ───────────────── 4. 캡션 단축 + keyPhrase ─────────────────
const SEPARATOR_LINE_RE = /^[\s.\u{00B0}\u{2022}\u{2014}\-_\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+$/u

function stripSeparatorLines(text: string): string {
  return text
    .split(/\n/)
    .filter((line) => line.trim().length > 0 && !SEPARATOR_LINE_RE.test(line))
    .join('\n')
}

function shortenCaption(caption: string, maxChars = 120): string {
  if (!caption) return ''
  let s = stripSeparatorLines(caption).trim()
  // "Plot:" 이후 잘라냄 — 긴 줄거리 dump 차단
  const plotIdx = s.search(/\bplot\s*:/i)
  if (plotIdx > 30) s = s.slice(0, plotIdx).trim()
  // 첫 문장 우선
  const firstLine = s.split(/[\n]/)[0].trim()
  let chosen = firstLine
  if (chosen.length > maxChars) {
    // 첫 마침표/물음표/느낌표/줄바꿈에서 자르기
    const cut = chosen.search(/[\.!?](\s|$)/)
    if (cut > 0 && cut < maxChars) chosen = chosen.slice(0, cut + 1)
    else chosen = chosen.slice(0, maxChars).trim() + '…'
  }
  return chosen
}

function extractKeyPhrase(caption: string): string {
  if (!caption) return ''
  // 첫 따옴표 안 텍스트
  const q = caption.match(/[""'']([^""''\n]{4,80})[""'']/)
  if (q) return q[1].trim()
  // 첫 문장 (≤80자)
  const cleaned = stripSeparatorLines(caption).trim()
  const firstLine = cleaned.split(/[\n]/)[0].trim()
  if (firstLine.length === 0) return ''
  const cut = firstLine.search(/[\.!?](\s|$)/)
  let result = (cut > 0 && cut < 80) ? firstLine.slice(0, cut + 1) : firstLine.slice(0, 80)
  return result.trim()
}

// ───────────────── 5. contentGroups (작품 미확인 처리) ─────────────────
const UNKNOWN_GROUP_TITLE = '작품 미확인 릴스'

function buildContentGroups(reels: InstagramReel[], maxGroups: number): InstagramContentGroup[] {
  type Acc = {
    title: string
    matchSource: 'known' | 'caption-pattern' | 'explicit-pattern' | 'unknown'
    reels: InstagramReel[]
    totalViews: number
    totalComments: number
  }
  const map = new Map<string, Acc>()
  const unknownAcc: Acc = {
    title: UNKNOWN_GROUP_TITLE,
    matchSource: 'unknown',
    reels: [],
    totalViews: 0,
    totalComments: 0,
  }

  // 그룹 키 정규화: 괄호 안 한국어 표기는 떼서 동일 작품 합치기 (예: "Perfect Crown" + "Perfect Crown (21세기 대군부인)" → 같은 키)
  const normalizeKey = (title: string) => title.replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase()

  for (const r of reels) {
    const t = (r.extractedTitle ? { title: r.extractedTitle, source: 'known' as const } : extractContentTitle(r))
    if (!t) {
      unknownAcc.reels.push(r)
      unknownAcc.totalViews += (r.likeCount ?? r.views) || 0
      unknownAcc.totalComments += (r.commentCount ?? r.comments?.length) || 0
      continue
    }
    const key = normalizeKey(t.title)
    const acc = map.get(key) || {
      title: t.title,
      matchSource: t.source as Acc['matchSource'],
      reels: [],
      totalViews: 0,
      totalComments: 0,
    }
    // 괄호 표기가 더 자세한 쪽을 display title로 채택
    if (t.title.includes('(') && !acc.title.includes('(')) acc.title = t.title
    acc.reels.push(r)
    // totalViews는 likeCount 합 (UI에서 ❤로 표기), totalComments는 실제 commentCount 합
    acc.totalViews += (r.likeCount ?? r.views) || 0
    acc.totalComments += (r.commentCount ?? r.comments?.length) || 0
    // explicit-pattern > known > caption-pattern 우선순위
    const rank = (s: string) => s === 'explicit-pattern' ? 3 : s === 'known' ? 2 : 1
    if (rank(t.source) > rank(acc.matchSource)) acc.matchSource = t.source
    map.set(key, acc)
  }

  // 작품 미확인 그룹은 ≥2 reel일 때만 포함
  const accs: Acc[] = [...map.values()]
  if (unknownAcc.reels.length >= 2) accs.push(unknownAcc)

  const groups: InstagramContentGroup[] = []
  for (const acc of accs) {
    if (acc.reels.length === 0) continue
    const top = [...acc.reels].sort((a, b) => engagementScore(b) - engagementScore(a))[0]
    const topComments: InstagramTopComment[] = acc.reels
      .flatMap((r) => r.comments
        .filter((c) => c.author !== 'instagram_reel')
        .map<InstagramTopComment>((c) => ({
          text: c.text,
          textKo: c.textKo,
          author: c.author,
          approxLikes: c.approxLikes,
          reelId: r.id,
          reelUrl: r.url,
          reelCaption: (r.shortCaption || r.caption).slice(0, 140),
        })))
      .sort((a, b) => b.approxLikes - a.approxLikes)
      .slice(0, 3)

    // 그룹 reactionTypes union (top 2)
    const tagFreq = new Map<string, number>()
    for (const r of acc.reels) {
      for (const t of (r.reactionTypes || [])) {
        tagFreq.set(t, (tagFreq.get(t) || 0) + 1)
      }
    }
    const reactionTypes = [...tagFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t)

    // 발견 hashtag union (max 4개) — 사용자 요청: "발견 태그 #kdrama #koreandrama"
    const tagCounts = new Map<string, number>()
    for (const r of acc.reels) {
      const t = r.tag
      if (t) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
    }
    const discoveredTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t)

    groups.push({
      title: acc.title,
      reelCount: acc.reels.length,
      totalViews: acc.totalViews,
      totalComments: acc.totalComments,
      topReelId: top.id,
      topReelUrl: top.url,
      topReelCaption: (top.shortCaption || top.caption).slice(0, 140),
      topReelCapturePath: top.capturePath,
      topComments,
      matchSource: acc.matchSource,
      reactionTypes,
      discoveredTags,
    })
  }
  // unknown 그룹은 항상 마지막. 나머지는 reelCount desc (겹쳐 언급된 횟수 우선) 후 totalViews desc.
  groups.sort((a, b) => {
    if (a.matchSource === 'unknown' && b.matchSource !== 'unknown') return 1
    if (a.matchSource !== 'unknown' && b.matchSource === 'unknown') return -1
    return b.reelCount - a.reelCount || b.totalViews - a.totalViews
  })
  return groups.slice(0, maxGroups)
}

function buildTopComments(reels: InstagramReel[], maxN: number): InstagramTopComment[] {
  const all: InstagramTopComment[] = []
  for (const r of reels) {
    for (const c of r.comments) {
      if (c.author === 'instagram_reel') continue
      all.push({
        text: c.text,
        textKo: c.textKo,
        author: c.author,
        approxLikes: c.approxLikes,
        reelId: r.id,
        reelUrl: r.url,
        reelCaption: (r.shortCaption || r.caption).slice(0, 140),
      })
    }
  }
  return all.sort((a, b) => b.approxLikes - a.approxLikes).slice(0, maxN)
}

// ───────────────── 5.5. reelScore + Top 3 헬퍼 (2026-05-08 #4) ─────────────────
//   crawler와 동일 가중치 — analyzer에서 글로벌 정렬 검증용
function reelScore(r: InstagramReel): number {
  const v = r.viewCount ?? 0
  const l = (r.likeCount ?? r.views) || 0
  const c = (r.commentCount ?? r.comments?.length) || 0
  return Math.log10(v + 1) * 1
       + Math.log10(l + 1) * 2
       + Math.log10(c + 1) * 5
}

// reactionType 라벨 → 한국어 자연어 fallback bullet (Groq 실패 시)
// fallback — Groq 실패/표본 부족 시 reactionTypes를 단순 문구로 변환 (2026-05-12: deprecated, 의미 없는 generic이라 빈 배열 반환 우선)
function fallbackReactionSummary(reel: InstagramReel): string[] {
  // 표본이 정말 없을 때만 안내 메시지 — 그 외에는 빈 배열 반환해 UI에서 섹션 자체를 hide
  const deepN = reel.deepComments?.length || 0
  if (deepN === 0) return ['공개 페이지에서 댓글 추출이 제한적이라 요약 어려움']
  return []
}

const REACTION_SYSTEM_PROMPT = `당신은 K-콘텐츠 SNS 반응 분석가다. Instagram Reel의 caption과 해외 팬 댓글을 보고 구체적·근거 있는 한국어 분석을 작성한다.

규칙:
- 반드시 순수 한글 사용 (작품명/배우명/짧은 인용은 영문 보존)
- 추상적 표현 금지 ("반응 좋음", "긍정적" 같은 generic 표현 X)
- 댓글에서 실제 표현/단어를 따옴표로 인용해 근거 제시
- 감정의 결(매혹/분노/유머/공감 등)과 그 강도를 구체화
- 일반론 X, 이 reel 고유의 시청자 행동·반응 패턴을 짚어낼 것`

async function buildReactionSummary(reel: InstagramReel): Promise<string[]> {
  const deep = reel.deepComments || []
  if (deep.length < 3) return fallbackReactionSummary(reel)
  // 댓글 더 많이 샘플 (이전 30 → 50). 좋아요 내림차순으로 정렬해 상위 댓글 우선 분석
  const sample = [...deep]
    .sort((a, b) => (b.approxLikes || 0) - (a.approxLikes || 0))
    .slice(0, 50)
    .map((c, i) => `${i + 1}. (${c.approxLikes || 0}♥) ${c.text}`)
    .join('\n')
  const caption = (reel.shortCaption || reel.caption || '').slice(0, 300)
  const reactionLabels = (reel.reactionTypes || []).join(', ')
  // 2026-05-12 v2: 라벨 3종 고정 (이모지 X) but 각 라인 모두 인용·구체성·풍부함 강제
  //   - 핵심 반응·미세 신호 라인도 영문 인용을 적극 사용해야 함 (특정 표현 라인이 인용을 독점 X)
  //   - 글자수 60 → 80으로 확장 (이전 60자는 추상화 유도)
  const userPrompt = `K-콘텐츠 Instagram Reel 1개에 달린 해외 팬 댓글 ${deep.length}개를 심층 분석하라.

정확히 3줄로 출력. 각 줄은 라벨로 시작 (라벨 뒤 줄바꿈 없이 한 문장). 줄 안 이모지·번호·불릿기호 사용 금지 단, 댓글에서 따온 인용 안의 이모지(😭🤣 등)는 허용.

핵심 반응 — 시청자 행동/감정을 가장 두드러진 한 문장으로 묘사. 반드시 댓글에서 따온 영문 표현 1~2개를 따옴표로 인용해 근거 제시. 단순 "긍정적/매혹"이 아니라 "어떤 종류의" 매혹/집착/공감/웃음/분노/슬픔인지 구체화. 80자 이내.

미세 신호 — 핵심 반응에 안 들어간 흥미로운 패턴 1개. 다음 중 하나를 구체적 사례와 함께 제시 (반드시 1개 이상 인용/이모지 포함): 감정 양면(예: 😭와 😩 공존), 캐릭터 동시 언급, 다른 작품 비교 등장, viral 원인 추정, 시청 동기 추정. 80자 이내.

특정 표현 — 댓글에서 가장 자주 반복된 영문 표현 2~3개를 따옴표로 인용 + 반복 양상(N건/반복적/연속 등장 등). 예 형식: "wife"와 "fake dating"이 ${deep.length}개 댓글 중 N건 반복되며 ~한 분위기를 형성. 80자 이내.

❗ 절대 금지: "매혹과 집착이 두드러진다" 같은 인용 없는 추상 문장. 모든 줄에 댓글에서 따온 실제 영문 표현/이모지를 1개 이상 포함할 것.

분류된 반응 카테고리(참고용): ${reactionLabels || '미분류'}

[Caption]
${caption}

[댓글 샘플 (좋아요 내림차순, 최대 50개)]
${sample}`

  try {
    const resp = await groqChat(REACTION_SYSTEM_PROMPT, userPrompt, { temperature: 0.4, maxTokens: 500 })
    if (!resp) return fallbackReactionSummary(reel)
    // 라벨이 줄 안에 들어 있는지 보고 추출. 라벨 없으면 prefix로 강제 부여
    const REQUIRED_LABELS = ['핵심 반응', '미세 신호', '특정 표현']
    const rawLines = resp
      .split(/\n+/)
      .map((s) => s.replace(/^[\-\*•・·\d\.\s)]+/, '').trim())
      .filter((s) => s.length > 8)

    // 각 라벨에 매칭되는 라인 찾기
    const matched: Record<string, string> = {}
    for (const line of rawLines) {
      for (const label of REQUIRED_LABELS) {
        if (matched[label]) continue
        if (line.startsWith(label) || line.includes(`${label} —`) || line.includes(`${label}—`) || line.includes(`${label}:`)) {
          matched[label] = line
          break
        }
      }
    }
    // 매칭 못한 라벨에는 순서대로 남은 라인 매핑 (라벨 없이 그냥 첫줄/둘째줄/셋째줄로 옴)
    const unmatchedLines = rawLines.filter((l) => !Object.values(matched).includes(l))
    for (const label of REQUIRED_LABELS) {
      if (matched[label]) continue
      const next = unmatchedLines.shift()
      if (next) matched[label] = `${label} — ${next}`
    }
    // 정해진 순서로 출력. 라벨 prefix 정규화 (`핵심 반응 — ...` 형식 강제)
    const out: string[] = []
    for (const label of REQUIRED_LABELS) {
      const line = matched[label]
      if (!line) continue
      const cleaned = line.replace(new RegExp(`^${label}\\s*[—:\\-]\\s*`), '').trim()
      out.push(`${label} — ${cleaned}`)
    }
    return out.length > 0 ? out : fallbackReactionSummary(reel)
  } catch {
    return fallbackReactionSummary(reel)
  }
}

function pickRepresentativeComments(reel: InstagramReel): InstagramComment[] {
  const deep = reel.deepComments || []
  if (deep.length === 0) return []
  return [...deep]
    .filter((c) => c.author !== 'instagram_reel' && (c.text || '').trim().length >= 4)
    .sort((a, b) => (b.approxLikes || 0) - (a.approxLikes || 0))
    .slice(0, 6)  // 2026-05-12: 3 → 6 (fetched 양 늘리고 UI 표시도 함께 확대)
    .map((c) => ({ ...c }))
}

// ───────────────── 6. 메인 ─────────────────
// ============================================================
// 2026-05-12 뾰족한 인사이트용 분석 함수 (6종)
// ============================================================

// ── 6-1. 작품별 반응 분포 (within-group mix) ───────────────
// 그룹 내부에서 각 reaction 라벨이 차지하는 비율
function computeGroupReactionMix(reels: InstagramReel[]): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  for (const r of reels) {
    for (const t of (r.reactionTypes || [])) counts.set(t, (counts.get(t) || 0) + 1)
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0)
  if (total === 0) return []
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
}

// ── 6-2. 그룹 engagement 분류 ──────────────────────────────
// commentRatio (comments / likes) 기준 — Instagram은 view 비공개 흔해서 likes 기준이 안정적
//   * ratio ≥ 5% → active (활발한 토론)
//   * ratio ≤ 1% → passive (조용한 호감)
//   * 그 사이 → mid
function computeGroupEngagementClass(reels: InstagramReel[]): 'passive' | 'active' | 'mid' {
  let totalLikes = 0
  let totalComments = 0
  for (const r of reels) {
    totalLikes += (r.likeCount ?? r.views) || 0
    totalComments += (r.commentCount ?? r.comments?.length) || 0
  }
  if (totalLikes < 100) return 'mid'  // 표본 부족 시 중립
  const ratio = totalComments / totalLikes
  if (ratio >= 0.05) return 'active'
  if (ratio <= 0.01) return 'passive'
  return 'mid'
}

// ── 6-3. 양극화 신호 (deep crawl된 top 3 reel만) ───────────
// 1) deepComments의 likes 분산 (log scale) — 큰 분산 = 의견 차이
// 2) 긍정 키워드 vs 부정 키워드 댓글 비율
//    polarized = 분산 큼 AND (양 극단 ≥ 25%, 30% 이하 격차)
const POSITIVE_HINTS_RE = /\b(love|loved|loving|amazing|perfect|brilliant|best|favorite|iconic|gorgeous|stunning|masterpiece|chef'?s kiss|10\/10|obsessed|incredible)\b/i
const NEGATIVE_HINTS_RE = /\b(hate|hated|hating|awful|terrible|worst|cringe|boring|disappointed|disappointing|annoying|overrated|trash|skip|nope|hard pass|bad)\b/i
const DISAGREEMENT_HINTS_RE = /\b(disagree|hard pass|not for me|don'?t see it|overrated|am i the only one|hot take|controversial)\b/i

function detectPolarization(reel: InstagramReel): InstagramPolarizationSignal | null {
  const dc = reel.deepComments
  if (!dc || dc.length < 6) return null  // 표본 부족 시 판정 안 함

  // 1) likes 분산 (log scale로 outlier 압축)
  const likes = dc.map((c) => Math.log10((c.approxLikes || 0) + 1))
  const mean = likes.reduce((s, n) => s + n, 0) / likes.length
  const variance = likes.reduce((s, n) => s + (n - mean) ** 2, 0) / likes.length

  // 2) 긍/부 비율
  let agreementCount = 0
  let disagreementCount = 0
  let topDisagreement: InstagramComment | null = null
  for (const c of dc) {
    const text = c.text || ''
    if (POSITIVE_HINTS_RE.test(text)) agreementCount++
    if (NEGATIVE_HINTS_RE.test(text) || DISAGREEMENT_HINTS_RE.test(text)) {
      disagreementCount++
      if (!topDisagreement || (c.approxLikes || 0) > (topDisagreement.approxLikes || 0)) {
        topDisagreement = c
      }
    }
  }
  const total = agreementCount + disagreementCount
  const minorityPct = total === 0 ? 0 : Math.min(agreementCount, disagreementCount) / total
  // polarized = 분산 ≥ 0.25 (likes 분포 넓음) AND 양 극단 모두 ≥ 25%
  const polarized = variance >= 0.25 && minorityPct >= 0.25 && total >= 3

  return {
    reelId: reel.id,
    polarized,
    likesVariance: Number(variance.toFixed(3)),
    agreementCount,
    disagreementCount,
    topDisagreement: polarized && topDisagreement ? {
      text: topDisagreement.text,
      textKo: topDisagreement.textKo,
      approxLikes: topDisagreement.approxLikes || 0,
    } : undefined,
  }
}

// ── 6-4. 신흥 미시 트렌드 (candidatePool 활용) ─────────────
// top10 외에서 candidatePool에 ≥2회 등장하는 작품
function findEmergingTrends(candidatePool: InstagramReel[], topReels: InstagramReel[]): InstagramEmergingTrend[] {
  const topTitles = new Set(
    topReels
      .map((r) => (r.extractedTitle || '').trim().toLowerCase())
      .filter((s) => s.length > 0),
  )
  type Acc = { title: string; reels: InstagramReel[] }
  const map = new Map<string, Acc>()
  const norm = (t: string) => t.replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase()
  for (const r of candidatePool) {
    const title = (r.extractedTitle || '').trim()
    if (!title) continue
    const key = norm(title)
    if (topTitles.has(key)) continue  // top10 이미 포함된 작품 제외
    const acc = map.get(key) || { title, reels: [] }
    // 더 자세한 표기 우선
    if (title.length > acc.title.length) acc.title = title
    acc.reels.push(r)
    map.set(key, acc)
  }
  const out: InstagramEmergingTrend[] = []
  for (const acc of map.values()) {
    if (acc.reels.length < 2) continue  // 최소 2회 등장 필요
    const top = [...acc.reels].sort((a, b) => engagementScore(b) - engagementScore(a))[0]
    out.push({
      title: acc.title,
      candidateCount: acc.reels.length,
      sampleReelUrl: top.url,
      sampleCaption: (top.shortCaption || top.caption || '').slice(0, 100),
    })
  }
  out.sort((a, b) => b.candidateCount - a.candidateCount)
  return out.slice(0, 6)
}

// ── 6-5. 그룹 enrich (mix + dominant + engagement) ─────────
// buildContentGroups 후처리 — InstagramContentGroup에 새 optional 필드 채움
function enrichGroupsWithSharpInsights(
  groups: InstagramContentGroup[],
  allReels: InstagramReel[],
): InstagramContentGroup[] {
  // 그룹별 소속 reel 매핑 (title 기준)
  const norm = (t: string) => t.replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase()
  const reelsByGroup = new Map<string, InstagramReel[]>()
  for (const g of groups) reelsByGroup.set(norm(g.title), [])
  for (const r of allReels) {
    const key = norm(r.extractedTitle || '')
    if (reelsByGroup.has(key)) reelsByGroup.get(key)!.push(r)
  }
  return groups.map((g) => {
    const reels = reelsByGroup.get(norm(g.title)) || []
    if (reels.length === 0) return g
    const reactionMix = computeGroupReactionMix(reels)
    const dominantReaction = reactionMix[0]
      ? { label: reactionMix[0].label, pct: reactionMix[0].pct }
      : undefined
    const engagementClass = computeGroupEngagementClass(reels)
    return { ...g, reactionMix, dominantReaction, engagementClass }
  })
}

// 테스트용 export (개발 검증 전용 — 외부 호출자는 사용 X)
export const __test = {
  extractContentTitle,
  classifyReactionTypes,
  aggregateReactionPoints,
  extractRepeatedPhrases,
  shortenCaption,
  extractKeyPhrase,
  buildContentGroups,
  // 2026-05-12 뾰족화
  computeGroupReactionMix,
  computeGroupEngagementClass,
  detectPolarization,
  findEmergingTrends,
  enrichGroupsWithSharpInsights,
  buildReactionSummary,  // 캐시 재생성용
}

export async function buildInstagramSummary(): Promise<InstagramSummary> {
  const result = await crawlInstagramBuzz()
  // 4-stage funnel (2026-05-08 #4):
  //   - result.candidatePool = Stage 1 통과 전체 (~30~55) → 🏆 작품 언급 순위
  //   - result.reels         = Stage 2 글로벌 top 10 → 🎬 Reel TOP 10
  //   - result.reels[0..2]   = Stage 3 deep 대상 → 🔍 Top 3 딥 댓글 분석
  const candidatePool = (result.candidatePool || []).slice()
  const topReels = result.reels.slice()  // 이미 score desc 정렬됨

  // 각 reel enrich (candidatePool 전체 — topReels는 그 부분집합이라 자동 enrich)
  for (const r of candidatePool) {
    const t = extractContentTitle(r)
    r.extractedTitle = t?.title
    r.reactionTypes = classifyReactionTypes(r)
    r.shortCaption = shortenCaption(r.caption, 120)
    r.keyPhrase = extractKeyPhrase(r.caption)
  }

  // ─── Top 3 — reactionSummary는 항상 채움 (deepComments 0개여도 fallback) ───
  for (let i = 0; i < Math.min(3, topReels.length); i++) {
    const reel = topReels[i]
    try {
      reel.reactionSummary = await buildReactionSummary(reel)
    } catch (e) {
      reel.reactionSummary = fallbackReactionSummary(reel)
    }
    reel.representativeComments = pickRepresentativeComments(reel)
  }

  // 헤더 표시용 댓글 카운트 — top 3 deep 합 + 나머지 발췌 합
  const totalComments =
    topReels.reduce((s, r) => s + ((r.deepComments?.length || 0) > 0
      ? (r.deepComments?.length || 0)
      : (r.comments?.length || 0)), 0)

  // 🏆 작품 언급 순위는 candidatePool 전체 기준 (사용자 요청)
  const rawContentGroups = buildContentGroups(candidatePool, 8)
  // 2026-05-12 뾰족화: 그룹에 mix · dominantReaction · engagementClass 보강
  const contentGroups = enrichGroupsWithSharpInsights(rawContentGroups, candidatePool)
  const topComments = buildTopComments(topReels, 8)
  const reactionPoints = aggregateReactionPoints(topReels)
  const repeatedPhrases = extractRepeatedPhrases(topReels)

  // 2026-05-12 뾰족화: 양극화 + 신흥 트렌드 (글로벌 분포는 작품 카드 mix와 중복돼 폐기)
  const polarizationSignals: InstagramPolarizationSignal[] = []
  for (let i = 0; i < Math.min(3, topReels.length); i++) {
    const sig = detectPolarization(topReels[i])
    if (sig) polarizationSignals.push(sig)
  }
  const emergingTrends = findEmergingTrends(candidatePool, topReels)

  const baseWarnings: string[] = []
  baseWarnings.push(`공개 인기 태그 · hashtag당 5개 · 후보 ${candidatePool.length}개 → top ${topReels.length} · 깊은 분석 ${topReels.filter(r => (r.deepCommentTotalFetched || 0) > 0).length}개`)
  for (const w of result.warnings) baseWarnings.push(w)
  if (result.lockedOut) {
    baseWarnings.push(`Instagram 30분 lockout 진행 중 (남은 ${Math.ceil(result.lockoutRemainingMs / 60000)}분)`)
  }

  return {
    fetchedAt: new Date().toISOString(),
    cached: false,
    expiresAt: '',
    totalReels: topReels.length,
    totalComments,
    searchedTags: result.searchedTags,
    topReels,
    candidatePool,
    contentGroups,
    topComments,
    warnings: baseWarnings,
    reactionPoints,
    repeatedPhrases,
    // 2026-05-12 뾰족화 필드
    polarizationSignals,
    emergingTrends,
  }
}
