export type SourceType = 'reddit'
export type ContentType = 'drama' | 'movie' | 'variety' | 'unknown'
export type ReportType = 'daily' | 'weekly'

export interface RedditPost {
  id: string
  subreddit: string
  title: string
  selftext?: string
  url: string
  imageUrl?: string
  score: number
  commentCount: number
  createdAt: string
  comments: RedditComment[]
  flair?: string
}

export interface RedditComment {
  id: string
  body: string
  bodyKo?: string                // 한국어 번역 (Groq AI)
  score: number
  depth: number
}

export interface NormalizedItem {
  rawTitle: string
  normalizedTitle: string
  tokens: string[]
  source: SourceType
  platform?: string
  region?: string
  score: number
  mentionCount: number
  commentCount: number
  timestamp: string
  metadata: Record<string, unknown>
}

export interface ContentCluster {
  clusterId: string
  representativeTitle: string
  aliases: string[]
  contentType: ContentType
  sources: SourceType[]
  platforms: string[]
  regions: string[]
  totalScore: number
  mentionScore: number
  engagementScore: number
  recencyScore: number
  finalScore: number
  rawItems: NormalizedItem[]
  topComments: string[]
  firstSeen: string
  lastSeen: string
  isKContent: boolean
  actors: string[]
  genres: string[]
}

export interface InsightSentence {
  category: 'rising' | 'dominant' | 'newcomer' | 'declining' | 'actor' | 'genre' | 'regional'
  text: string
  evidence: string[]
  score: number
}

export interface RedditCategorySummary {
  recommendations: { title: string; count: number }[]
  reviews: { title: string; sentiment: 'positive' | 'mixed' | 'negative'; count: number }[]
  actorMentions: { name: string; count: number; context: string }[]
  culturalQuestions: { topic: string; count: number }[]
  hotPosts: RedditPost[]
}

export interface RankedReport {
  id: string
  reportType: ReportType
  generatedAt: string
  period: { from: string; to: string }
  topContents: ContentCluster[]
  topByPlatform: Record<string, ContentCluster[]>
  topByRegion: Record<string, ContentCluster[]>
  insights: InsightSentence[]
  sourceSummary: { source: SourceType; itemCount: number; crawledAt: string }[]
  redditSummary?: RedditCategorySummary
  filterStats?: FilterStats
  trends?: {
    content: ContentTrend
    sentiment: SentimentTrend
    behavior: BehaviorTrend
  }
  subredditInsights?: SubredditInsight[]
  deepAnalysis?: DeepAnalysis[]
  koreanInsights?: KoreanInsight[]
  redditCrawlMeta?: {
    cutoffLabel: string                          // "24h" | "48h" | "7d"
    fallbackUsed: boolean
    rawCounts: { '24h': number; '48h': number; '7d': number }
  }
}

export interface PipelineInput {
  redditPosts?: RedditPost[]
  reportType?: ReportType
  filterOptions?: FilterOptions
  extraKnownDramaTitles?: string[]   // MDL 현재 방영작 등 동적 매칭 추가 (analyzeContentTrend로 전달)
}

// ============================================================
// 6단계 파이프라인 신규 타입
// ============================================================

export interface FilterOptions {
  minTextLength?: number       // 기본 20
  removePromotional?: boolean  // 기본 true
  removeNoComments?: boolean   // 기본 false (선택)
}

export interface FilterStats {
  before: number
  after: number
  removed: {
    tooShort: number
    promotional: number
    noComments: number
    duplicate: number
  }
}

export interface ContentTrend {
  topContents: { title: string; count: number }[]
  topActors: { name: string; count: number }[]
  topKeywords: { keyword: string; count: number }[]
}

export interface SentimentTopic {
  topic: string             // 한국어 라벨 (예: "캐릭터 감정선")
  topicKey: string          // 내부 키 (예: "character_emotion")
  count: number             // 해당 (감정, 토픽) 매칭 게시글 수
  representative: string    // 대표 인용문 (원문)
}

export interface SentimentTrend {
  positive: number
  negative: number
  neutral: number
  total: number
  positiveRatio: number
  negativeRatio: number
  neutralRatio: number
  byTopics?: {
    positive: SentimentTopic[]
    negative: SentimentTopic[]
    neutral: SentimentTopic[]
  }
}

