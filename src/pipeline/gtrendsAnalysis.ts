// ============================================================
// Google Trends 분석
// - 카테고리 자동 분류 (스포츠/엔터/기술/정치/금융/K콘텐츠 등)
// - K-콘텐츠 필터링
// - 북미 vs K-콘텐츠 비교 자연어 인사이트
// ============================================================

import type {
  GTrendsItem,
  GTrendsSummary,
  GTrendsCategoryStat,
  TrendCategory,
} from '../types/index.js'
import { fetchGTrendsRss } from '../crawlers/gtrends.js'

const CATEGORY_LABEL: Record<TrendCategory, string> = {
  sports: '🏈 스포츠',
  entertainment: '🎬 엔터테인먼트',
  tech: '💻 기술',
  politics: '🏛️ 정치',
  finance: '💰 금융',
  kcontent: '🇰🇷 K-콘텐츠',
  lifestyle: '🍽️ 라이프스타일',
  news: '📰 시사/뉴스',
  other: '🌐 기타',
}

// ── K-콘텐츠 키워드 (제목+뉴스 매칭) ─────────────────────────
const K_KEYWORDS: { kw: string; isMulti?: boolean }[] = [
  { kw: 'kdrama' }, { kw: 'k-drama' }, { kw: 'korean drama' },
  { kw: 'kpop' }, { kw: 'k-pop' }, { kw: 'korean pop' },
  { kw: 'k-content' }, { kw: 'kcontent' },
  { kw: 'bts' }, { kw: 'blackpink' }, { kw: 'newjeans' }, { kw: 'twice' },
  { kw: 'stray kids' }, { kw: 'seventeen' }, { kw: 'aespa' }, { kw: 'ive' },
  { kw: 'le sserafim' }, { kw: 'enhypen' }, { kw: 'tomorrow x together' }, { kw: 'txt' },
  { kw: 'red velvet' }, { kw: 'mamamoo' }, { kw: 'itzy' },
  { kw: 'squid game' }, { kw: 'all of us are dead' }, { kw: 'extraordinary attorney woo' },
  { kw: 'hellbound' }, { kw: 'crash landing on you' }, { kw: 'hometown cha-cha-cha' },
  { kw: 'lovely runner' }, { kw: 'queen of tears' }, { kw: 'parasite' },
  { kw: 'pachinko' }, { kw: 'minari' }, { kw: 'past lives' },
  { kw: 'iu' }, { kw: 'lee min-ho' }, { kw: 'song hye-kyo' }, { kw: 'hyun bin' },
  { kw: 'son ye-jin' }, { kw: 'park seo-joon' }, { kw: 'gong yoo' }, { kw: 'lee jung-jae' },
  { kw: 'jung kook' }, { kw: 'jungkook' }, { kw: 'jimin' }, { kw: 'rm' }, { kw: 'jin' }, { kw: 'suga' }, { kw: 'jhope' }, { kw: 'v ' },
  { kw: 'rosé' }, { kw: 'jennie' }, { kw: 'lisa' }, { kw: 'jisoo' },
  { kw: 'korean' }, { kw: 'korea' },
]

// ── 카테고리별 키워드 (lowercase, word-boundary) ────────────
const CATEGORY_KEYWORDS: { cat: TrendCategory; keywords: string[] }[] = [
  { cat: 'sports', keywords: [
    'nba', 'nfl', 'mlb', 'nhl', 'super bowl', 'world cup', 'olympics', 'championship',
    'lakers', 'celtics', 'warriors', 'cowboys', 'patriots', 'yankees', 'dodgers',
    'soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'ufc', 'boxing',
    'lebron', 'curry', 'mahomes', 'messi', 'ronaldo', 'tiger woods',
    'playoffs', 'finals', 'draft', 'season', 'coach', 'quarterback',
  ]},
  { cat: 'entertainment', keywords: [
    'movie', 'film', 'trailer', 'sequel', 'prequel', 'oscars', 'emmys', 'grammys', 'golden globes',
    'netflix', 'disney+', 'hbo', 'apple tv', 'hulu', 'prime video', 'paramount',
    'series', 'season finale', 'tv show', 'reality show', 'documentary',
    'taylor swift', 'beyonce', 'rihanna', 'drake', 'kanye', 'kardashian', 'kendall',
    'marvel', 'dc comics', 'star wars', 'avengers', 'spider-man', 'batman',
    'concert', 'tour', 'album', 'single', 'song',
  ]},
  { cat: 'tech', keywords: [
    'apple', 'google', 'microsoft', 'meta', 'amazon', 'tesla', 'spacex', 'openai', 'anthropic',
    'iphone', 'android', 'ipad', 'macbook', 'pixel', 'galaxy', 'samsung',
    'ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'llm', 'machine learning',
    'crypto', 'bitcoin', 'ethereum', 'nft', 'blockchain',
    'startup', 'ipo', 'vc', 'silicon valley', 'tech',
  ]},
  { cat: 'politics', keywords: [
    'president', 'biden', 'trump', 'harris', 'obama', 'desantis', 'pence',
    'election', 'senate', 'congress', 'supreme court', 'governor', 'mayor',
    'republican', 'democrat', 'gop', 'dnc', 'rnc',
    'debate', 'campaign', 'primary', 'caucus', 'voting',
    'white house', 'pentagon', 'cia', 'fbi',
    'ukraine', 'russia', 'israel', 'gaza', 'iran',
  ]},
  { cat: 'finance', keywords: [
    'stock', 'stocks', 'nasdaq', 's&p', 'dow', 'wall street',
    'fed', 'interest rate', 'inflation', 'recession', 'gdp', 'unemployment',
    'mortgage', 'housing market', 'real estate',
    'earnings', 'revenue', 'profit', 'dividend', 'ipo',
    'cpi', 'jobs report',
  ]},
  { cat: 'lifestyle', keywords: [
    'recipe', 'restaurant', 'food', 'diet', 'fitness', 'workout', 'yoga',
    'travel', 'vacation', 'tourism', 'flight',
    'fashion', 'beauty', 'skincare', 'wedding',
  ]},
  { cat: 'news', keywords: [
    'breaking', 'shooting', 'crash', 'fire', 'storm', 'hurricane', 'earthquake', 'flood',
    'death', 'killed', 'arrested', 'investigation', 'lawsuit', 'verdict',
    'climate', 'protest', 'rally',
  ]},
]

