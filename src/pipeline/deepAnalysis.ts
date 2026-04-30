// ============================================================
// Stage 5: 딥 분석 (TOP5 인기 포스트 대상)
// 5-1 감정 분석 (자연어 요약)
// 5-2 의견 유형 분석
// 5-3 핵심 반응 추출 (대표 댓글 3개)
// 5-4 인기 사유 자연어 설명
// 5-5 댓글 쟁점 클러스터링 (DebateTopic) — 키워드 카테고리가 아닌 구체적 쟁점
// ============================================================

import type {
  RedditPost,
  RedditComment,
  DeepAnalysis,
  OpinionType,
  DebateTopic,
  DebateOpinionDirection,
  DebateRepresentative,
} from '../types/index.js'

const POS_KW = ['love', 'amazing', 'great', 'excellent', 'best', 'favorite', 'worth', 'masterpiece', 'beautiful', 'perfect', 'incredible', 'fantastic', 'awesome', 'brilliant', 'enjoy']
const NEG_KW = ['hate', 'bad', 'boring', 'disappointing', 'worst', 'skip', 'drop', 'awful', 'terrible', 'cringe', 'overrated', 'flop', 'mid', 'frustrating']
const PRAISE_KW = [...POS_KW, 'genius', 'iconic', 'underrated', 'goat', 'chef\'s kiss', 'praise', 'crying']
const CRIT_KW = [...NEG_KW, 'plot hole', 'rushed', 'predictable', 'weak', 'forced', 'unrealistic']
const QUEST_PAT = /\?$|\bhow\b|\bwhy\b|\bwho\b|\bwhat\b|\bwhere\b|\bwhen\b|\bdoes\b|\bdo you\b|\banyone\b/i
const REC_PAT = /\b(recommend|try|watch|check out|similar to|reminds me of|if you like)\b/i

function commentSentiment(body: string): 'positive' | 'negative' | 'neutral' {
  const lower = body.toLowerCase()
  const p = POS_KW.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
  const n = NEG_KW.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
  if (p === 0 && n === 0) return 'neutral'
  if (p > n) return 'positive'
  if (n > p) return 'negative'
  return 'neutral'
}

function classifyComment(body: string): OpinionType {
  const lower = body.toLowerCase()
  if (REC_PAT.test(lower)) return 'recommendation'
  if (QUEST_PAT.test(lower)) return 'question'
  const praise = PRAISE_KW.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
  const crit = CRIT_KW.reduce((s, k) => s + (lower.includes(k) ? 1 : 0), 0)
  if (praise > crit) return 'praise'
  if (crit > praise) return 'criticism'
  return 'praise'
}

function summarize(p: RedditPost): string {
  const body = (p.selftext || '').trim()
  if (body.length === 0) return p.title
  const first = body.split(/[.!?\n]/).map((s) => s.trim()).find((s) => s.length >= 20)
  if (first && first.length <= 200) return first
  return body.slice(0, 200) + (body.length > 200 ? '...' : '')
}

// ============================================================
// 댓글 쟁점 템플릿 — 구체적 논쟁 형태로 정의
// ============================================================
interface IssueTemplate {
  key: string
  label: string                  // 구체적 쟁점 라벨
  description: string            // 한 줄 요약
  context: string                // 사람들이 왜 이 주제를 이야기하는지 (맥락)
  triggers: RegExp[]             // 매칭 패턴 (any one)
  needsContrast?: boolean        // 의견 갈림이 본질인 토픽
}