export type BehaviorType = 'recommendation' | 'review' | 'question' | 'discussion'

export interface BehaviorTrend {
  recommendation: number
  review: number
  question: number
  discussion: number
  total: number
  ratios: Record<BehaviorType, number>
}

export interface SubredditInsight {
  subreddit: string
  postCount: number
  characteristic: string
  topBehavior: BehaviorType
  sentiment: { positive: number; negative: number; neutral: number }
}

export type OpinionType = 'praise' | 'criticism' | 'question' | 'recommendation'

export type DebateOpinionDirection = 'positive' | 'negative' | 'mixed' | 'discussion'

export interface DebateRepresentative {
  body: string
  bodyKo?: string                // 한국어 번역 (Groq AI)
  score: number
  sentiment: 'positive' | 'negative' | 'neutral'
}

export interface DebateTopic {
  topic: string                    // "캐릭터 행동의 개연성 논쟁"
  description: string              // "특정 장면에서 캐릭터의 선택이 자연스러운지에 대한 논의"
  opinionDirection: DebateOpinionDirection
  opinionDistribution: { positive: number; negative: number; neutral: number; mixedLabel: string }
  context: string                  // 사람들이 왜 이 주제를 이야기하는지 (맥락)
  representatives: DebateRepresentative[]
  interpretation: string           // "팬들 사이에서 X에 대한 의견이 갈리고 있음"
  count: number
}

export interface DeepAnalysis {
  postId: string
  title: string
  titleKo?: string               // 한국어 번역 (Groq AI)
  url: string
  imageUrl?: string
  subreddit: string
  score: number
  commentCount: number
  summary: string
  sentiment: { positive: number; negative: number; positiveRatio: number; negativeRatio: number }
  opinionTypes: Record<OpinionType, number>
  topComments: RedditComment[]
  reactionCause: string
  commentDebates: DebateTopic[]
  sentimentSummary: string
  popularityReason: string
}

export interface KoreanInsight {
  category: 'trend_summary' | 'fan_reaction' | 'consumption_pattern' | 'expansion' | 'subreddit'
  text: string                  // 호환용 — observation + interpretation + action 합본
  observation?: string          // [핵심 인사이트] 데이터 기반 관찰
  interpretation?: string       // [해석] 사용자/행동 관점
  action?: string               // [💡 액션 제안] 앱 기능/UX 개선
  evidence?: string[]
}

// ============================================================
// MyDramaList (MDL) — Top airing K-드라마 + 리뷰 분석
// ============================================================

export interface MdlReviewRatings {
  overall: number
  story?: number
  acting?: number
  music?: number
  rewatch?: number
}

export interface MdlReview {
  username: string
  helpful: number
  ratings: MdlReviewRatings
  status?: 'Ongoing' | 'Completed' | 'Dropped' | string
  episodesWatched?: string
  daysAgo?: string
  title?: string
  body: string
  bodyKo?: string                // 한국어 번역 (Groq AI)
}

export interface MdlComment {
  id: string                     // post-XXXXXX (DOM id)
  username: string
  body: string
  likes: number                  // btn-like 카운트
  daysAgo?: string               // "3 minutes ago" / "an hour ago"
  isReply: boolean               // tl-container(threadline) 존재 시 true
}

export interface MdlDrama {
  slug: string
  title: string
  nativeTitle?: string           // 한국어 원제 (예: "21세기 대군부인")
  url: string
  rating: number
  posterUrl?: string
  episodes?: number
  year?: number
  description?: string
  reviews: MdlReview[]
  comments?: MdlComment[]        // 작품 메인 페이지의 Comments 섹션 (시청자 raw 반응)
}

