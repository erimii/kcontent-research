export type SourceType = 'reddit'
export type ContentType = 'drama' | 'movie' | 'variety' | 'unknown'
export type ReportType = 'daily' | 'weekly'

export interface RedditPost {
  id: string
  subreddit: string
  title: string
  selftext?: string
  url: string
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
}

export interface GTrendsCategoryStat {
  category: TrendCategory
  label: string                  // 한글 라벨
  count: number
  totalTraffic: number
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

export interface YoutubeReactionPattern {
  pattern: string                // "OMG", "crying", "where to watch"
  label: string                  // "감정 폭발", "정보 요청"
  category: 'emotion' | 'empathy' | 'info_request' | 'praise' | 'criticism'
  count: number
  examples: string[]             // 대표 댓글 인용 (1~2개)
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

  // 4. 댓글 반응 패턴
  reactionPatterns: YoutubeReactionPattern[]

  // 5. 인사이트 (자연어)
  buzzInsight: string            // "토론 → 밈 → 확산" 흐름 해석
  fandomFlowInsight: string      // 팬덤 → 외부 확산 분석
  oneLineSummary: string         // 한 줄 요약
}
