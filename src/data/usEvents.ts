// ============================================================
// US Events Calendar
// - 미국 연간 공휴일·시상식·시즌·주요 이벤트 사전
// - Google Trends 검색 증가 원인 추정용 (정적 매칭)
// ============================================================

import type { TrendCategory } from '../types/index.js'

/** K-콘텐츠 + 한국어 학습 서비스 관점에서의 활용 시사점 (선택) */
export interface KContentImpact {
  /** 📊 이 이벤트로 북미에서 어떤 검색이 증가하는가 */
  observation: string
  /** 💡 K-콘텐츠 노출 / 한국어 학습 결합 활용 방향 */
  application: string
}

export interface UsEvent {
  id: string
  emoji: string
  labelKo: string
  labelEn: string
  /** 해당 연도의 이벤트 시작·종료일 (UTC noon) */
  getRange(year: number): { start: Date; end: Date }
  /** 이 이벤트 영향이 미치기 시작하는 lead-up 일수 (시작일 기준 며칠 전부터 검색 증가) */
  leadupDays: number
  /** 이 이벤트가 광범위하게 활성화시키는 카테고리 (per-item 칩 노출 안 함, 비교 인사이트에서 사용) */
  amplifiedCategories: TrendCategory[]
  /** 트렌드 제목·뉴스에서 직접 매칭되면 강한 신호로 처리되는 키워드 (lowercase) */
  triggerKeywords: string[]
  /** 이벤트 자체에 대한 일반 설명 (per-item attribution 빌드 시 일부 사용) */
  contextHint: string
  /** K-콘텐츠/한국어 학습 활용 시사점 (강한 연결 이벤트만 채움 — 약한 연결은 undefined) */
  kContentImpact?: KContentImpact
}

// ── Date helpers (UTC noon으로 통일하여 TZ edge 회피) ────────
function utcDate(y: number, month0: number, d: number): Date {
  return new Date(Date.UTC(y, month0, d, 12, 0, 0))
}

/** N번째 weekday — weekday: 0=Sun … 6=Sat */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month0, 1, 12))
  const firstWd = first.getUTCDay()
  const diff = (weekday - firstWd + 7) % 7
  const day = 1 + diff + (n - 1) * 7
  return utcDate(year, month0, day)
}

/** 해당 월의 마지막 weekday */
function lastWeekday(year: number, month0: number, weekday: number): Date {
  const lastDayOfMonth = new Date(Date.UTC(year, month0 + 1, 0, 12)).getUTCDate()
  const last = new Date(Date.UTC(year, month0, lastDayOfMonth, 12))
  const lastWd = last.getUTCDay()
  const diff = (lastWd - weekday + 7) % 7
  return utcDate(year, month0, lastDayOfMonth - diff)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 3600 * 1000)
}