export interface MdlDramaAnalysis {
  drama: {
    slug: string
    title: string
    nativeTitle?: string
    url: string
    rating: number
    posterUrl?: string
    episodes?: number
    year?: number
    description?: string
    reviewCount: number
  }
  reviewSentiment: {
    positive: number
    negative: number
    neutral: number
    positiveRatio: number
    negativeRatio: number
  }
  sentimentSummary: string
  ratingBreakdown: {
    avgOverall: number
    avgStory?: number
    avgActing?: number
    avgMusic?: number
    avgRewatch?: number
    distribution: { '9-10': number; '7-9': number; '5-7': number; 'below5': number }
  }
  reviewDebates: DebateTopic[]
  popularityReason: string
  representativeReviews: { username: string; rating: number; helpful: number; body: string; bodyKo?: string; sentiment: 'positive' | 'negative' | 'neutral' }[]
  polarized: boolean             // 평가 분열 (평점 vs 리뷰 톤 불일치)
  polarizedReason?: string       // 분열로 판정된 이유 (UI 툴팁용)
  commentInsights?: {            // 시청자 즉각 반응 (코멘트만 별도 분석)
    commentCount: number
    sentiment: { positive: number; negative: number; positiveRatio: number; negativeRatio: number }
    sentimentSummary: string
    debates: DebateTopic[]
    topLiked: { username: string; likes: number; daysAgo?: string; body: string; bodyKo?: string; sentiment: 'positive' | 'negative' | 'neutral'; isReply: boolean }[]
  }
}

export interface MdlSummary {
  fetchedAt: string
  cached: boolean
  expiresAt: string
  dramas: MdlDramaAnalysis[]
  aggregate: {
    avgRating: number
    topPraisedTopic?: string
    topCriticizedTopic?: string
    overallSentimentSummary: string
  }
}

// ============================================================
// Google Trends — 북미 거시 트렌드 + K-콘텐츠 비교
// ============================================================

export type TrendCategory =
  | 'sports' | 'entertainment' | 'tech' | 'politics' | 'finance'
  | 'kcontent' | 'lifestyle' | 'news' | 'other'

export interface GTrendsEventContext {
  eventId: string                // "thanksgiving" 등 UsEvent.id
  emoji: string                  // "🦃"
  labelKo: string                // "추수감사절"
  matchedKeyword: string         // 트렌드 제목·뉴스에서 매칭된 트리거 키워드
  reason: string                 // 트렌드와 직접 연결된 자연어 설명
}

export interface GTrendsItem {
  title: string                  // 검색어
  traffic: string                // "2000+" 등
  trafficValue: number           // 정렬용 숫자 (2000)
  publishedAt?: string
  pictureSource?: string
  newsItems: { title: string; source: string; url: string }[]
  category: TrendCategory
  isKContent: boolean
  kKeywords?: string[]           // 매칭된 K 키워드 (있으면)
  eventContext?: GTrendsEventContext  // 미국 공휴일·시즌·이벤트 매칭 (직접 키워드 매칭 시만)
}

export interface GTrendsCategoryStat {
  category: TrendCategory
  label: string                  // 한글 라벨
  count: number
  totalTraffic: number
}

export interface GTrendsKContentImpact {
  observation: string            // 📊 이벤트로 인한 검색 변화
  application: string            // 💡 K-콘텐츠/한국어 학습 활용 시사점
}

export interface GTrendsActiveEvent {
  id: string
  emoji: string
  labelKo: string
  labelEn: string
  contextHint: string
  daysUntil: number              // 음수=지남, 0=오늘 시작, 양수=다가옴
  status: 'leadup' | 'active' | 'tail'
  amplifiedCategories: TrendCategory[]
  kContentImpact?: GTrendsKContentImpact  // 강한 연결 이벤트만 채워짐
}

export interface GTrendsSummary {
  fetchedAt: string
  cached: boolean
  expiresAt: string
  geo: string                    // 'US'
  totalItems: number
  topItems: GTrendsItem[]        // 전체 (카테고리 분류 포함)
  kItems: GTrendsItem[]          // K-콘텐츠만 필터
  categoryStats: GTrendsCategoryStat[]
  activeEvents: GTrendsActiveEvent[]  // 현재 활성화된 미국 공휴일·시즌·이벤트 (오늘 기준)
  oneLineSummary: string         // "현재 북미에서 무엇이 화제인지" 한 줄
  kInsight: string               // K-콘텐츠 위치 분석 (자연어)
  comparison: string             // 비교 인사이트 (자연어)
}

// ============================================================
// YouTube SNS 버즈 분석
// ============================================================

export type YoutubeContentType = 'scene' | 'meme' | 'actor' | 'edit' | 'review' | 'reaction' | 'other'

export interface YoutubeComment {
  author: string
  text: string
  likes: number
  replyCount?: number    // 답글 수 (토론 핫스팟 식별용)
}

export type YoutubeChannelType = 'official' | 'influencer' | 'community'

