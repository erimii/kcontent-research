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
  GTrendsEventContext,
  GTrendsActiveEvent,
  TrendCategory,
} from '../types/index.js'
import { fetchGTrendsRss } from '../crawlers/gtrends.js'
import { getActiveEvents, eventPhaseLabel, type ActiveEvent } from '../data/usEvents.js'

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

// ── 카테고리별 키워드 (lowercase, word-boundary 매칭) ────────
// 미국 트렌드 빈출 키워드 위주로 보강
const CATEGORY_KEYWORDS: { cat: TrendCategory; keywords: string[] }[] = [
  { cat: 'sports', keywords: [
    // 리그/대회
    'nba', 'nfl', 'mlb', 'nhl', 'mls', 'ncaa', 'cfl', 'ufc', 'wwe',
    'super bowl', 'world cup', 'olympics', 'championship', 'world series',
    'playoffs', 'finals', 'draft', 'tournament', 'derby',
    'soccer', 'football', 'basketball', 'baseball', 'hockey', 'tennis', 'golf', 'boxing',
    // 일반 용어
    'coach', 'quarterback', 'pitcher', 'striker', 'goalie',
    // NFL 팀
    'cowboys', 'patriots', 'eagles', 'chiefs', 'ravens', 'broncos', 'saints', 'raiders',
    'rams', 'niners', '49ers', 'packers', 'vikings', 'cardinals', 'seahawks', 'browns',
    'steelers', 'panthers', 'falcons', 'jaguars', 'buccaneers', 'chargers', 'dolphins',
    'jets', 'titans', 'colts', 'lions', 'bears', 'bills', 'bengals',
    // NBA
    'lakers', 'celtics', 'warriors', 'bulls', 'mavericks', 'mavs', 'suns', 'rockets',
    'jazz', 'nuggets', 'blazers', 'kings', 'hornets', 'hawks', 'magic', 'heat', 'raptors',
    'sixers', 'thunder', 'timberwolves', 'pelicans', 'grizzlies',
    // MLB
    'yankees', 'dodgers', 'phillies', 'braves', 'tigers', 'red sox', 'cubs', 'white sox',
    'marlins', 'rays', 'orioles', 'blue jays', 'mariners', 'athletics', 'twins', 'royals',
    'guardians', 'padres', 'rockies', 'dbacks', 'diamondbacks', 'nationals', 'brewers',
    'reds', 'pirates', 'astros', 'angels', 'mets',
    // NHL
    'oilers', 'bruins', 'blackhawks', 'sabres', 'flyers', 'capitals', 'penguins',
    'hurricanes', 'red wings', 'sharks', 'golden knights', 'ducks', 'stars', 'predators',
    'blues', 'lightning', 'maple leafs', 'canadiens', 'avalanche', 'flames', 'canucks',
    'senators', 'coyotes',
    // MLS
    'nashville sc', 'atlanta united', 'lafc', 'sounders', 'timbers', 'red bulls',
    // 해외 축구 빈출
    'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham',
    'real madrid', 'barcelona', 'bayern', 'psg', 'juventus', 'milan', 'inter milan',
    'dortmund', 'atletico', 'tigres',
    // 선수
    'lebron', 'curry', 'mahomes', 'messi', 'ronaldo', 'tiger woods', 'kobe', 'jordan',
    'klay thompson', 'durant', 'giannis', 'embiid', 'jokic',
  ]},
  { cat: 'entertainment', keywords: [
    'movie', 'film', 'trailer', 'sequel', 'prequel', 'reboot',
    'oscars', 'emmys', 'grammys', 'golden globes', 'tony awards', 'sag awards',
    'netflix', 'disney+', 'disney plus', 'hbo', 'apple tv', 'hulu', 'prime video',
    'paramount', 'peacock', 'max',
    'series', 'season finale', 'tv show', 'reality show', 'documentary', 'episode',
    'concert', 'tour', 'album', 'single', 'song',
    // 인기 연예인
    'taylor swift', 'beyonce', 'rihanna', 'drake', 'kanye', 'kardashian', 'kendall',
    'jenner', 'ariana grande', 'michael jackson', 'madonna', 'lady gaga',
    'jimmy kimmel', 'jimmy fallon', 'colbert', 'oprah',
    // 프랜차이즈
    'marvel', 'dc comics', 'dc studios', 'star wars', 'avengers', 'spider-man',
    'batman', 'superman', 'wolverine', 'deadpool', 'x-men',
    // 인기 시리즈/영화
    'ted lasso', 'the boys', 'daredevil', 'severance', 'succession', 'white lotus',
    'only murders', 'last of us', 'wednesday', 'stranger things', 'euphoria',
    'queens gambit', 'wicked', 'dune', 'gladiator', 'oppenheimer', 'barbie',
    'inside out', 'spongebob', 'simpsons', 'family guy',
  ]},
  { cat: 'tech', keywords: [
    'apple', 'google', 'microsoft', 'meta', 'amazon', 'tesla', 'spacex', 'openai', 'anthropic',
    'iphone', 'android', 'ipad', 'macbook', 'pixel', 'galaxy', 'samsung',
    'ai', 'chatgpt', 'gpt', 'claude', 'gemini', 'llm', 'machine learning',
    'crypto', 'bitcoin', 'ethereum', 'nft', 'blockchain',
    'startup', 'ipo', 'vc', 'silicon valley', 'tech',
    // 추가
    'doodle', 'gmail', 'youtube', 'instagram', 'tiktok', 'twitter', 'x.com',
    'whatsapp', 'snapchat', 'reddit', 'discord', 'twitch',
    'vision pro', 'airpods', 'oculus', 'meta quest', 'kindle', 'roku',
    'playstation', 'ps plus', 'xbox', 'nintendo', 'switch', 'steam deck',
  ]},
  { cat: 'politics', keywords: [
    'president', 'vice president',
    'biden', 'trump', 'harris', 'obama', 'desantis', 'pence', 'kamala',
    'comey', 'hegseth', 'schumer', 'mcconnell', 'newsom', 'pelosi', 'mccarthy',
    'rubio', 'cruz', 'sanders', 'aoc', 'gaetz', 'gingrich', 'romney',
    'king charles', 'queen camilla', 'prince william', 'prince harry', 'meghan',
    'putin', 'zelensky', 'netanyahu', 'xi jinping',
    'election', 'senate', 'congress', 'supreme court', 'governor', 'mayor',
    'republican', 'democrat', 'gop', 'dnc', 'rnc',
    'debate', 'campaign', 'primary', 'caucus', 'voting', 'voter',
    'white house', 'pentagon', 'cia', 'fbi', 'state of the union',
    'ukraine', 'russia', 'israel', 'gaza', 'iran',
    'executive order', 'impeachment', 'tariff',
  ]},
  { cat: 'finance', keywords: [
    'stock', 'stocks', 'nasdaq', 's&p', 'dow', 'wall street',
    'fed', 'interest rate', 'inflation', 'recession', 'gdp', 'unemployment',
    'mortgage', 'housing market', 'real estate',
    'earnings', 'revenue', 'profit', 'dividend', 'ipo',
    'cpi', 'jobs report',
    'opec', 'saudi aramco', 'oil price', 'gas price', 'gold', 'silver',
    'crude', 'brent',
  ]},
  { cat: 'lifestyle', keywords: [
    'recipe', 'restaurant', 'food', 'diet', 'fitness', 'workout', 'yoga',
    'travel', 'vacation', 'tourism', 'flight',
    'fashion', 'beauty', 'skincare', 'wedding',
    // 음식 체인
    'costco', 'mcdonald', 'starbucks', 'chipotle', 'taco bell', 'wendy', 'smokey bones',
    'panera', 'carls jr', 'kfc', 'burger king', 'chick-fil-a', 'popeyes', 'dominos',
    'pizza hut', 'dairy queen', 'in-n-out', 'five guys', 'ihop', 'dennys', 'applebees',
    'olive garden', 'red lobster', 'outback', 'longhorn',
    'hot dog', 'burger', 'pizza', 'taco', 'french broad',
  ]},
  { cat: 'news', keywords: [
    'breaking', 'shooting', 'crash', 'fire', 'storm', 'hurricane', 'earthquake', 'flood',
    'tornado', 'snowstorm', 'blizzard', 'wildfire',
    'death', 'killed', 'arrested', 'investigation', 'lawsuit', 'verdict', 'arrest',
    'climate', 'protest', 'rally',
    'weather', 'forecast', 'temperature',
    'immigration', 'border', 'asylum', 'fentanyl', 'opioid',
    'recall', 'scandal', 'mass shooting',
  ]},
]