// 워드 바운더리 매칭
function matchKeyword(text: string, keyword: string): boolean {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
  return re.test(text)
}

function detectKContent(item: { title: string; newsItems: { title: string; source: string; url: string }[] }): { isK: boolean; matched: string[] } {
  const haystack = [item.title, ...item.newsItems.map((n) => n.title)].join(' ')
  const matched: string[] = []
  for (const { kw } of K_KEYWORDS) {
    if (matchKeyword(haystack, kw)) matched.push(kw)
  }
  return { isK: matched.length > 0, matched }
}

function categorize(item: { title: string; newsItems: { title: string; source: string; url: string }[] }, isK: boolean): TrendCategory {
  if (isK) return 'kcontent'
  const haystack = [item.title, ...item.newsItems.map((n) => n.title)].join(' ').toLowerCase()
  for (const group of CATEGORY_KEYWORDS) {
    for (const kw of group.keywords) {
      if (matchKeyword(haystack, kw)) return group.cat
    }
  }
  return 'other'
}

// ── 자연어 인사이트 생성 ─────────────────────────────────────
function buildOneLineSummary(items: GTrendsItem[], stats: GTrendsCategoryStat[]): string {
  if (items.length === 0) return '북미 트렌드 데이터 없음.'
  const top = items[0]
  // 의미 있는 dominant: 'other' 제외, count >= 2 우선
  const meaningful = stats.filter((s) => s.category !== 'other')
  const dominant = meaningful.find((s) => s.count >= 2) || meaningful[0]
  const dominantLabel = dominant ? CATEGORY_LABEL[dominant.category] : null

  // 상위 2개 항목 + 카테고리 라벨 (emoji 제거)
  const stripEmoji = (s: string) => s.replace(/^[^\p{L}]+/u, '').trim()
  const topPairs = items.slice(0, 2).map((i) => {
    const lbl = i.category !== 'other' ? stripEmoji(CATEGORY_LABEL[i.category]) : ''
    return lbl ? `'${i.title}' (${lbl})` : `'${i.title}'`
  }).join(', ')

  if (dominantLabel && dominant!.count >= 2) {
    return `현재 북미에서는 ${topPairs}을 비롯해 ${dominantLabel} 영역이 주도하고 있으며, 최상위 키워드 '${top.title}'(트래픽 ${top.traffic})가 가장 큰 관심을 받고 있습니다.`
  }
  return `현재 북미에서는 ${topPairs} 등 다양한 분야의 화제가 분산되어 있으며, 최상위 키워드 '${top.title}'(트래픽 ${top.traffic})가 가장 큰 관심을 받고 있습니다.`
}

function buildKInsight(kItems: GTrendsItem[], total: number): string {
  if (kItems.length === 0) {
    return '오늘 북미 일간 트렌드 TOP에 K-콘텐츠 키워드가 직접 포함되지 않았습니다 — 글로벌 메인스트림 검색어 단계에는 진입하지 못했지만, 서브컬처 영역에서는 지속적인 관심이 유지되는 것으로 추정됩니다.'
  }
  const ratio = ((kItems.length / Math.max(total, 1)) * 100).toFixed(0)
  const topK = kItems[0]
  const matched = kItems[0].kKeywords?.slice(0, 3).join(', ') || ''
  if (kItems.length >= 3) {
    return `K-콘텐츠 관련 키워드가 북미 트렌드 TOP에 ${kItems.length}개(전체의 ${ratio}%) 포함되어 있어, 단발성 화제를 넘어 메인스트림 검색 영역으로 안착 중입니다. 핵심 키워드: ${matched}.`
  }
  return `'${topK.title}'(트래픽 ${topK.traffic})를 비롯해 K-콘텐츠 관련 키워드 ${kItems.length}개가 북미 트렌드 TOP에 진입 — 메인 화제는 아니지만 ${matched ? `'${matched}'` : '특정 콘텐츠'} 중심의 부각된 흐름을 보입니다.`
}