export interface YoutubeVideo {
  id: string
  title: string
  channel: string
  channelVerified?: boolean
  thumbnail?: string
  views: number
  viewsText: string             // "902K views"
  likes?: number
  duration?: string
  publishedText?: string
  description?: string
  commentCount?: number          // YouTube 측 총 댓글 수 (engagement score 계산용)
  hashtag: string                // 해당 영상이 잡힌 해시태그
  contentType: YoutubeContentType
  channelType: YoutubeChannelType  // official / influencer / community
  isOfficial: boolean            // (호환용) channelType === 'official'
  comments: YoutubeComment[]
}

export interface YoutubeContentTypeStat {
  type: YoutubeContentType
  label: string                  // "🎬 명장면 클립"
  count: number
  totalViews: number
}

export interface YoutubeTopComment {
  text: string
  textKo?: string                // 한국어 번역 (Groq AI, 캐시됨)
  author: string
  likes: number
  replyCount?: number            // 답글 수 (토론 핫스팟)
  videoTitle: string
  videoId: string
  videoChannel: string
}

export interface YoutubeQuotedPhrase {
  phrase: string                 // 원문 catchphrase
  phraseKo?: string              // 한국어 번역 (Groq AI)
  count: number                  // 등장 빈도
  sampleVideoTitle: string
}

export interface YoutubeLanguageStat {
  lang: string                   // ISO 639-1 코드 ('en','ko','es', ...)
  flag: string                   // 🇺🇸
  label: string                  // 'English'
  count: number                  // 댓글 수
  percent: number                // 0-100
}

export interface YoutubeContentGroup {
  title: string                  // 정규화된 작품명 (예: "If Wishes Could Kill")
  videoCount: number
  totalViews: number
  totalLikes: number
  totalComments: number          // commentCount 합산 (없으면 comments.length)
  topVideoId: string
  topVideoTitle: string
  topVideoThumbnail?: string
  topComments: YoutubeTopComment[]  // 이 작품 영상들의 댓글 중 좋아요 TOP 2
  discussionHotspot?: YoutubeTopComment  // 답글 가장 많은 댓글 (토론 중심)
  quotedPhrases: YoutubeQuotedPhrase[]  // 자주 인용·반복되는 catchphrase TOP 5
  languageDistribution: YoutubeLanguageStat[]  // 댓글 언어 분포 (글로벌 팬 지형)
  matchSource: 'known' | 'trailer-pattern' | 'show-name'
}

export interface YoutubePhrase {
  phrase: string
  count: number
}

export interface YoutubeChannelTypeStat {
  channelType: YoutubeChannelType
  label: string                  // "✓ 공식 (Netflix·방송사)" / "🎤 인플루언서 (리뷰어)"
  count: number
  totalViews: number
}

export interface YoutubeSummary {
  fetchedAt: string
  cached: boolean
  expiresAt: string
  totalVideos: number
  totalComments: number
  searchedHashtags: string[]

  // 1. 인기 콘텐츠 TOP
  topVideos: YoutubeVideo[]      // 조회수 정렬 상위

  // 2. 콘텐츠 유형 분포
  contentTypeStats: YoutubeContentTypeStat[]

  // 2-2. 채널 타입 분포 (공식 vs 인플루언서)
  channelTypeStats: YoutubeChannelTypeStat[]

  // 3. 발화 내용 (제목·설명에서 반복 phrase)
  topPhrases: YoutubePhrase[]

  // 4. 작품별 화제도 (영상 → 작품 단위 집계)
  contentGroups: YoutubeContentGroup[]

  // 5. 가장 공감 받은 댓글 TOP 10 (좋아요순)
  topComments: YoutubeTopComment[]
}

// ============================================================
// TikTok SNS 버즈
// ============================================================

export type TikTokChannelType = 'official' | 'creator' | 'community'

export interface TikTokAuthor {
  id: string
  uniqueId: string                // @username
  nickname: string
  avatar?: string
  verified?: boolean
  followerCount?: number
  signature?: string              // 프로필 소개
}

export interface TikTokSound {
  id: string
  title: string
  authorName: string
  duration?: number
  original?: boolean
  cover?: string
}

export interface TikTokComment {
  text: string
  textKo?: string
  author: string
  likes: number
}