const ISSUE_TEMPLATES: IssueTemplate[] = [
  {
    key: 'character_consistency',
    label: '캐릭터 행동의 개연성 논쟁',
    description: '특정 장면에서 캐릭터의 선택이 자연스러운지에 대한 논의',
    context: '캐릭터 설정의 일관성은 시청 몰입도를 좌우하는 핵심 요소',
    triggers: [
      /\b(out of character|ooc)\b/i,
      /\b(character|mc|protagonist)\b[\s\S]{0,40}\b(decision|choice|action|behavior|behaviour|change|changed)\b/i,
      /\b(forced|contrived|illogical|inconsistent)\b/i,
      /\bmakes? no sense\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'pacing_debate',
    label: '전개 속도 논쟁',
    description: '드라마의 진행 속도가 적절한지에 대한 의견 충돌',
    context: 'OTT 시대 시청자는 빠른 전개를 선호하지만 빌드업의 깊이도 중시',
    triggers: [
      /\b(pacing|pace|too slow|too fast|dragging|drag(?:s|ged)?|rushed)\b/i,
      /\bfillers?\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'ending_satisfaction',
    label: '결말 만족도 논쟁',
    description: '드라마의 결말이 기대를 충족했는지에 대한 토론',
    context: '결말은 전체 작품 평가에 가장 큰 영향을 미치는 요소',
    triggers: [
      /\b(ending|endings|finale|finales|last episode|conclusion)\b/i,
      /\bwrapped? up\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'episode_count_debate',
    label: '에피소드 수 적정성 논쟁 (12 vs 16부작)',
    description: '시리즈 길이가 콘텐츠 밀도와 어울리는지에 대한 의견 차이',
    context: '광고/제작 모델로 16부작이 표준이지만 12부작 트렌드 확산 중',
    triggers: [
      /\b(12[- ]?episode|12[- ]?ep|16[- ]?episode|16[- ]?ep|episode count|too many episodes|too few episodes|too short)\b/i,
      /\bepisodes? long\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'chemistry_eval',
    label: '주연 케미·관계 묘사 평가',
    description: '주연 배우의 호흡과 관계 묘사가 설득력 있는지 평가',
    context: '로맨스 K드라마의 핵심 흥행 요소이자 호불호가 가장 갈리는 지점',
    triggers: [
      /\b(chemistry|chemistries)\b/i,
      /\b(main couple|otp|leads)\b[\s\S]{0,40}\b(love|hate|chemistry|forced)\b/i,
    ],
  },
  {
    key: 'acting_eval',
    label: '주연 연기력 호평/혹평',
    description: '주연 배우의 연기력에 대한 시청자 평가',
    context: '배우의 캐릭터 해석력은 작품 몰입의 핵심',
    triggers: [
      /\b(acting|performance|portrayal|delivery)\b/i,
      /\b(carried|carrying)\s+the\s+show\b/i,
    ],
  },
  {
    key: 'plot_logic',
    label: '스토리 개연성 논쟁',
    description: '플롯의 흐름과 설정이 합리적인지에 대한 논의',
    context: '잘 짜인 플롯은 시청자가 끝까지 따라오게 만드는 핵심',
    triggers: [
      /\bplot holes?\b/i,
      /\b(unrealistic|illogical|inconsistent|contrived)\b/i,
      /\b(plot|story|storyline|narrative)\b[\s\S]{0,40}\b(weak|strong|hole|sense|tight|loose)\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'romance_balance',
    label: '로맨스 비중·전개 논쟁',
    description: '로맨스 라인이 작품 톤과 균형 있게 짜였는지에 대한 의견',
    context: 'K드라마는 장르 불문 로맨스 비중이 크지만 호불호가 명확',
    triggers: [
      /\b(romance|romantic|love line|love story)\b/i,
      /\b(unnecessary|forced|cheesy|cringey?)\s+romance\b/i,
    ],
    needsContrast: true,
  },
  {
    key: 'recommendation_request',
    label: '비슷한 작품 추천 요청 및 응답',
    description: '비슷한 분위기·장르의 다른 작품을 묻는 요청과 답변',
    context: '한 작품 시청 후 비슷한 만족감을 추구하는 자연스러운 흐름',
    triggers: [
      /\b(recommend|recommendation|similar to|reminds me of|if you like|something like)\b/i,
    ],
  },
  {
    key: 'production_quality',
    label: '제작·연출 품질 평가',
    description: '연출/촬영/세트/의상 등 제작 품질에 대한 호평·혹평',
    context: '글로벌 OTT 경쟁으로 제작 품질이 차별화 포인트로 부상',
    triggers: [
      /\b(directing|direction|cinematography|production value|set design|costume|wardrobe|visuals|aesthetics?)\b/i,
    ],
  },
  {
    key: 'soundtrack_eval',
    label: 'OST·삽입곡 평가',
    description: 'OST·삽입곡이 작품 분위기를 살리는지에 대한 평가',
    context: 'OST는 K드라마 글로벌 팬덤 형성의 주요 동력',
    triggers: [
      /\b(ost|soundtrack|theme song)\b/i,
    ],
  },
  {
    key: 'culture_curiosity',
    label: '한국 문화·언어 관련 호기심',
    description: '드라마 속 한국 문화·언어 요소에 대한 학습 욕구와 질문',
    context: 'K콘텐츠를 통한 한국 문화 학습은 글로벌 팬덤의 본질적 특징',
    triggers: [
      /\b(korean culture|learning korean|hangul|tradition|traditions|cuisine)\b/i,
    ],
  },
]

const ISSUE_REGEX_CACHE = new Map<string, RegExp>()
function combinedRegex(template: IssueTemplate): RegExp {
  let re = ISSUE_REGEX_CACHE.get(template.key)
  if (!re) {
    const sources = template.triggers.map((r) => r.source).join('|')
    re = new RegExp(`(?:${sources})`, 'i')
    ISSUE_REGEX_CACHE.set(template.key, re)
  }
  return re
}

// ── 의견 분포 라벨 ──────────────────────────────────────────
function labelDistribution(pos: number, neg: number, neu: number): { dir: DebateOpinionDirection; label: string } {
  const total = pos + neg + neu
  if (total === 0) return { dir: 'discussion', label: '의견 추출 불가' }
  if (pos === 0 && neg === 0) return { dir: 'discussion', label: '정보 공유·질문 위주' }
  const sentTotal = pos + neg
  if (sentTotal === 0) return { dir: 'discussion', label: '정보 공유·질문 위주' }
  const posR = pos / sentTotal
  const negR = neg / sentTotal
  if (Math.abs(posR - negR) <= 0.2 && pos >= 1 && neg >= 1) {
    return { dir: 'mixed', label: `긍정 vs 부정 혼재 (${Math.round(posR*100)}% / ${Math.round(negR*100)}%)` }
  }
  if (posR >= 0.7) return { dir: 'positive', label: `주로 긍정 (${Math.round(posR*100)}%)` }
  if (negR >= 0.6) return { dir: 'negative', label: `주로 부정 (${Math.round(negR*100)}%)` }
  if (posR > negR) return { dir: 'positive', label: `약간 긍정 우세 (${Math.round(posR*100)}% / ${Math.round(negR*100)}%)` }
  return { dir: 'negative', label: `약간 부정 우세 (${Math.round(negR*100)}% / ${Math.round(posR*100)}%)` }
}

function buildInterpretation(template: IssueTemplate, dir: DebateOpinionDirection): string {
  const t = template.label.replace(/ 논쟁$|에 대한.*/, '').replace(/\s*\(.*\)$/, '')
  switch (dir) {
    case 'mixed':
      return `${t}에 대해 팬들의 의견이 명확히 갈리고 있어, ${template.context.split(/[—,·]/)[0].trim()}로서 토론이 이어지는 양상.`
    case 'positive':
      return `다수의 팬이 ${t}에 만족·호응하는 분위기로 형성됨.`
    case 'negative':
      return `${t}에 대한 우려·실망의 목소리가 다수를 차지함.`
    case 'discussion':
      return `${t}에 대해 정보 공유와 질문이 활발하며 평가는 아직 형성 중.`
  }
}

// ── 대표 댓글 선정: mixed면 contrast 우선, 아니면 score 순 ──
function pickRepresentatives(
  matched: { c: RedditComment; sent: 'positive' | 'negative' | 'neutral' }[],
  dir: DebateOpinionDirection,
): DebateRepresentative[] {
  const trim = (body: string) => {
    const cleaned = body.replace(/\s+/g, ' ').trim()
    return cleaned.length > 200 ? cleaned.slice(0, 197) + '...' : cleaned
  }
  const toRepr = (m: { c: RedditComment; sent: 'positive' | 'negative' | 'neutral' }): DebateRepresentative => ({
    body: trim(m.c.body), score: m.c.score, sentiment: m.sent,
  })

  const sorted = [...matched].sort((a, b) => b.c.score - a.c.score)

  if (dir === 'mixed') {
    const pos = sorted.find((m) => m.sent === 'positive')
    const neg = sorted.find((m) => m.sent === 'negative')
    const others = sorted.filter((m) => m !== pos && m !== neg).slice(0, 1)
    return [pos, neg, ...others].filter(Boolean).slice(0, 3).map((m) => toRepr(m!))
  }
  return sorted.slice(0, 3).map(toRepr)
}

// ── 동적 n-gram 기반 쟁점 추출 (템플릿 미매칭 fallback) ────
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can',
  'may', 'might', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'i', 'you', 'he', 'she', 'we', 'my', 'your', 'his', 'her', 'our', 'me', 'him',
  'so', 'if', 'because', 'as', 'of', 'at', 'by', 'for', 'with', 'about', 'to', 'from', 'in',
  'out', 'on', 'off', 'up', 'down', 'over', 'under', 'then', 'here', 'there',
  'when', 'where', 'why', 'how', 'what', 'who', 'all', 'any', 'each', 'few', 'more',
  'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just',
  'don', 'now', 'one', 'really', 'like', 'get', 'got', 'know', 'think', 'see', 'find',
  'still', 'much', 'even', 'lot', 'something', 'someone', 'anyone', 'also', 'lol',
  'tbh', 'imo', 'imho', 'kdrama', 'kdramas', 'drama', 'dramas', 'show', 'shows',
  'episode', 'episodes', 'season', 'seasons', 'guys', 'thing', 'things', 'going',
  'said', 'say', 'says', 'going', 'want', 'wants', 'wanted', 'tried', 'trying',
])

function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

// URL 파편/표기 노이즈 제거
const URL_NOISE = new Set(['http', 'https', 'www', 'redd', 'reddit', 'com', 'org', 'net', 'amp', 'youtube', 'youtu', 'png', 'jpg', 'jpeg', 'gif'])

function isMeaningfulToken(w: string): boolean {
  if (w.length < 4) return false
  if (URL_NOISE.has(w)) return false
  if (/^\d+$/.test(w)) return false
  return true
}

function normalizeToken(w: string): string {
  // 단복수 정규화 (간단): 'channels' → 'channel', 'actresses' → 'actress'
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

interface PhraseEntry { phrase: string; isBigram: boolean }

function extractPhrases(text: string): Map<string, PhraseEntry> {
  const tokens = tokenizeWords(text)
  const phrases = new Map<string, PhraseEntry>()
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    const isStop = STOP_WORDS.has(w)
    // bigram: 두 단어 모두 non-stop, 둘 다 의미 있는 토큰
    if (i + 1 < tokens.length) {
      const w2 = tokens[i + 1]
      if (!isStop && !STOP_WORDS.has(w2) && isMeaningfulToken(w) && isMeaningfulToken(w2)) {
        const p = `${w} ${w2}`
        phrases.set(p, { phrase: p, isBigram: true })
      }
    }
    // 단어: 5자 이상 + non-stop + 의미 토큰
    if (!isStop && w.length >= 5 && isMeaningfulToken(w)) {
      phrases.set(w, { phrase: w, isBigram: false })
    }
  }
  return phrases
}

function dynamicTopicLabel(phrase: string, dir: DebateOpinionDirection): string {
  const cap = phrase.replace(/\b\w/g, (c) => c.toUpperCase())
  switch (dir) {
    case 'mixed': return `'${cap}' 관련 의견 분분`
    case 'positive': return `'${cap}' 호평`
    case 'negative': return `'${cap}' 우려`
    case 'discussion': return `'${cap}' 화제`
  }
}

function dynamicInterpretation(phrase: string, dir: DebateOpinionDirection): string {
  switch (dir) {
    case 'mixed': return `'${phrase}'에 대한 의견이 양분되어 다양한 관점이 동시에 표출되고 있음.`
    case 'positive': return `'${phrase}'에 대해 다수가 호의적 반응을 보임.`
    case 'negative': return `'${phrase}'에 대한 우려·실망의 목소리가 다수.`
    case 'discussion': return `'${phrase}'에 대한 정보·질문이 활발하며 평가는 아직 형성 중.`
  }
}

function dynamicDebatesFromComments(
  comments: RedditComment[],
  existing: DebateTopic[],
  fillTo: number
): DebateTopic[] {
  if (comments.length < 2) return []

  // 각 댓글의 phrase map + sentiment
  const commentData = comments.map((c) => ({
    c,
    sent: commentSentiment(c.body || ''),
    phrases: extractPhrases(c.body || ''),
  }))

  // phrase별 cross-comment frequency + bigram 여부
  const freq = new Map<string, { count: number; isBigram: boolean }>()
  for (const { phrases } of commentData) {
    for (const [p, info] of phrases) {
      const ex = freq.get(p) ?? { count: 0, isBigram: info.isBigram }
      ex.count++
      freq.set(p, ex)
    }
  }

  // 후보: 2개 이상 등장. bigram 우선 정렬 (가중치 +0.5).
  const candidates = [...freq.entries()]
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => {
      const sa = a[1].count + (a[1].isBigram ? 0.5 : 0)
      const sb = b[1].count + (b[1].isBigram ? 0.5 : 0)
      return sb - sa
    })

  // 기존 토픽이 사용한 정규화 토큰 (동적은 우회)
  const blockedTokens = new Set<string>()
  for (const e of existing) {
    for (const w of tokenizeWords(e.topic)) blockedTokens.add(normalizeToken(w))
  }

  const out: DebateTopic[] = []
  const usedTokens = new Set<string>()

  const slotsLeft = () => fillTo - existing.length - out.length

  for (const [phrase, info] of candidates) {
    if (slotsLeft() <= 0) break

    const tokens = phrase.split(' ')
    const normTokens = tokens.map(normalizeToken)
    // 이미 선택된 phrase의 정규화 토큰과 겹치면 스킵 (단·복수 dedup)
    if (normTokens.some((t) => usedTokens.has(t))) continue
    if (normTokens.every((t) => blockedTokens.has(t))) continue

    const matched = commentData.filter((cd) => cd.phrases.has(phrase))
    if (matched.length < 2) continue

    let pos = 0, neg = 0, neu = 0
    for (const m of matched) {
      if (m.sent === 'positive') pos++
      else if (m.sent === 'negative') neg++
      else neu++
    }
    const { dir, label } = labelDistribution(pos, neg, neu)

    out.push({
      topic: dynamicTopicLabel(phrase, dir),
      description: `댓글에서 '${phrase}'가 반복적으로 언급되며 형성된 토론 주제`,
      context: '이 게시글에서 자생적으로 떠오른 커뮤니티 화제',
      opinionDirection: dir,
      opinionDistribution: { positive: pos, negative: neg, neutral: neu, mixedLabel: label },
      representatives: pickRepresentatives(matched, dir),
      interpretation: dynamicInterpretation(phrase, dir),
      count: info.count,
    })

    for (const t of normTokens) usedTokens.add(t)
  }

  return out
}

// ── 메인: 댓글 쟁점 추출 (템플릿 + 동적 hybrid) ────────────
function analyzeCommentDebates(comments: RedditComment[]): DebateTopic[] {
  if (comments.length === 0) return []

  const templateBased: DebateTopic[] = []

  for (const tmpl of ISSUE_TEMPLATES) {
    const re = combinedRegex(tmpl)
    const matched: { c: RedditComment; sent: 'positive' | 'negative' | 'neutral' }[] = []

    for (const c of comments) {
      if (!c.body || !re.test(c.body)) continue
      matched.push({ c, sent: commentSentiment(c.body) })
    }
    if (matched.length === 0) continue

    let pos = 0, neg = 0, neu = 0
    for (const m of matched) {
      if (m.sent === 'positive') pos++
      else if (m.sent === 'negative') neg++
      else neu++
    }
    const { dir, label } = labelDistribution(pos, neg, neu)

    if (tmpl.needsContrast && matched.length < 2 && dir !== 'mixed') continue

    templateBased.push({
      topic: tmpl.label,
      description: tmpl.description,
      opinionDirection: dir,
      opinionDistribution: { positive: pos, negative: neg, neutral: neu, mixedLabel: label },
      context: tmpl.context,
      representatives: pickRepresentatives(matched, dir),
      interpretation: buildInterpretation(tmpl, dir),
      count: matched.length,
    })
  }
  templateBased.sort((a, b) => b.count - a.count)
  const topTemplates = templateBased.slice(0, 3)

  // 부족분은 동적 n-gram 클러스터링으로 채움
  const dynamic = dynamicDebatesFromComments(comments, topTemplates, 3)

  return [...topTemplates, ...dynamic].slice(0, 3)
}

// ── 자연어 감정 요약 ──────────────────────────────────────────
function buildSentimentSummary(pos: number, neg: number, total: number): string {
  if (total === 0) return '감정 표현이 거의 없는 정보 공유·질문 위주 포스트입니다.'
  const posR = pos / total, negR = neg / total
  if (posR >= 0.7) return `댓글의 ${Math.round(posR * 100)}%가 긍정적이며, 팬들의 강한 호응이 두드러집니다.`
  if (negR >= 0.6) return `댓글의 ${Math.round(negR * 100)}%가 비판적이며, 부정적 반응이 압도적입니다.`
  if (Math.abs(posR - negR) <= 0.15) return `긍정 ${Math.round(posR * 100)}% · 부정 ${Math.round(negR * 100)}%로 의견이 양분되어 활발한 논쟁이 이뤄지고 있습니다.`
  if (posR > negR) return `긍정(${Math.round(posR * 100)}%)이 부정(${Math.round(negR * 100)}%)을 앞서며, 전반적으로 호의적인 분위기입니다.`
  return `부정(${Math.round(negR * 100)}%)이 긍정(${Math.round(posR * 100)}%)보다 우세하며, 우려와 비판이 다수입니다.`
}

// ── 자연어 인기 사유 ──────────────────────────────────────────
function buildPopularityReason(args: {
  post: RedditPost
  posRatio: number
  negRatio: number
  totalSent: number
  opinionTypes: Record<OpinionType, number>
  debates: DebateTopic[]
}): string {
  const { post, posRatio, negRatio, totalSent, opinionTypes, debates } = args
  const parts: string[] = []

  const ageH = (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000
  if (ageH < 24) parts.push('최근 24시간 내에 게시되어 시의성이 높고')
  else if (ageH < 72) parts.push('최근 3일 내에 작성되어 신선한 화제이고')

  if (post.commentCount >= 100) parts.push(`${post.commentCount}개의 댓글이 달리며 폭발적인 토론을 유발했고`)
  else if (post.commentCount >= 30) parts.push(`${post.commentCount}개의 댓글로 활발한 토론을 이끌고`)
  else if (post.commentCount > 0) parts.push(`${post.commentCount}개의 의미 있는 응답이 달리고`)

  if (totalSent > 0) {
    if (posRatio >= 0.7) parts.push('댓글의 다수가 긍정적 반응을 보내며')
    else if (negRatio >= 0.6) parts.push('비판·우려의 목소리가 다수를 차지하며')
    else if (Math.abs(posRatio - negRatio) <= 0.15) parts.push('찬반이 갈리는 논쟁성을 띠며')
    else if (posRatio > negRatio) parts.push('호의적 의견이 우세한 가운데')
  }

  const dominantOp = (Object.entries(opinionTypes) as [OpinionType, number][])
    .sort((a, b) => b[1] - a[1])[0]
  if (dominantOp && dominantOp[1] > 0) {
    const opLabel: Record<OpinionType, string> = {
      praise: '칭찬형 댓글이 주를 이루고',
      criticism: '비판적 분석이 다수이며',
      question: '추가 정보를 묻는 질문이 활발히 오가고',
      recommendation: '관련 작품을 추천하는 응답이 이어지고',
    }
    parts.push(opLabel[dominantOp[0]])
  }

  let topicTail = ''
  if (debates.length >= 2) {
    const topNames = debates.slice(0, 2).map((d) => `'${d.topic}'`).join('과 ')
    topicTail = `특히 ${topNames}이 주요 쟁점으로 떠올랐습니다`
  } else if (debates.length === 1) {
    topicTail = `특히 '${debates[0].topic}'이 핵심 쟁점으로 자리잡았습니다`
  }

  const flair = post.flair && !/^r\//i.test(post.flair) && post.flair.toLowerCase() !== post.subreddit.toLowerCase()
    ? post.flair : null
  if (flair) parts.push(`'${flair}' 카테고리에 분류된 점도 노출에 기여했습니다`)

  if (parts.length === 0 && !topicTail) return '일반적인 토론 포스트로 평이한 반응을 받았습니다.'

  let text = parts.join(', ')
  if (text && topicTail) text += `. ${topicTail}`
  else if (topicTail) text = topicTail
  if (text) text = text.charAt(0).toUpperCase() + text.slice(1)
  if (!/[.!?]$/.test(text)) text += '.'
  return text
}

export function deepAnalyzePosts(posts: RedditPost[]): DeepAnalysis[] {
  return posts.map<DeepAnalysis>((p) => {
    const comments = p.comments ?? []
    const opinionTypes: Record<OpinionType, number> = {
      praise: 0, criticism: 0, question: 0, recommendation: 0,
    }
    let pos = 0, neg = 0
    for (const c of comments) {
      const type = classifyComment(c.body)
      opinionTypes[type]++
      const s = commentSentiment(c.body)
      if (s === 'positive') pos++
      else if (s === 'negative') neg++
    }
    const totalSent = pos + neg
    const sentDenom = totalSent || 1
    const posRatio = pos / sentDenom
    const negRatio = neg / sentDenom

    const topComments: RedditComment[] = [...comments]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const commentDebates = analyzeCommentDebates(comments)
    const sentimentSummary = buildSentimentSummary(pos, neg, totalSent)
    const popularityReason = buildPopularityReason({
      post: p, posRatio, negRatio, totalSent, opinionTypes, debates: commentDebates,
    })

    const reactionTags: string[] = []
    if (p.commentCount >= 100) reactionTags.push(`높은 참여(${p.commentCount})`)
    else if (p.commentCount >= 30) reactionTags.push(`활발한 토론(${p.commentCount})`)
    if (totalSent > 0) {
      if (posRatio >= 0.6) reactionTags.push('압도적 호응')
      else if (negRatio >= 0.6) reactionTags.push('비판 우세')
      else reactionTags.push('의견 양분')
    }
    if ((Date.now() - new Date(p.createdAt).getTime()) / 3_600_000 < 24) reactionTags.push('24h 내 화제')
    if (p.flair && !/^r\//i.test(p.flair) && p.flair.toLowerCase() !== p.subreddit.toLowerCase()) {
      reactionTags.push(p.flair)
    }

    return {
      postId: p.id,
      title: p.title,
      url: p.url,
      imageUrl: p.imageUrl,
      subreddit: p.subreddit,
      score: p.score,
      commentCount: p.commentCount,
      summary: summarize(p),
      sentiment: {
        positive: pos,
        negative: neg,
        positiveRatio: posRatio,
        negativeRatio: negRatio,
      },
      opinionTypes,
      topComments,
      reactionCause: reactionTags.join(' · ') || '특별한 패턴 없음',
      commentDebates,
      sentimentSummary,
      popularityReason,
    }
  })
}
