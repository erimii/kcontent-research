// ============================================================
// 한국 콘텐츠 판별 공통 필터 모듈
// 모든 크롤러 + 파이프라인에서 공유 사용
// ============================================================

// ── 한국 방송사 / 플랫폼 ──────────────────────────────────
export const K_BROADCASTERS = new Set([
  'tvn','jtbc','mbc','kbs','sbs','ocn','ena','mnet','kbs2','kbs1',
  'sbs plus','mbc drama','channel a','tv chosun','sky drama',
  'tving','wavve','coupang play','seezn','naver series on',
])

// ── 한국 관련 키워드 (영문) ───────────────────────────────
export const K_KEYWORDS_EN = [
  'korean','korea','k-drama','kdrama','k drama',
  'korean drama','korean movie','korean film','korean series',
  'korean actor','korean actress','hallyu','k-content',
  'seoul','busan','incheon','gangnam','hanbok',
  'kpop','k-pop','korean pop',
  // 주요 제작사/배급사
  'studio dragon','kakao entertainment','cj ent','lotte cinema',
  'showbox','megabox','barunson','film monster',
  // 한국 음악방송/예능 프로그램
  'music core','inkigayo','music bank','show champion','mcountdown',
  'm countdown','the show','show! music core',
  // 한국 주요 배우/감독 이름 (자주 검색되는 인물)
  'lee min ho','lee minho','park seo jun','park seojun','hyun bin',
  'son ye jin','song hye kyo','song joong ki','jun ji hyun',
  'lee jong suk','kim soo hyun','gong yoo','lee dong wook',
  'park min young','yoo in na','iu drama','yoona drama',
  'ji chang wook','park hyung sik','nam joo hyuk',
  'shin hye sun','kim ji won','seo ye ji',
  'lee jun ki','lee joon gi','jo in sung',
  'sung dong il','yoo jae suk','lee kwang soo',
  'byeon woo seok','koo kyo hwan','ji ye eun',
  'lim ji yeon','heo nam jun','park ji hoon',
  // 한국 드라마/영화 제목 패턴
  'squid game','my mister','crash landing','goblin','reply 19',
  'hotel del luna','itaewon class','strong woman',
  'lovely runner','my demon','my royal nemesis',
]

// ── 한국어 키워드 ─────────────────────────────────────────
export const K_KEYWORDS_KO = [
  '한국','드라마','한드','국내','tvn','jtbc','mbc','kbs','sbs',
]

// ── 명백히 비한국 콘텐츠 키워드 ──────────────────────────
export const NON_K_KEYWORDS = [
  // 일본
  'japanese drama','j-drama','jdrama','j drama','anime','manga',
  'nhk','fuji tv','tbs japan','nippon tv','tv asahi',
  'japanese movie','japanese film','japanese series','japanese actor','japanese actress',
  // 중국 (가장 빈번한 혼입 소스)
  'chinese drama','c-drama','cdrama','c drama',
  'chinese movie','chinese film','chinese series',
  'chinese actor','chinese actress','chinese superstar','chinese celebrities',
  'chinese celebrity','chinese entertainment','new chinese drama',
  'chinese wuxia','chinese fantasy','chinese suspense',
  'iqiyi','youku','mango tv','hunan tv','bilibili',
  'mandarin','cantonese','taiwanese drama','tw drama',
  'hong kong drama','hk drama',
  // 중국 드라마 제목 패턴 (원인 기반)
  'joy of life','the double','zhao lu si','zhang ling he',
  'wang an yu','fan cheng cheng','miles wei','wu jin yan',
  // 태국
  'thai drama','thai series','thai movie','thai bl','thai actor','thai actress',
  'gmmtv','one31','channel 3 thailand','thai entertainment',
  // 필리핀/인도네시아 등 기타 아시아
  'pinoy','tagalog','indonesian drama','malay drama','vietnamese drama',
]

// ── 한국 서브레딧 목록 ────────────────────────────────────
export const K_SUBREDDITS = new Set([
  'kdramas','kdrama','kdramarecommends','koreanvariety',
  'hanguk','korea','korean','kpop','kdramacrack',
  'KDRAMA','KoreanDramas',
])

/**
 * 텍스트가 한국 콘텐츠인지 판별
 * @returns 'yes' | 'no' | 'unknown'
 */
export function detectKorean(text: string): 'yes' | 'no' | 'unknown' {
  const lower = text.toLowerCase()

  // 1. 명백한 비한국 키워드가 있으면 즉시 제외
  for (const kw of NON_K_KEYWORDS) {
    if (lower.includes(kw)) return 'no'
  }

  // 2. 한국어 텍스트 포함 여부 (유니코드 범위: 가-힣)
  if (/[가-힣]/.test(text)) return 'yes'

  // 3. 한국 관련 영문 키워드
  for (const kw of K_KEYWORDS_EN) {
    if (lower.includes(kw)) return 'yes'
  }

  // 4. 한국 방송사/플랫폼
  for (const bc of K_BROADCASTERS) {
    if (lower.includes(bc)) return 'yes'
  }

  return 'unknown'
}

/**
 * 텍스트가 한국 콘텐츠인지 판별 (boolean)
 * unknown은 includeUnknown 옵션으로 제어
 */
export function isKorean(
  text: string,
  opts: { includeUnknown?: boolean } = {},
): boolean {
  const result = detectKorean(text)
  if (result === 'yes') return true
  if (result === 'no') return false
  return opts.includeUnknown ?? false
}

/**
 * Reddit 포스트가 한국 관련인지 판별
 * - 서브레딧 이름 우선 체크
 * - 제목 + 플레어 텍스트 보조 체크
 */
export function isKoreanRedditPost(post: {
  subreddit: string
  title: string
  flair?: string
}): boolean {
  // k-drama 서브레딧이면 무조건 포함
  if (K_SUBREDDITS.has(post.subreddit)) return true

  // 일반 서브레딧(korean, koreatravel 등)은 제목으로 추가 판별
  const combined = `${post.subreddit} ${post.title} ${post.flair || ''}`
  const result = detectKorean(combined)
  // unknown은 포함 (관련 서브레딧이므로 가능성 높음)
  return result !== 'no'
}
