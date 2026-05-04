// ============================================================
// Stage 3: 전체 트렌드 분석
// 3-1 콘텐츠 트렌드 (k-콘텐츠/배우/키워드)
// 3-2 감정 트렌드 (긍정/부정/중립 비율)
// 3-3 행동 트렌드 (추천/리뷰/질문/토론 분류)
// + 서브레딧별 특성
// ============================================================

import type {
  RedditPost,
  ContentTrend,
  SentimentTrend,
  SentimentTopic,
  BehaviorTrend,
  BehaviorType,
  SubredditInsight,
} from '../types/index.js'
import { buildKnownDramaPattern } from '../data/known-dramas.js'
import { KNOWN_ACTORS_STATIC } from '../data/known-dramas-static.js'

const POS_KW = ['love', 'amazing', 'great', 'excellent', 'best', 'favorite', 'worth', 'masterpiece', 'beautiful', 'perfect', 'incredible', 'fantastic', 'awesome', 'brilliant', 'enjoy', 'recommend']
const NEG_KW = ['hate', 'bad', 'boring', 'disappointing', 'worst', 'skip', 'drop', 'awful', 'terrible', 'cringe', 'overrated', 'flop', 'mid', 'frustrating', 'predictable']

const REC_KW = ['recommend', 'suggestion', 'similar to', 'looking for', 'what should', 'any good', 'where can i', 'any recommendations', 'something like']
const QUEST_KW = ['how do i', 'how to', 'anyone know', 'does anyone', 'is there', 'can someone', 'help me', 'why does', 'why is']
const REVIEW_KW = ['review', 'finished', 'just watched', 'rewatch', 'thoughts on', 'my opinion', 'rating']

// 작품명 추출용 — 한국어 따옴표만 (「」, 『』).
// 영어 큰따옴표(") · 싱글 쿼트(')는 인용 댓글·축약형(it's, I'm 등) 오탐이 너무 많아 제외.
// 사전 매칭(buildKnownDramaPattern + extraKnownDramaTitles)이 메인 신호 경로.
const TITLE_PAT = /[「『]([^「」『』]{2,40})[」』]/g

// 따옴표로 추출된 후보가 진짜 작품명일 가능성 검증.
// false면 카운트에서 제외 (인용 댓글·문장 조각 거르기).
function isPlausibleTitle(s: string): boolean {
  const t = s.trim()
  if (t.length < 2) return false
  // 마침표·물음표·느낌표·쉼표로 끝나면 인용 문장 — 거름
  if (/[.!?,…]$/.test(t)) return false
  // 첫 글자가 대문자(영어) · 한글/한자(\p{Lo}) · 숫자(\p{N}) 중 하나여야 함
  // (소문자 영문은 영어 축약형 잔재 — 's apart, m still 등 — 거름)
  const first = t[0]
  if (!/[\p{Lu}\p{Lo}\p{N}]/u.test(first)) return false
  // 흔한 영어 문장 시작 (대문자라도 거름) — He/She/It/We/They 등
  if (/^(He|She|It|We|They|You|That|This|There|Here|What|When|Where|Why|How|My|Your|His|Her|Our|Their|And|But|Or|So)\s/.test(t)) return false
  return true
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
  'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him',
  'them', 'us', 'so', 'if', 'because', 'as', 'until', 'while', 'of', 'at', 'by',
  'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'to',
  'from', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only',
  'own', 'same', 'than', 'too', 'very', 'just', 'don', 'now', 'one', 'really',
  'like', 'get', 'got', 'know', 'think', 'see', 'find', 'still', 'much', 'even',
  'lot', 'something', 'someone', 'anyone', 'guys', 'lol', 'tbh', 'imo', 'imho',
  'kdrama', 'kdramas', 'drama', 'dramas', 'show', 'shows', 'episode', 'season',
])

// 배우 사전: 정적 사전(known-dramas-static.ts)이 메인 — 80+명. 인라인 set은 fallback.
// substring 매칭은 word-boundary 오탐 위험 (예: 'iu' → 'studious' 매칭) → 통합 alternation regex로 word-boundary 적용.
const KNOWN_ACTORS = new Set<string>([
  ...KNOWN_ACTORS_STATIC,
])

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// word-boundary alternation regex (1회 빌드, 모듈 lifetime 캐시).
// 긴 이름 우선 매칭 (예: "lee min-ho"가 "lee" 단독보다 먼저).
const ACTORS_PAT: RegExp | null = (() => {
  const list = [...KNOWN_ACTORS].filter((a) => a.length >= 2).sort((a, b) => b.length - a.length)
  if (list.length === 0) return null
  return new RegExp(`\\b(${list.map(escRegex).join('|')})\\b`, 'gi')
})()