function buildComparison(kItems: GTrendsItem[], allItems: GTrendsItem[], stats: GTrendsCategoryStat[]): string {
  const total = allItems.length
  if (total === 0) return '비교할 트렌드 데이터가 없습니다.'

  // 'other' 와 'kcontent' 제외, count >= 2 우선; 없으면 첫 의미 카테고리
  const meaningful = stats.filter((s) => s.category !== 'kcontent' && s.category !== 'other' && s.count > 0)
  const dominantCat = meaningful.find((s) => s.count >= 2) || meaningful[0]
  const kStat = stats.find((s) => s.category === 'kcontent')
  const kCount = kStat?.count ?? 0
  const kRatio = (kCount / total) * 100

  // 1) K가 메인일 때 (>= 30%)
  if (kRatio >= 30) {
    return `K-콘텐츠 관련 키워드가 북미 트렌드의 ${kRatio.toFixed(0)}%를 차지해 일시적 인기 단계를 넘어 글로벌 주류 검색 흐름의 한 축으로 자리잡았습니다. ${dominantCat ? `${CATEGORY_LABEL[dominantCat.category]} 영역과 함께 어깨를 나란히 하며,` : ''} 신규 작품·아티스트 발매 시점 또는 글로벌 이벤트와 맞물려 검색량이 집중된 결과로 해석됩니다.`
  }

  // 2) K가 부분 진입 (10~30%)
  if (kRatio >= 10) {
    return `북미 메인 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '여러 분야'} 중심으로 흘러가는 가운데, K-콘텐츠가 ${kRatio.toFixed(0)}% 비중으로 부분적 상승세를 보입니다. 특정 작품·아티스트의 컴백·신작 공개로 일시적 스파이크가 발생한 형태로 보이며, 메인스트림 점유까지는 추가 동력이 필요합니다.`
  }

  // 3) K가 거의 없음
  if (kRatio > 0) {
    const topK = kItems[0]
    return `북미 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '비K 영역'}이 ${dominantCat?.count}개로 압도적이며, K-콘텐츠는 '${topK.title}' 등 소수 키워드(${kCount}개)에 국한되어 있습니다. 글로벌 일반 시청자 단계에는 아직 도달하지 못했지만, K-팬덤 내부에서는 지속적 검색이 이루어지고 있는 것으로 추정됩니다.`
  }

  // 4) K 부재
  return `오늘 북미 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '주류 영역'} 중심으로 형성되었으며, K-콘텐츠 키워드는 일간 TOP에 진입하지 못했습니다. 이는 K 화제가 특정 이슈(컴백·신작·시상식 등)에 집중되는 패턴이라는 점을 감안하면, 오늘은 그러한 트리거가 없었던 시점으로 해석됩니다.`
}

// ── 메인 ───────────────────────────────────────────────────
export async function buildGTrendsSummary(geo: string = 'US'): Promise<GTrendsSummary> {
  const raw = await fetchGTrendsRss(geo)

  const items: GTrendsItem[] = raw.map((r) => {
    const k = detectKContent(r)
    return {
      ...r,
      isKContent: k.isK,
      kKeywords: k.matched.length > 0 ? k.matched : undefined,
      category: categorize(r, k.isK),
    }
  })

  // 트래픽 내림차순 정렬
  items.sort((a, b) => b.trafficValue - a.trafficValue)

  // 카테고리 통계
  const catMap = new Map<TrendCategory, GTrendsCategoryStat>()
  for (const it of items) {
    const ex = catMap.get(it.category) ?? { category: it.category, label: CATEGORY_LABEL[it.category], count: 0, totalTraffic: 0 }
    ex.count++
    ex.totalTraffic += it.trafficValue
    catMap.set(it.category, ex)
  }
  const categoryStats = [...catMap.values()].sort((a, b) => b.count - a.count)

  const kItems = items.filter((i) => i.isKContent)
  const topItems = items.slice(0, 20) // 상위 20개

  const oneLineSummary = buildOneLineSummary(topItems, categoryStats)
  const kInsight = buildKInsight(kItems, items.length)
  const comparison = buildComparison(kItems, items, categoryStats)

  const now = new Date()
  return {
    fetchedAt: now.toISOString(),
    cached: false,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    geo,
    totalItems: items.length,
    topItems,
    kItems,
    categoryStats,
    oneLineSummary,
    kInsight,
    comparison,
  }
}