// "X vs Y" 패턴 (스포츠 매치) — 별도 휴리스틱
function isVsMatch(title: string): boolean {
  return /\b\w+\s+vs\.?\s+\w+/i.test(title)
}

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
  // "X vs Y" 패턴은 스포츠 매치일 확률 높음
  if (isVsMatch(item.title)) return 'sports'
  return 'other'
}

// ── 이벤트 매칭 ──────────────────────────────────────────────
// 트렌드 제목·뉴스에서 활성 이벤트의 트리거 키워드를 직접 매칭하면
// 그 트렌드의 검색 증가 원인을 이벤트로 귀속시킨다.
// 카테고리만 일치하는 약한 매칭은 per-item 칩으로 노출하지 않고
// 비교 인사이트 문장 안에서만 다룬다 (노이즈 회피).
function matchEventToItem(item: GTrendsItem, activeEvents: ActiveEvent[]): GTrendsEventContext | undefined {
  if (activeEvents.length === 0) return undefined
  const haystack = [item.title, ...item.newsItems.map((n) => n.title)].join(' ')
  for (const ev of activeEvents) {
    for (const kw of ev.triggerKeywords) {
      if (matchKeyword(haystack, kw)) {
        const phase = eventPhaseLabel(ev)
        // 이벤트와 트렌드를 직접 연결하는 자연어 — 단순 이벤트명 나열 X
        const reason = `${phase} ${ev.labelKo}와 직접 연결되는 키워드 '${kw}'가 트렌드에 포함됨 — ${ev.contextHint}`
        return {
          eventId: ev.id,
          emoji: ev.emoji,
          labelKo: ev.labelKo,
          matchedKeyword: kw,
          reason,
        }
      }
    }
  }
  return undefined
}