function getFullText(p: RedditPost): string {
  return [p.title, p.selftext || '', ...p.comments.map((c) => c.body)].join(' ')
}

function classifyBehavior(p: RedditPost): BehaviorType {
  const titleLower = p.title.toLowerCase()
  const fullLower = getFullText(p).toLowerCase()

  if (REC_KW.some((k) => titleLower.includes(k))) return 'recommendation'

  if (titleLower.endsWith('?') || QUEST_KW.some((k) => titleLower.includes(k))) {
    return 'question'
  }

  const hasTitleQuote = TITLE_PAT.test(p.title)
  TITLE_PAT.lastIndex = 0
  if (hasTitleQuote && REVIEW_KW.some((k) => fullLower.includes(k))) return 'review'

  if (REVIEW_KW.some((k) => titleLower.includes(k))) return 'review'

  return 'discussion'
}

function classifySentiment(p: RedditPost): 'positive' | 'negative' | 'neutral' {
  const text = getFullText(p).toLowerCase()
  const pos = POS_KW.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0)
  const neg = NEG_KW.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0)
  if (pos === 0 && neg === 0) return 'neutral'
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

// 3-1 콘텐츠 트렌드
export function analyzeContentTrend(posts: RedditPost[], extraKnownTitles: string[] = []): ContentTrend {
  const titles = new Map<string, number>()
  const actors = new Map<string, number>()
  const keywords = new Map<string, number>()
  const knownPattern = buildKnownDramaPattern(extraKnownTitles)

  // 동일 작품을 정규형으로 통일하기 위한 lowercase → canonical 매핑
  const canonicalMap = new Map<string, string>()

  for (const p of posts) {
    // title + selftext + 댓글 본문 합산 (다른 인사이트와 데이터 풀 일치)
    // per-post dedup이 적용되어 같은 작품 폭증 방지
    const text = `${p.title} ${p.selftext || ''} ${p.comments.map((c) => c.body).join(' ')}`
    const seenInPost = new Set<string>()  // 포스트 단위 dedup (양쪽 매칭이 같은 작품 잡으면 1회만)

    // ① 따옴표 안 제목 (한국어 따옴표만, sanity check 적용)
    for (const m of text.matchAll(TITLE_PAT)) {
      const t = m[1].trim()
      if (!isPlausibleTitle(t)) continue
      const key = t.toLowerCase()
      if (seenInPost.has(key)) continue
      seenInPost.add(key)
      const canonical = canonicalMap.get(key) || t
      canonicalMap.set(key, canonical)
      titles.set(canonical, (titles.get(canonical) ?? 0) + 1)
    }

    // ② 알려진 K-드라마 사전 매칭 (따옴표 없는 자연 문장 내 언급도 캐치)
    if (knownPattern) {
      for (const m of text.matchAll(knownPattern)) {
        const matched = m[1]
        const key = matched.toLowerCase()
        if (seenInPost.has(key)) continue
        seenInPost.add(key)
        const canonical = canonicalMap.get(key) || matched
        canonicalMap.set(key, canonical)
        titles.set(canonical, (titles.get(canonical) ?? 0) + 1)
      }
    }

    // 배우 — word-boundary alternation regex 매칭 (substring 오탐 차단).
    // 1포스트 1배우 1카운트 (seenActorInPost로 dedup).
    const lower = text.toLowerCase()
    if (ACTORS_PAT) {
      const seenActorInPost = new Set<string>()
      for (const m of lower.matchAll(ACTORS_PAT)) {
        const matched = m[1].toLowerCase()
        if (seenActorInPost.has(matched)) continue
        seenActorInPost.add(matched)
        const display = matched.replace(/\b\w/g, (c) => c.toUpperCase())
        actors.set(display, (actors.get(display) ?? 0) + 1)
      }
    }

    // 키워드 (stopword 제외)
    const tokens = lower
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    for (const t of tokens) keywords.set(t, (keywords.get(t) ?? 0) + 1)
  }

  return {
    topContents: [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count })),
    topActors: [...actors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    topKeywords: [...keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([keyword, count]) => ({ keyword, count })),
  }
}

// ============================================================
// 토픽 분류 — 감정별 주요 논의 주제 추출용
// 키워드는 영문 (Reddit 영어), 라벨은 한국어
// ============================================================
export interface TopicDef { key: string; label: string; keywords: string[] }