export interface TikTokVideo {
  id: string
  description: string
  url: string
  cover?: string
  duration: number                // seconds
  views: number
  likes: number
  shares: number
  commentCount: number
  saved: number                   // collectCount
  publishedAt: string             // ISO
  author: TikTokAuthor
  sound?: TikTokSound
  comments: TikTokComment[]
  hashtags: string[]
  channelType: TikTokChannelType
}

export interface TikTokTopComment {
  text: string
  textKo?: string
  author: string
  likes: number
  videoId: string
  videoUrl: string
  videoDescription: string        // 어느 영상의 댓글인지 컨텍스트
}

export interface TikTokContentGroup {
  title: string
  videoCount: number
  totalViews: number
  totalLikes: number
  totalShares: number
  totalComments: number
  topVideoId: string
  topVideoUrl: string
  topVideoCover?: string
  topVideoDescription: string
  topComments: TikTokTopComment[]
  matchSource: 'known' | 'caption-pattern' | 'show-name'
}

export interface TikTokTrendingSound {
  id: string
  title: string
  authorName: string
  cover?: string
  videoCount: number              // 우리 데이터셋 내 사용 영상 수
  totalViews: number
  sampleVideoId: string
  sampleVideoUrl: string
  sampleVideoDescription: string
}

export interface TikTokTopCreator {
  author: TikTokAuthor
  videoCount: number
  totalViews: number
  totalLikes: number
  topVideoId: string
  topVideoUrl: string
  topVideoDescription: string
}

export interface TikTokSummary {
  fetchedAt: string
  cached: boolean
  expiresAt: string
  totalVideos: number
  totalComments: number
  searchedKeywords: string[]
  topVideos: TikTokVideo[]                // engagement 정렬
  contentGroups: TikTokContentGroup[]     // 작품별 화제도 6개
  trendingSounds: TikTokTrendingSound[]   // 사운드 재사용 TOP 8
  topCreators: TikTokTopCreator[]         // 크리에이터 랭킹 TOP 8
  diagnostics?: TikTokDiagnostics         // 깔때기 손실 추적 (optional — 구버전 캐시 호환)
}

export interface TikTokDiagnostics {
  keywordResults: { keyword: string; ok: boolean; rawCount: number }[]  // 키워드별 검색 성공·아이템 수
  stageDrops: {
    rawTotal: number          // 검색 raw 총합
    afterDedup: number        // id dedup 후
    afterDateFilter: number   // 60일 필터 후
    afterFilter1: number      // 채널·1차 K-content 필터 후
    afterFilter2: number      // 2차 K-content 필터 (description+sound) 후
    final: number             // topN 컷 후
  }
  appliedDateWindowDays: number
}

// ============================================================
// Instagram SNS 버즈 (Reel 기반)
//   * 공개 hashtag 페이지 + Reel 상세 페이지를 사용자 cookie 세션으로 Playwright 탐색
//   * 카테고리당 max 2개 Reel (봇 탐지 리스크 완화)
// ============================================================

export type InstagramChannelType = 'official' | 'creator' | 'community'
export type InstagramCategory = 'kdrama' | 'kmovie' | 'kvariety'

export interface InstagramAuthor {
  username: string                // @handle (URL의 첫 path segment 또는 카드 첫 줄)
  displayName?: string
  avatar?: string
  verified?: boolean
}

export interface InstagramComment {
  text: string
  textKo?: string
  author: string
  approxLikes: number             // visible like 수가 안정적이지 않아 fallback 점수 (40/32/24…)
}