// ── 이벤트 등록부 (~30개) ───────────────────────────────────
export const US_EVENTS: UsEvent[] = [
  // ── January ──
  {
    id: 'new_year',
    emoji: '🎆',
    labelKo: '신년',
    labelEn: "New Year's Day",
    getRange: (y) => ({ start: utcDate(y, 0, 1), end: utcDate(y, 0, 2) }),
    leadupDays: 1,
    amplifiedCategories: ['lifestyle', 'news'],
    triggerKeywords: ['new year', "new year's", 'nye', 'resolution', 'fireworks', 'times square'],
    contextHint: '연초 — 새해 결심·축하·연휴 검색이 일시 집중되는 시기',
  },
  {
    id: 'mlk_day',
    emoji: '🕊️',
    labelKo: 'MLK 데이',
    labelEn: 'Martin Luther King Jr. Day',
    getRange: (y) => {
      const d = nthWeekday(y, 0, 1, 3)
      return { start: d, end: d }
    },
    leadupDays: 1,
    amplifiedCategories: ['politics', 'news'],
    triggerKeywords: ['mlk', 'martin luther king', 'civil rights'],
    contextHint: '시민권 운동·역사 관련 화제, 연방 공휴일',
  },
  {
    id: 'golden_globes',
    emoji: '🏆',
    labelKo: '골든 글로브',
    labelEn: 'Golden Globe Awards',
    getRange: (y) => {
      const d = nthWeekday(y, 0, 0, 1)
      return { start: d, end: d }
    },
    leadupDays: 3,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['golden globe', 'golden globes'],
    contextHint: '후보작·수상 영화·드라마·셀럽 패션 화제 집중',
    kContentImpact: {
      observation: '후보·수상 영화·드라마·셀럽 검색 급증',
      application: 'K 영화·드라마 후보작 부각 노출 / 시상식 명대사·인터뷰로 한국어 학습 콘텐츠 결합',
    },
  },

  // ── February ──
  {
    id: 'super_bowl',
    emoji: '🏈',
    labelKo: '슈퍼볼',
    labelEn: 'Super Bowl',
    getRange: (y) => {
      const d = nthWeekday(y, 1, 0, 2)
      return { start: d, end: d }
    },
    leadupDays: 7,
    amplifiedCategories: ['sports', 'entertainment', 'lifestyle'],
    triggerKeywords: [
      'super bowl', 'superbowl', 'halftime show',
      'commercials', 'puppy bowl',
    ],
    contextHint: 'NFL 결승 + 하프타임 쇼 + 광고 — 미국 최대 단일 이벤트',
    kContentImpact: {
      observation: '하프타임 쇼·광고·응원·파티 음식 검색 폭증',
      application: 'K-팝 아티스트 무대 컬래버 노출 기회 / "와! 대박! 멋지다" 등 응원·감탄 한국어 표현 학습',
    },
  },
  {
    id: 'grammys',
    emoji: '🎵',
    labelKo: '그래미 시상식',
    labelEn: 'Grammy Awards',
    getRange: (y) => {
      const d = nthWeekday(y, 1, 0, 1)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['grammy', 'grammys'],
    contextHint: '음악 시상식 — 후보·수상 아티스트·무대 화제',
    kContentImpact: {
      observation: '후보·수상 아티스트·퍼포먼스 검색 폭증',
      application: 'K-팝 아티스트(BTS·BLACKPINK·뉴진스 계보) 후보 부각 노출 / 수상곡·노미네이트곡 가사 한국어 학습 콘텐츠',
    },
  },
  {
    id: 'valentines',
    emoji: '💝',
    labelKo: '밸런타인데이',
    labelEn: "Valentine's Day",
    getRange: (y) => ({ start: utcDate(y, 1, 14), end: utcDate(y, 1, 14) }),
    leadupDays: 5,
    amplifiedCategories: ['lifestyle', 'entertainment'],
    triggerKeywords: ['valentine', "valentine's"],
    contextHint: '선물·데이트·로맨스 콘텐츠 검색 집중',
    kContentImpact: {
      observation: '데이트·로맨스 영화·드라마·선물 검색 집중',
      application: 'K 로맨스 드라마(사랑의 불시착·태양의 후예 계보) 큐레이션 노출 / "사랑해·좋아해·고백" 한국어 표현 학습',
    },
  },
  {
    id: 'presidents_day',
    emoji: '🇺🇸',
    labelKo: '대통령의 날',
    labelEn: "Presidents' Day",
    getRange: (y) => {
      const d = nthWeekday(y, 1, 1, 3)
      return { start: d, end: d }
    },
    leadupDays: 2,
    amplifiedCategories: ['politics', 'lifestyle'],
    triggerKeywords: ["presidents day", 'presidents-day'],
    contextHint: '연방 공휴일 + 매트리스·자동차 세일 시즌',
  },

  // ── March ──
  {
    id: 'march_madness',
    emoji: '🏀',
    labelKo: 'NCAA 마치 매드니스',
    labelEn: 'NCAA March Madness',
    getRange: (y) => ({ start: utcDate(y, 2, 17), end: utcDate(y, 3, 8) }),
    leadupDays: 7,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['march madness', 'ncaa tournament', 'final four', 'sweet 16', 'elite 8', 'bracket'],
    contextHint: '대학 농구 토너먼트 — 브래킷·업셋 관심 폭증',
  },
  {
    id: 'st_patricks',
    emoji: '☘️',
    labelKo: '성 패트릭의 날',
    labelEn: "St. Patrick's Day",
    getRange: (y) => ({ start: utcDate(y, 2, 17), end: utcDate(y, 2, 17) }),
    leadupDays: 2,
    amplifiedCategories: ['lifestyle'],
    triggerKeywords: ["st patrick", "saint patrick", "patrick's day", 'shamrock'],
    contextHint: '아일랜드 문화·녹색·퍼레이드·맥주 관련 화제',
  },
  {
    id: 'oscars',
    emoji: '🎬',
    labelKo: '아카데미 시상식',
    labelEn: 'Academy Awards (Oscars)',
    getRange: (y) => {
      const d = nthWeekday(y, 2, 0, 2)
      return { start: d, end: d }
    },
    leadupDays: 7,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['oscar', 'oscars', 'academy award'],
    contextHint: '영화 시상식의 정점 — 후보작·레드 카펫·수상 소감 화제',
    kContentImpact: {
      observation: '후보작·레드 카펫·수상 소감 검색 급증',
      application: 'K 영화(기생충·미나리·패스트 라이브즈 계보) 출품작 노출 기회 / 영화 명대사·수상 소감 한국어 학습',
    },
  },

  // ── April ──
  {
    id: 'mlb_opening',
    emoji: '⚾',
    labelKo: 'MLB 개막',
    labelEn: 'MLB Opening Day',
    getRange: (y) => ({ start: utcDate(y, 2, 27), end: utcDate(y, 3, 5) }),
    leadupDays: 3,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['mlb opening', 'opening day', 'first pitch'],
    contextHint: '메이저리그 정규시즌 개막 — 팀 라인업·전망 화제',
  },
  {
    id: 'easter',
    emoji: '🐰',
    labelKo: '부활절',
    labelEn: 'Easter',
    getRange: (y) => {
      // Hardcoded for 2024-2030 (easter 계산식 복잡)
      const easterDates: Record<number, [number, number]> = {
        2024: [2, 31], 2025: [3, 20], 2026: [3, 5], 2027: [2, 28],
        2028: [3, 16], 2029: [3, 1], 2030: [3, 21],
      }
      const [m0, d] = easterDates[y] ?? [3, 5]
      return { start: utcDate(y, m0, d), end: utcDate(y, m0, d) }
    },
    leadupDays: 5,
    amplifiedCategories: ['lifestyle'],
    triggerKeywords: ['easter', 'good friday'],
    contextHint: '가족 모임·요리·종교 행사 검색 증가',
  },
  {
    id: 'coachella',
    emoji: '🎪',
    labelKo: '코첼라 페스티벌',
    labelEn: 'Coachella Festival',
    getRange: (y) => ({ start: utcDate(y, 3, 11), end: utcDate(y, 3, 21) }),
    leadupDays: 5,
    amplifiedCategories: ['entertainment', 'lifestyle'],
    triggerKeywords: ['coachella', 'festival lineup'],
    contextHint: '음악 페스티벌 — 헤드라이너 무대·패션·라이브 영상 화제',
    kContentImpact: {
      observation: '헤드라이너·라인업·셋리스트·페스티벌 패션 검색 폭증',
      application: 'K-팝 아티스트 라인업(BLACKPINK·NewJeans·LE SSERAFIM 계보) 부각 / 셋리스트 가사·팬챈트 한국어 학습',
    },
  },

  // ── May ──
  {
    id: 'met_gala',
    emoji: '👗',
    labelKo: '멧 갈라',
    labelEn: 'Met Gala',
    getRange: (y) => {
      const d = nthWeekday(y, 4, 1, 1)
      return { start: d, end: d }
    },
    leadupDays: 2,
    amplifiedCategories: ['entertainment', 'lifestyle'],
    triggerKeywords: ['met gala'],
    contextHint: '패션의 정점 행사 — 셀럽 룩·테마 검색 폭증',
    kContentImpact: {
      observation: '셀럽 룩·테마·드레스 코드 검색 폭증',
      application: 'K 셀럽(BLACKPINK 제니·BTS RM·SEVENTEEN 등) 룩 부각 노출 / 한복·전통의상과의 비교 학습 콘텐츠',
    },
  },
  {
    id: 'mothers_day',
    emoji: '💐',
    labelKo: '어머니의 날',
    labelEn: "Mother's Day",
    getRange: (y) => {
      const d = nthWeekday(y, 4, 0, 2)
      return { start: d, end: d }
    },
    leadupDays: 7,
    amplifiedCategories: ['lifestyle'],
    triggerKeywords: ["mother's day", 'mom gift'],
    contextHint: '선물·꽃·브런치 관련 검색 증가',
    kContentImpact: {
      observation: '어머니·가족·감사 메시지·꽃 검색 증가',
      application: 'K 가족 드라마(어머니 서사: 디어 마이 프렌즈·빈센조 모자 관계 등) 큐레이션 / "어머니·감사합니다·사랑해요" 한국어 표현 학습',
    },
  },
  {
    id: 'memorial_day',
    emoji: '🇺🇸',
    labelKo: '메모리얼 데이',
    labelEn: 'Memorial Day',
    getRange: (y) => {
      const d = lastWeekday(y, 4, 1)
      return { start: d, end: d }
    },
    leadupDays: 3,
    amplifiedCategories: ['politics', 'lifestyle', 'sports'],
    triggerKeywords: ['memorial day', 'indy 500', 'indianapolis 500'],
    contextHint: '연방 공휴일 + 여름 시작 + 인디 500 + 대형 세일',
  },

  // ── June ──
  {
    id: 'wwdc',
    emoji: '🍎',
    labelKo: '애플 WWDC',
    labelEn: 'Apple WWDC',
    getRange: (y) => ({ start: utcDate(y, 5, 8), end: utcDate(y, 5, 14) }),
    leadupDays: 3,
    amplifiedCategories: ['tech'],
    triggerKeywords: ['wwdc', 'ios 19', 'ios 20', 'macos sequoia', 'macos tahoe'],
    contextHint: '신규 OS·기능 발표 주간 — Apple 생태계 화제 집중',
  },
  {
    id: 'fathers_day',
    emoji: '👔',
    labelKo: '아버지의 날',
    labelEn: "Father's Day",
    getRange: (y) => {
      const d = nthWeekday(y, 5, 0, 3)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['lifestyle'],
    triggerKeywords: ["father's day", 'dad gift'],
    contextHint: '선물·BBQ·가족 행사 검색 증가',
    kContentImpact: {
      observation: '아버지·가족·선물·부자 관계 검색 증가',
      application: 'K 부자 서사 드라마(미생·우리들의 블루스·나의 아저씨) 큐레이션 / "아버지·아빠·고생 많으셨어요" 한국어 표현 학습',
    },
  },
  {
    id: 'juneteenth',
    emoji: '✊🏿',
    labelKo: '준틴스',
    labelEn: 'Juneteenth',
    getRange: (y) => ({ start: utcDate(y, 5, 19), end: utcDate(y, 5, 19) }),
    leadupDays: 2,
    amplifiedCategories: ['politics', 'news'],
    triggerKeywords: ['juneteenth'],
    contextHint: '노예 해방 기념 연방 공휴일 — 흑인 문화·역사 화제',
  },
  {
    id: 'nba_finals',
    emoji: '🏀',
    labelKo: 'NBA 파이널',
    labelEn: 'NBA Finals',
    getRange: (y) => ({ start: utcDate(y, 5, 1), end: utcDate(y, 5, 22) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['nba finals', 'finals mvp', 'larry obrien', 'larry o brien'],
    contextHint: 'NBA 챔피언십 시리즈 — MVP·결정적 경기 화제',
  },

  // ── July ──
  {
    id: 'july_4th',
    emoji: '🎆',
    labelKo: '독립기념일',
    labelEn: 'Independence Day',
    getRange: (y) => ({ start: utcDate(y, 6, 4), end: utcDate(y, 6, 4) }),
    leadupDays: 3,
    amplifiedCategories: ['lifestyle', 'politics'],
    triggerKeywords: ['independence day', '4th of july', 'july 4', 'fireworks', 'hot dog eating'],
    contextHint: '연방 공휴일 — 불꽃놀이·BBQ·여행 검색 집중',
  },

  // ── September ──
  {
    id: 'labor_day',
    emoji: '🛠️',
    labelKo: '노동절',
    labelEn: 'Labor Day',
    getRange: (y) => {
      const d = nthWeekday(y, 8, 1, 1)
      return { start: d, end: d }
    },
    leadupDays: 3,
    amplifiedCategories: ['lifestyle'],
    triggerKeywords: ['labor day'],
    contextHint: '여름 시즌 종료 + 세일·여행·BBQ 마지막 주말',
  },
  {
    id: 'nfl_kickoff',
    emoji: '🏈',
    labelKo: 'NFL 정규시즌 개막',
    labelEn: 'NFL Season Kickoff',
    getRange: (y) => {
      const labor = nthWeekday(y, 8, 1, 1)
      const kickoff = addDays(labor, 3)
      return { start: kickoff, end: addDays(kickoff, 3) }
    },
    leadupDays: 5,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['nfl kickoff', 'season opener', 'thursday night football'],
    contextHint: 'NFL 정규시즌 개막 — 팀·선수·드래프트 결과 폭증',
  },
  {
    id: 'apple_event',
    emoji: '📱',
    labelKo: '애플 9월 이벤트',
    labelEn: 'Apple September Event',
    getRange: (y) => {
      const d = nthWeekday(y, 8, 2, 2)
      return { start: d, end: addDays(d, 7) }
    },
    leadupDays: 3,
    amplifiedCategories: ['tech'],
    triggerKeywords: ['iphone', 'apple watch', 'airpods', 'apple event'],
    contextHint: '신규 iPhone 공개·런칭 주간',
  },
  {
    id: 'emmys',
    emoji: '📺',
    labelKo: '에미 시상식',
    labelEn: 'Emmy Awards',
    getRange: (y) => {
      const d = nthWeekday(y, 8, 0, 3)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['emmy', 'emmys'],
    contextHint: 'TV·드라마 시상식 — 후보·수상 화제 집중',
    kContentImpact: {
      observation: 'TV·드라마 후보·수상·시리즈 검색 폭증',
      application: 'K-드라마(이정재 오징어게임 에미상 계보·더 글로리·기생수 등) 출품 부각 / 드라마 명대사 한국어 학습',
    },
  },

  // ── October ──
  {
    id: 'mlb_postseason',
    emoji: '⚾',
    labelKo: 'MLB 포스트시즌',
    labelEn: 'MLB Postseason',
    getRange: (y) => ({ start: utcDate(y, 9, 1), end: utcDate(y, 10, 5) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['world series', 'alcs', 'nlcs', 'wild card', 'mlb playoffs', 'postseason'],
    contextHint: '월드시리즈로 향하는 가을 야구',
  },
  {
    id: 'halloween',
    emoji: '🎃',
    labelKo: '핼러윈',
    labelEn: 'Halloween',
    getRange: (y) => ({ start: utcDate(y, 9, 31), end: utcDate(y, 9, 31) }),
    leadupDays: 14,
    amplifiedCategories: ['lifestyle', 'entertainment'],
    triggerKeywords: ['halloween', 'costume', 'horror movie', 'haunted', 'spooky', 'pumpkin', 'jack-o', 'jack o lantern'],
    contextHint: '코스튬·공포 콘텐츠·캔디·파티 검색 폭증',
    kContentImpact: {
      observation: '호러·스릴러·코스튬·공포 콘텐츠 검색 폭증',
      application: 'K 스릴러·복수극·좀비물(스위트홈·지옥·킹덤·올빼미·악인전) 노출 기회 확대 / "무서워·소름 끼친다·귀신" 등 호러·감정 표현 한국어 학습',
    },
  },

  // ── November ──
  {
    id: 'election_day',
    emoji: '🗳️',
    labelKo: '선거일',
    labelEn: 'Election Day',
    getRange: (y) => {
      // 짝수 해에만 의미. 홀수해는 of-range로 반환하여 매칭 안 되게.
      if (y % 2 !== 0) return { start: utcDate(y, 0, 1), end: utcDate(y, 0, 1) }
      const firstMon = nthWeekday(y, 10, 1, 1)
      const d = addDays(firstMon, 1)
      return { start: d, end: d }
    },
    leadupDays: 14,
    amplifiedCategories: ['politics', 'news'],
    triggerKeywords: ['election', 'voting', 'voter', 'ballot', 'polling station', 'polls close'],
    contextHint: '선거 시즌 — 후보·이슈·결과 관심 집중 (짝수 해)',
  },
  {
    id: 'veterans_day',
    emoji: '🎖️',
    labelKo: '재향군인의 날',
    labelEn: 'Veterans Day',
    getRange: (y) => ({ start: utcDate(y, 10, 11), end: utcDate(y, 10, 11) }),
    leadupDays: 1,
    amplifiedCategories: ['politics', 'lifestyle'],
    triggerKeywords: ['veterans day'],
    contextHint: '연방 공휴일 — 군·역사 추모 화제',
  },
  {
    id: 'thanksgiving',
    emoji: '🦃',
    labelKo: '추수감사절',
    labelEn: 'Thanksgiving',
    getRange: (y) => {
      const d = nthWeekday(y, 10, 4, 4)
      return { start: d, end: addDays(d, 3) } // includes Black Friday & weekend
    },
    leadupDays: 7,
    amplifiedCategories: ['lifestyle', 'sports', 'entertainment'],
    triggerKeywords: [
      'thanksgiving', 'turkey', 'stuffing', 'cranberry', 'pumpkin pie',
      "macy's parade", 'macys parade',
      'black friday', 'cyber monday', 'doorbuster',
    ],
    contextHint: '가족 요리·여행·NFL·블랙 프라이데이까지 미국 최대 쇼핑 시즌',
    kContentImpact: {
      observation: '가족·전통 음식·여행·쇼핑 검색 폭증',
      application: 'K-푸드 콘텐츠(전통 요리·잔치 음식) + 추석 비교 학습 콘텐츠 결합 / "가족·맛있어요·고마워요" 한국어 표현 학습',
    },
  },

  // ── December ──
  {
    id: 'christmas',
    emoji: '🎄',
    labelKo: '크리스마스 시즌',
    labelEn: 'Christmas Season',
    getRange: (y) => ({ start: utcDate(y, 11, 20), end: utcDate(y, 11, 26) }),
    leadupDays: 14,
    amplifiedCategories: ['lifestyle', 'entertainment'],
    triggerKeywords: ['christmas', 'santa', 'gift guide', 'mariah carey', 'home alone', 'elf on the shelf', 'hallmark'],
    contextHint: '선물·영화·캐롤·가족 모임 검색 집중',
    kContentImpact: {
      observation: '연말 로맨스 영화·캐롤·선물 가이드·가족 모임 검색 폭증',
      application: 'K 로맨스 드라마(연말 분위기 작품: 도깨비·내 남편과 결혼해줘 등) 큐레이션 / "메리 크리스마스·새해 복 많이 받으세요" 한국어 인사 학습',
    },
  },
  {
    id: 'nye',
    emoji: '🎇',
    labelKo: '연말',
    labelEn: "New Year's Eve",
    getRange: (y) => ({ start: utcDate(y, 11, 30), end: utcDate(y, 11, 31) }),
    leadupDays: 3,
    amplifiedCategories: ['lifestyle', 'entertainment'],
    triggerKeywords: ['new year eve', 'nye', "rockin' eve", 'ball drop'],
    contextHint: '카운트다운·파티·결산 콘텐츠 검색 증가',
  },

  // ── 모터스포츠 ──
  {
    id: 'daytona_500',
    emoji: '🏁',
    labelKo: '데이토나 500',
    labelEn: 'Daytona 500',
    // 일반적으로 2월 셋째 일요일 (NASCAR Speedweeks)
    getRange: (y) => {
      const d = nthWeekday(y, 1, 0, 3)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['daytona 500', 'daytona', 'nascar', 'speedweeks'],
    contextHint: 'NASCAR 시즌 개막 — 미국 모터스포츠 최대 이벤트',
  },
  {
    id: 'kentucky_derby',
    emoji: '🐎',
    labelKo: '켄터키 더비',
    labelEn: 'Kentucky Derby',
    // 5월 첫째 토요일
    getRange: (y) => {
      const d = nthWeekday(y, 4, 6, 1)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['sports', 'lifestyle'],
    triggerKeywords: ['kentucky derby', 'derby winner', 'churchill downs', 'mint julep', 'triple crown'],
    contextHint: '경마의 정점 + 패션·모자·전통 행사 — Run for the Roses',
  },
  {
    id: 'indy_500',
    emoji: '🏎️',
    labelKo: '인디 500',
    labelEn: 'Indianapolis 500',
    // 메모리얼 데이 일요일 (5월 마지막 일요일)
    getRange: (y) => {
      const d = lastWeekday(y, 4, 0)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['indy 500', 'indianapolis 500', 'indycar', 'brickyard'],
    contextHint: '인디카 최고 권위 — 메모리얼 데이 주말 전통',
  },
  {
    id: 'f1_season',
    emoji: '🏁',
    labelKo: 'F1 시즌',
    labelEn: 'Formula 1 Season',
    // F1 시즌은 대략 3월 첫째 주 ~ 12월 첫째 주
    getRange: (y) => ({ start: utcDate(y, 2, 1), end: utcDate(y, 11, 8) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['f1', 'formula 1', 'grand prix', 'verstappen', 'hamilton', 'leclerc', 'norris', 'mclaren f1', 'ferrari f1'],
    contextHint: 'F1 시즌 진행 중 — 매주 그랑프리 결과·드라이버·팀 화제',
  },

  // ── 테니스 메이저 ──
  {
    id: 'wimbledon',
    emoji: '🎾',
    labelKo: '윔블던',
    labelEn: 'Wimbledon Championships',
    // 6월 마지막 월요일 ~ 7월 둘째 일요일 (대략)
    getRange: (y) => {
      const startMon = lastWeekday(y, 5, 1)
      return { start: startMon, end: addDays(startMon, 13) }
    },
    leadupDays: 3,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['wimbledon', 'centre court', 'all england club'],
    contextHint: '테니스 메이저 — 잔디 코트의 권위, 전 세계 화제',
  },
  {
    id: 'us_open_tennis',
    emoji: '🎾',
    labelKo: 'US 오픈 (테니스)',
    labelEn: 'US Open Tennis',
    // 8월 마지막 월요일 ~ 9월 둘째 일요일
    getRange: (y) => {
      const startMon = lastWeekday(y, 7, 1)
      return { start: startMon, end: addDays(startMon, 13) }
    },
    leadupDays: 3,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['us open tennis', 'arthur ashe', 'flushing meadows', 'us open final'],
    contextHint: '미국 4대 메이저 테니스 대회 — 뉴욕에서 열리는 시즌 마지막 그랜드슬램',
  },

  // ── NBA·NHL 추가 시즌 ──
  {
    id: 'nba_playoffs',
    emoji: '🏀',
    labelKo: 'NBA 플레이오프',
    labelEn: 'NBA Playoffs',
    // 4월 중순 ~ 6월 초 (파이널 직전까지)
    getRange: (y) => ({ start: utcDate(y, 3, 15), end: utcDate(y, 4, 31) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['nba playoff', 'nba playoffs', 'play-in', 'play in tournament', 'eastern conference', 'western conference'],
    contextHint: 'NBA 포스트시즌 — 매 시리즈마다 팀·선수 화제 집중',
  },
  {
    id: 'nhl_playoffs',
    emoji: '🏒',
    labelKo: 'NHL 플레이오프',
    labelEn: 'NHL Playoffs',
    // 4월 중순 ~ 5월 말 (Stanley Cup Finals 직전까지)
    getRange: (y) => ({ start: utcDate(y, 3, 15), end: utcDate(y, 4, 24) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['nhl playoff', 'nhl playoffs', 'nhl bracket', 'playoff bracket'],
    contextHint: 'NHL 포스트시즌 1·2라운드 — 컨퍼런스 파이널까지',
  },
  {
    id: 'stanley_cup',
    emoji: '🏒',
    labelKo: '스탠리컵 파이널',
    labelEn: 'Stanley Cup Finals',
    // 5월 말 ~ 6월 중순
    getRange: (y) => ({ start: utcDate(y, 4, 25), end: utcDate(y, 5, 22) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['stanley cup', 'stanley cup final', 'conn smythe'],
    contextHint: 'NHL 챔피언십 시리즈 — 북미 하키 정점',
  },

  // ── 추가 시상식·페스티벌 ──
  {
    id: 'sundance',
    emoji: '🎥',
    labelKo: '선댄스 영화제',
    labelEn: 'Sundance Film Festival',
    // 1월 셋째 목요일 ~ 그 다음 일요일 (10일)
    getRange: (y) => {
      const d = nthWeekday(y, 0, 4, 3)
      return { start: d, end: addDays(d, 10) }
    },
    leadupDays: 3,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['sundance', 'park city film'],
    contextHint: '독립영화제 — 신작·신인 감독 화제',
    kContentImpact: {
      observation: '독립영화·신인 감독·신작 검색 증가',
      application: 'K 독립영화·신예 감독(셀린 송 패스트 라이브즈 계보) 출품작 노출 / 영화 명대사·감독 인터뷰 한국어 학습',
    },
  },
  {
    id: 'sxsw',
    emoji: '🎤',
    labelKo: 'SXSW',
    labelEn: 'South by Southwest',
    // 3월 둘째 금요일 ~ 그 다음 일요일 (10일)
    getRange: (y) => {
      const d = nthWeekday(y, 2, 5, 2)
      return { start: d, end: addDays(d, 9) }
    },
    leadupDays: 5,
    amplifiedCategories: ['tech', 'entertainment'],
    triggerKeywords: ['sxsw', 'south by southwest', 'austin festival'],
    contextHint: '오스틴 — 음악·영화·테크 페스티벌의 교차점',
    kContentImpact: {
      observation: '신인 아티스트·신작 영화·스타트업·테크 트렌드 검색 증가',
      application: 'K-팝 신인·K-인디 음악·K-영화 출품 부각 / 음악 가사·아티스트 인터뷰·영화 대사 한국어 학습',
    },
  },
  {
    id: 'tony_awards',
    emoji: '🎭',
    labelKo: '토니 시상식',
    labelEn: 'Tony Awards',
    // 6월 둘째 일요일
    getRange: (y) => {
      const d = nthWeekday(y, 5, 0, 2)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['tony awards', 'tony award'],
    contextHint: '브로드웨이 시상식 — 뮤지컬·연극 화제',
  },
  {
    id: 'bet_awards',
    emoji: '🎤',
    labelKo: 'BET 어워드',
    labelEn: 'BET Awards',
    // 6월 마지막 일요일
    getRange: (y) => {
      const d = lastWeekday(y, 5, 0)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['bet awards'],
    contextHint: '흑인 음악·문화 시상식 — R&B·힙합 아티스트 화제',
  },
  {
    id: 'mtv_vmas',
    emoji: '📀',
    labelKo: 'MTV VMA',
    labelEn: 'MTV Video Music Awards',
    // 8월 말 ~ 9월 초 일요일 (대략 8월 넷째 일요일)
    getRange: (y) => {
      const d = nthWeekday(y, 7, 0, 4)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['mtv vma', 'mtv vmas', 'video music awards', 'moonman'],
    contextHint: '뮤직 비디오 시상식 — 무대·퍼포먼스·패션 화제',
    kContentImpact: {
      observation: '뮤직 비디오·무대 퍼포먼스·아티스트 패션 검색 폭증',
      application: 'K-팝 아티스트 후보·수상 부각 (BLACKPINK·BTS·SEVENTEEN·뉴진스 등) / 뮤직 비디오 가사·안무 가사 한국어 학습',
    },
  },
  {
    id: 'cma_awards',
    emoji: '🤠',
    labelKo: 'CMA 시상식',
    labelEn: 'CMA Awards',
    // 11월 둘째 수요일
    getRange: (y) => {
      const d = nthWeekday(y, 10, 3, 2)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['cma awards', 'country music awards'],
    contextHint: '컨트리 음악 시상식 — 미국 남부·중부 핵심 화제',
  },
  {
    id: 'ama_awards',
    emoji: '🎵',
    labelKo: 'AMA 시상식',
    labelEn: 'American Music Awards',
    // 11월 셋째 일요일
    getRange: (y) => {
      const d = nthWeekday(y, 10, 0, 3)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['entertainment'],
    triggerKeywords: ['american music awards', 'ama awards'],
    contextHint: '대중 음악 종합 시상식 — 빌보드 차트 기반 후보',
    kContentImpact: {
      observation: '빌보드 차트 기반 후보·수상 검색 증가',
      application: 'K-팝 빌보드 차트 진입 부각 (BTS·BLACKPINK·뉴진스·스트레이키즈 등) / 수상곡·차트인 곡 가사 한국어 학습',
    },
  },
  {
    id: 'game_awards',
    emoji: '🎮',
    labelKo: '더 게임 어워드',
    labelEn: 'The Game Awards',
    // 12월 첫째 또는 둘째 목요일
    getRange: (y) => {
      const d = nthWeekday(y, 11, 4, 2)
      return { start: d, end: d }
    },
    leadupDays: 5,
    amplifiedCategories: ['tech', 'entertainment'],
    triggerKeywords: ['game awards', 'goty', 'game of the year', 'tga'],
    contextHint: '게임 업계 최대 시상식 — GOTY·신작 발표 화제',
  },

  // ── 장기 시즌 (broad amplifier) ──
  {
    id: 'nfl_season',
    emoji: '🏈',
    labelKo: 'NFL 정규시즌',
    labelEn: 'NFL Regular Season',
    getRange: (y) => ({ start: utcDate(y, 8, 5), end: utcDate(y + 1, 0, 6) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: [
      'monday night football', 'sunday night football', 'thursday night football',
      'red zone', 'fantasy football',
    ],
    contextHint: '매주 경기 결과·부상·팀 순위 관심 지속',
  },
  {
    id: 'nfl_playoffs',
    emoji: '🏆',
    labelKo: 'NFL 플레이오프',
    labelEn: 'NFL Playoffs',
    getRange: (y) => ({ start: utcDate(y, 0, 6), end: utcDate(y, 1, 12) }),
    leadupDays: 0,
    amplifiedCategories: ['sports'],
    triggerKeywords: ['nfl playoff', 'wild card', 'divisional round', 'conference championship', 'afc championship', 'nfc championship'],
    contextHint: '슈퍼볼로 향하는 토너먼트 — 매 주말 화제 집중',
  },
]

// ── Active 이벤트 감지 ─────────────────────────────────────
export interface ActiveEvent {
  id: string
  emoji: string
  labelKo: string
  labelEn: string
  contextHint: string
  amplifiedCategories: TrendCategory[]
  triggerKeywords: string[]
  /** 시작일까지 남은 일수 (음수=지남, 0=오늘 시작, 양수=다가옴) */
  daysUntil: number
  status: 'leadup' | 'active' | 'tail'
  kContentImpact?: KContentImpact
}

export function getActiveEvents(now: Date = new Date()): ActiveEvent[] {
  const todayUTC = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const result: ActiveEvent[] = []
  const seen = new Set<string>()

  // 12월→1월 경계 처리: 전·당·익년 모두 검사
  for (const yr of [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    for (const ev of US_EVENTS) {
      if (seen.has(ev.id)) continue
      const { start, end } = ev.getRange(yr)
      const leadStart = addDays(start, -ev.leadupDays)
      const tailEnd = addDays(end, 2) // 이벤트 후 2일까지 후속 검색 인정 (월요일 결과 검색 등)

      if (todayUTC >= leadStart && todayUTC <= tailEnd) {
        const dayMs = 24 * 3600 * 1000
        const daysUntil = Math.round((start.getTime() - todayUTC.getTime()) / dayMs)
        let status: 'leadup' | 'active' | 'tail'
        if (todayUTC < start) status = 'leadup'
        else if (todayUTC <= end) status = 'active'
        else status = 'tail'

        result.push({
          id: ev.id,
          emoji: ev.emoji,
          labelKo: ev.labelKo,
          labelEn: ev.labelEn,
          contextHint: ev.contextHint,
          amplifiedCategories: ev.amplifiedCategories,
          triggerKeywords: ev.triggerKeywords,
          daysUntil,
          status,
          kContentImpact: ev.kContentImpact,
        })
        seen.add(ev.id)
      }
    }
  }

  // 정렬: active > leadup(가까운 순) > tail
  result.sort((a, b) => {
    const order = { active: 0, leadup: 1, tail: 2 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return Math.abs(a.daysUntil) - Math.abs(b.daysUntil)
  })

  return result
}

/** 트렌드 아이템에 매칭되는 이벤트의 상태를 자연어 phase로 변환 */
export function eventPhaseLabel(ev: ActiveEvent): string {
  if (ev.status === 'leadup') {
    return ev.daysUntil === 0
      ? `오늘 시작하는`
      : ev.daysUntil === 1
      ? `내일`
      : `${ev.daysUntil}일 앞둔`
  }
  if (ev.status === 'active') return '진행 중인'
  return '직후의'
}