export const TOPICS: TopicDef[] = [
  { key: 'character_emotion', label: '캐릭터 감정선', keywords: ['character', 'characters', 'emotion', 'emotional', 'emotions', 'cried', 'crying', 'tears', 'heartbreak', 'heartbreaking', 'feels', 'feeling', 'feelings', 'relate', 'relatable', 'touched', 'moving'] },
  { key: 'acting', label: '배우 연기력', keywords: ['acting', 'performance', 'performances', 'portrayal', 'chemistry', 'actor', 'actress', 'actors', 'actresses', 'played', 'plays', 'casting', 'delivery'] },
  { key: 'plot_twist', label: '스토리/반전', keywords: ['plot', 'storyline', 'narrative', 'twist', 'twists', 'climax', 'reveal'] },
  { key: 'pacing', label: '전개 속도', keywords: ['pacing', 'dragging', 'rushed', 'filler', 'fillers'] },
  { key: 'plausibility', label: '개연성', keywords: ['plot hole', 'plot holes', 'unrealistic', 'contrived', 'illogical', 'inconsistent', 'makes no sense'] },
  { key: 'romance', label: '로맨스/관계', keywords: ['romance', 'romantic', 'couple', 'love line', 'love story', 'relationship', 'shipping'] },
  { key: 'directing_visual', label: '연출/영상미', keywords: ['directing', 'direction', 'cinematography', 'visuals', 'aesthetic', 'aesthetics'] },
  { key: 'ost_music', label: 'OST/음악', keywords: ['ost', 'soundtrack', 'soundtracks', 'theme song'] },
  { key: 'ending', label: '결말', keywords: ['ending', 'endings', 'finale', 'finales', 'last episode'] },
  { key: 'episode_length', label: '에피소드 구성', keywords: ['12 episode', '16 episode', 'too many episodes', 'too short', 'episode count'] },
  { key: 'humor_comedy', label: '코미디/유머', keywords: ['funny', 'comedy', 'comedies', 'humor', 'humour', 'hilarious', 'laughed'] },
  { key: 'recommendation', label: '추천/탐색', keywords: ['recommend', 'recommended', 'recommendation', 'recommendations', 'similar to', 'reminds me of', 'if you like'] },
  { key: 'culture_language', label: '문화/언어', keywords: ['korean culture', 'learning korean', 'tradition', 'traditions', 'k-culture'] },
  { key: 'production', label: '제작 품질', keywords: ['production value', 'set design', 'costume', 'costumes', 'wardrobe'] },
]

const SENT_KW = {
  positive: ['love', 'amazing', 'great', 'excellent', 'best', 'favorite', 'worth', 'masterpiece', 'beautiful', 'perfect', 'incredible', 'fantastic', 'awesome', 'brilliant', 'enjoy', 'recommend'],
  negative: ['hate', 'bad', 'boring', 'disappointing', 'worst', 'skip', 'drop', 'awful', 'terrible', 'cringe', 'overrated', 'flop', 'mid', 'frustrating', 'predictable'],
}

interface QuoteCandidate { text: string; score: number }