export interface InstagramReel {
  id: string                      // shortcode (URL 마지막 segment)
  url: string
  caption: string
  // ── 카운트 필드 (2026-05-08: 분리) ──
  views: number                   // [deprecated] 구버전 호환용. likeCount와 동일값.
  likeCount: number               // og:description "X likes" 파싱
  commentCount: number            // og:description "Y comments" 파싱 (실제 총 댓글 수)
  viewCount?: number              // best-effort (JSON-LD interactionStatistic.WatchAction). 추출 실패 시 undefined
  publishedAt?: string
  author: InstagramAuthor
  hashtags: string[]
  channelType: InstagramChannelType
  category: InstagramCategory
  tag: string                     // 진입한 hashtag (디버깅·필터)
  comments: InstagramComment[]    // 본문에서 추출된 발췌 댓글 (≤3, MAX_COMMENT_LINES_TO_KEEP)
  capturePath?: string            // 정적 경로 ("/static/captures/instagram-….png")
  // ── 분석 단계에서 enrich되는 필드 (모두 optional — 구버전 캐시 호환) ──
  extractedTitle?: string         // null 매칭이면 "작품 미확인 릴스"로 분류
  reactionTypes?: string[]        // ['커플 케미형', '로맨스 설정형'] — 최대 2개
  shortCaption?: string           // 첫 문장 또는 ≤120자 단축
  keyPhrase?: string              // 카드 헤드라인 ("…" 따옴표 안)
  // ── Stage 3 deep-crawl 결과 (top 3 reel만 채워짐, 2026-05-08 #4 4-stage funnel) ──
  deepComments?: InstagramComment[]               // GraphQL intercept로 받은 ~50개
  deepCommentSampledAt?: string                    // ISO timestamp
  deepCommentTotalFetched?: number                 // 실측 (50 미달 가능)
  reactionSummary?: string[]                       // 한국어 2~3 bullet 자동 요약
  representativeComments?: InstagramComment[]      // deep 중 likes top 3
  isTop10?: boolean                                // 글로벌 top 10 마킹
  isTop3Deep?: boolean                             // deep crawl 대상 마킹
}

export interface InstagramTopComment {
  text: string
  textKo?: string
  author: string
  approxLikes: number
  reelId: string
  reelUrl: string
  reelCaption: string
}

export interface InstagramContentGroup {
  title: string
  reelCount: number
  totalViews: number
  totalComments: number
  topReelId: string
  topReelUrl: string
  topReelCaption: string
  topReelCapturePath?: string
  topComments: InstagramTopComment[]
  matchSource: 'known' | 'caption-pattern' | 'explicit-pattern' | 'unknown'
  reactionTypes?: string[]            // 그룹 대표 반응 유형 (소속 reel들 union)
  discoveredTags?: string[]           // 이 그룹에 속한 reel들이 발견된 hashtag (max 4개)
  // ── 2026-05-12 뾰족화 추가 (optional) ──
  reactionMix?: { label: string; count: number; pct: number }[]   // 작품 안에서 각 반응의 비율
  dominantReaction?: { label: string; pct: number }                // 최상위 반응 (UI 헤드라인용)
  engagementClass?: 'passive' | 'active' | 'mid'                   // comment/view 비율 기반
}

// ── 2026-05-12 신규: 뾰족한 인사이트용 분석 결과 타입 ──
export interface InstagramPolarizationSignal {
  reelId: string
  polarized: boolean
  likesVariance: number                        // log 스케일 normalized 분산
  agreementCount: number                       // 긍정 표현 댓글 수
  disagreementCount: number                    // 부정 표현 댓글 수
  topDisagreement?: { text: string; textKo?: string; approxLikes: number }
}

export interface InstagramEmergingTrend {
  title: string
  candidateCount: number                       // candidatePool 내 등장 reel 수
  sampleReelUrl?: string
  sampleCaption?: string
}

export interface InstagramSummary {
  fetchedAt: string
  cached: boolean
  expiresAt: string
  totalReels: number
  totalComments: number
  searchedTags: string[]
  topReels: InstagramReel[]            // 글로벌 top 10 (Stage 2 결과)
  contentGroups: InstagramContentGroup[]
  topComments: InstagramTopComment[]
  warnings: string[]                   // 카드 안내 텍스트 (예: "공개 인기 태그 표면 기준")
  // ── 신규 분석 필드 (optional — 구버전 캐시 호환) ──
  reactionPoints?: { label: string; count: number; sampleText?: string }[]
  repeatedPhrases?: { phrase: string; count: number }[]
  // ── 4-stage funnel (2026-05-08 #4) ──
  candidatePool?: InstagramReel[]      // Stage 1 통과 전체 (~30~55) — 🏆 작품 언급 순위 집계용
  // ── 2026-05-12 뾰족화 추가 (모두 optional, 구버전 캐시 호환) ──
  polarizationSignals?: InstagramPolarizationSignal[]      // top 3 reel 양극화 (deep crawl된 것만)
  emergingTrends?: InstagramEmergingTrend[]                // candidatePool 미시 트렌드
}
