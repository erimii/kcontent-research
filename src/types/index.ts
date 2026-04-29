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
}

export interface PipelineInput {
  redditPosts?: RedditPost[]
  reportType?: ReportType
  filterOptions?: FilterOptions
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
  text: string
  evidence?: string[]
}