// 키워드를 워드 바운더리 정규식으로 컴파일 (substring 오매칭 방지)
// "ost"가 "most/post/almost"에 매칭되는 문제 해결
function buildKeywordRegex(keywords: string[]): RegExp {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

const TOPIC_REGEX_CACHE = new Map<string, RegExp>()
export function topicRegex(topic: TopicDef): RegExp {
  let re = TOPIC_REGEX_CACHE.get(topic.key)
  if (!re) {
    re = buildKeywordRegex(topic.keywords)
    TOPIC_REGEX_CACHE.set(topic.key, re)
  }
  return re
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|[\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 220)
}

function pickQuoteForTopic(
  p: RedditPost,
  topic: typeof TOPICS[number],
  sentiment: 'positive' | 'negative' | 'neutral'
): string | null {
  const sources: { text: string; weight: number }[] = []
  if (p.title) sources.push({ text: p.title, weight: 1.2 })
  if (p.selftext) sources.push({ text: p.selftext, weight: 1.0 })
  for (const c of p.comments) sources.push({ text: c.body, weight: 1.0 + Math.min(2, Math.log10(Math.max(1, c.score))) })

  const sentKW = sentiment === 'neutral' ? [] : SENT_KW[sentiment]
  const candidates: QuoteCandidate[] = []

  const re = topicRegex(topic)
  for (const src of sources) {
    for (const sent of splitSentences(src.text)) {
      if (!re.test(sent)) continue
      const lower = sent.toLowerCase()
      const sentMatches = sentKW.filter((k) => lower.includes(k)).length
      candidates.push({ text: sent, score: src.weight + sentMatches * 1.5 })
    }
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  const best = candidates[0].text
  return best.length > 180 ? best.slice(0, 177) + '...' : best
}

function findMatchedTopics(p: RedditPost): typeof TOPICS[number][] {
  const haystack = [p.title, p.selftext || '', ...p.comments.map((c) => c.body)].join(' ')
  return TOPICS.filter((t) => topicRegex(t).test(haystack))
}

// 3-2 감정 트렌드
export function analyzeSentimentTrend(posts: RedditPost[]): SentimentTrend {
  let positive = 0, negative = 0, neutral = 0

  type TopicAcc = Map<string, { count: number; quotes: { text: string; score: number }[]; label: string }>
  const buckets: Record<'positive' | 'negative' | 'neutral', TopicAcc> = {
    positive: new Map(), negative: new Map(), neutral: new Map(),
  }

  for (const p of posts) {
    const s = classifySentiment(p)
    if (s === 'positive') positive++
    else if (s === 'negative') negative++
    else neutral++

    const matched = findMatchedTopics(p)
    for (const t of matched) {
      const bucket = buckets[s]
      const acc = bucket.get(t.key) ?? { count: 0, quotes: [], label: t.label }
      acc.count++
      const quote = pickQuoteForTopic(p, t, s)
      if (quote) acc.quotes.push({ text: quote, score: (p.score || 0) + (p.commentCount || 0) })
      bucket.set(t.key, acc)
    }
  }

  const buildTop3 = (sent: 'positive' | 'negative' | 'neutral'): SentimentTopic[] => {
    const arr = [...buckets[sent].entries()]
    arr.sort((a, b) => b[1].count - a[1].count)
    return arr.slice(0, 3).map(([key, v]) => {
      const bestQuote = v.quotes.sort((a, b) => b.score - a.score)[0]?.text ?? ''
      return { topic: v.label, topicKey: key, count: v.count, representative: bestQuote }
    })
  }

  const total = posts.length || 1
  return {
    positive,
    negative,
    neutral,
    total: posts.length,
    positiveRatio: positive / total,
    negativeRatio: negative / total,
    neutralRatio: neutral / total,
    byTopics: {
      positive: buildTop3('positive'),
      negative: buildTop3('negative'),
      neutral: buildTop3('neutral'),
    },
  }
}

// 3-3 행동 트렌드
export function analyzeBehaviorTrend(posts: RedditPost[]): BehaviorTrend {
  const counts = { recommendation: 0, review: 0, question: 0, discussion: 0 }
  for (const p of posts) counts[classifyBehavior(p)]++
  const total = posts.length || 1
  return {
    ...counts,
    total: posts.length,
    ratios: {
      recommendation: counts.recommendation / total,
      review: counts.review / total,
      question: counts.question / total,
      discussion: counts.discussion / total,
    },
  }
}

// 서브레딧 성격 매핑
const SUBREDDIT_CHARACTER: Record<string, string> = {
  kdramas: '감정/리뷰 중심',
  kdrama: '리뷰/토론 중심',
  kdramarecommends: '추천 패턴',
  korean: '문화/확장',
  koreatravel: '여행/체험',
}

export function analyzeBySubreddit(posts: RedditPost[]): SubredditInsight[] {
  const grouped = new Map<string, RedditPost[]>()
  for (const p of posts) {
    const arr = grouped.get(p.subreddit) ?? []
    arr.push(p)
    grouped.set(p.subreddit, arr)
  }

  const result: SubredditInsight[] = []
  for (const [sub, list] of grouped) {
    const beh = analyzeBehaviorTrend(list)
    const sent = analyzeSentimentTrend(list)
    const topBeh = (Object.entries(beh.ratios) as [BehaviorType, number][])
      .sort((a, b) => b[1] - a[1])[0][0]

    result.push({
      subreddit: sub,
      postCount: list.length,
      characteristic: SUBREDDIT_CHARACTER[sub] ?? '일반',
      topBehavior: topBeh,
      sentiment: { positive: sent.positive, negative: sent.negative, neutral: sent.neutral },
    })
  }

  return result.sort((a, b) => b.postCount - a.postCount)
}

// 포스트별 분류 결과 (Stage 5에서 재사용)
export { classifyBehavior, classifySentiment }