function toSummaryActiveEvents(events: ActiveEvent[]): GTrendsActiveEvent[] {
  return events.map((e) => ({
    id: e.id,
    emoji: e.emoji,
    labelKo: e.labelKo,
    labelEn: e.labelEn,
    contextHint: e.contextHint,
    daysUntil: e.daysUntil,
    status: e.status,
    amplifiedCategories: e.amplifiedCategories,
    kContentImpact: e.kContentImpact,
  }))
}

// ── 자연어 인사이트 생성 ─────────────────────────────────────
// TOP-N 항목들에서 카테고리별 카운트
function topCategoryCounts(items: GTrendsItem[], topN: number): Map<TrendCategory, number> {
  const m = new Map<TrendCategory, number>()
  for (const it of items.slice(0, topN)) {
    m.set(it.category, (m.get(it.category) ?? 0) + 1)
  }
  return m
}

function buildOneLineSummary(items: GTrendsItem[], _stats: GTrendsCategoryStat[]): string {
  if (items.length === 0) return '북미 트렌드 데이터 없음.'
  const top = items[0]

  // dominant: TOP 10 안에서 'other' 제외 가장 많은 카테고리. share >= 30% (top 10 중 3건+)일 때만 "주도"라고 표현
  const top10Counts = topCategoryCounts(items, 10)
  const meaningful = [...top10Counts.entries()]
    .filter(([cat]) => cat !== 'other')
    .sort((a, b) => b[1] - a[1])
  const dominant = meaningful[0]
  const dominantShare = dominant ? dominant[1] / Math.min(items.length, 10) : 0

  // 상위 2개 항목 + 카테고리 라벨 (emoji 제거)
  const stripEmoji = (s: string) => s.replace(/^[^\p{L}]+/u, '').trim()
  const topPairs = items.slice(0, 2).map((i) => {
    const lbl = i.category !== 'other' ? stripEmoji(CATEGORY_LABEL[i.category]) : ''
    return lbl ? `'${i.title}' (${lbl})` : `'${i.title}'`
  }).join(', ')

  if (dominant && dominantShare >= 0.3) {
    const dominantLabel = CATEGORY_LABEL[dominant[0]]
    return `현재 북미에서는 ${topPairs}을 비롯해 ${dominantLabel} 영역이 주도하고 있으며 (TOP 10 중 ${dominant[1]}건), 최상위 키워드 '${top.title}'(트래픽 ${top.traffic})가 가장 큰 관심을 받고 있습니다.`
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

function buildComparison(
  kItems: GTrendsItem[],
  allItems: GTrendsItem[],
  stats: GTrendsCategoryStat[],
  activeEvents: ActiveEvent[],
): string {
  const total = allItems.length
  if (total === 0) return '비교할 트렌드 데이터가 없습니다.'

  // TOP 10 기준 dominant (other·kcontent 제외)
  const top10Counts = topCategoryCounts(allItems, 10)
  const meaningfulTop = [...top10Counts.entries()]
    .filter(([cat]) => cat !== 'kcontent' && cat !== 'other')
    .sort((a, b) => b[1] - a[1])
  const dominantCat = meaningfulTop[0]
    ? { category: meaningfulTop[0][0], count: meaningfulTop[0][1], label: CATEGORY_LABEL[meaningfulTop[0][0]] }
    : null
  void stats
  const kStat = stats.find((s) => s.category === 'kcontent')
  const kCount = kStat?.count ?? 0
  const kRatio = (kCount / total) * 100

  // dominant 카테고리를 증폭시키는 활성 이벤트 찾기 (있으면 자연어로 추가)
  const dominantAmplifier = dominantCat
    ? activeEvents.find((ev) => ev.amplifiedCategories.includes(dominantCat.category))
    : undefined
  const eventBoostFragment = dominantAmplifier
    ? ` 이 흐름은 ${eventPhaseLabel(dominantAmplifier)} ${dominantAmplifier.labelKo} 시즌과 맞물린 결과로 해석됩니다 — ${dominantAmplifier.contextHint}.`
    : ''

  // 1) K가 메인일 때 (>= 30%)
  if (kRatio >= 30) {
    return `K-콘텐츠 관련 키워드가 북미 트렌드의 ${kRatio.toFixed(0)}%를 차지해 일시적 인기 단계를 넘어 글로벌 주류 검색 흐름의 한 축으로 자리잡았습니다. ${dominantCat ? `${CATEGORY_LABEL[dominantCat.category]} 영역과 함께 어깨를 나란히 하며,` : ''} 신규 작품·아티스트 발매 시점 또는 글로벌 이벤트와 맞물려 검색량이 집중된 결과로 해석됩니다.${eventBoostFragment}`
  }

  // 2) K가 부분 진입 (10~30%)
  if (kRatio >= 10) {
    return `북미 메인 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '여러 분야'} 중심으로 흘러가는 가운데, K-콘텐츠가 ${kRatio.toFixed(0)}% 비중으로 부분적 상승세를 보입니다. 특정 작품·아티스트의 컴백·신작 공개로 일시적 스파이크가 발생한 형태로 보이며, 메인스트림 점유까지는 추가 동력이 필요합니다.${eventBoostFragment}`
  }

  // 3) K가 거의 없음
  if (kRatio > 0) {
    const topK = kItems[0]
    return `북미 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '비K 영역'}이 ${dominantCat?.count}개로 압도적이며, K-콘텐츠는 '${topK.title}' 등 소수 키워드(${kCount}개)에 국한되어 있습니다. 글로벌 일반 시청자 단계에는 아직 도달하지 못했지만, K-팬덤 내부에서는 지속적 검색이 이루어지고 있는 것으로 추정됩니다.${eventBoostFragment}`
  }

  // 4) K 부재
  return `오늘 북미 트렌드는 ${dominantCat ? CATEGORY_LABEL[dominantCat.category] : '주류 영역'} 중심으로 형성되었으며, K-콘텐츠 키워드는 일간 TOP에 진입하지 못했습니다. 이는 K 화제가 특정 이슈(컴백·신작·시상식 등)에 집중되는 패턴이라는 점을 감안하면, 오늘은 그러한 트리거가 없었던 시점으로 해석됩니다.${eventBoostFragment}`
}

// ── 메인 ───────────────────────────────────────────────────
export async function buildGTrendsSummary(geo: string = 'US'): Promise<GTrendsSummary> {
  const raw = await fetchGTrendsRss(geo)
  const now = new Date()

  // 오늘 활성화된 미국 공휴일·시즌·이벤트
  const activeEvents = getActiveEvents(now)

  const items: GTrendsItem[] = raw.map((r) => {
    const k = detectKContent(r)
    const baseItem: GTrendsItem = {
      ...r,
      isKContent: k.isK,
      kKeywords: k.matched.length > 0 ? k.matched : undefined,
      category: categorize(r, k.isK),
    }
    // 트렌드와 직접 연결되는 이벤트 매칭 (트리거 키워드 직접 매칭만)
    const eventContext = matchEventToItem(baseItem, activeEvents)
    return eventContext ? { ...baseItem, eventContext } : baseItem
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
  const topItems = items.slice(0, 100)

  const oneLineSummary = buildOneLineSummary(topItems, categoryStats)
  const kInsight = buildKInsight(kItems, items.length)
  const comparison = buildComparison(kItems, items, categoryStats, activeEvents)

  return {
    fetchedAt: now.toISOString(),
    cached: false,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    geo,
    totalItems: items.length,
    topItems,
    kItems,
    categoryStats,
    activeEvents: toSummaryActiveEvents(activeEvents),
    oneLineSummary,
    kInsight,
    comparison,
  }
}
