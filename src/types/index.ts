// ============================================================
// 공통 타입 정의
// ============================================================

export type SourceType = 'reddit' | 'flixpatrol' | 'mydramalist' | 'letterboxd' | 'fundex' | 'google_trends'
export type ContentType = 'drama' | 'movie' | 'variety' | 'unknown'
export type ReportType = 'daily' | 'weekly'

// ============================================================
// 크롤링 원본 데이터
// ============================================================

export interface RedditPost {
  id: string
  subreddit: string
  title: string
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

export interface FlixPatrolEntry {
  rank: number
  title: string
  platform: string   // netflix, disney, apple, etc.
  region: string     // US, Global, KR, etc.
  points: number
  previousRank?: number
  isKContent: boolean
  url?: string
}

export interface MyDramaListEntry {
  rank: number
  title: string
  year?: number
  rating: number
  votes: number
  episodes?: number
  genres: string[]
  actors: string[]
  url: string
}

export interface LetterboxdEntry {
  title: string
  reviewCount: number
  averageRating: number
  recentReviews: string[]
  url: string
}

export interface FundexEntry {
  rank: number
  title: string
  type: 'content' | 'artist'
  score: number
  change: number
  url?: string
}

// ============================================================
// 정규화된 아이템 (파이프라인 중간 단계)
// ============================================================

export interface NormalizedItem {
  rawTitle: string
  normalizedTitle: string    // 소문자 + 특수문자 제거
  tokens: string[]           // 토큰화된 단어들
  source: SourceType
  platform?: string
  region?: string
  score: number              // 소스별 원점수
  mentionCount: number
  commentCount: number
  timestamp: string
  metadata: Record<string, unknown>
}

// ============================================================
// 클러스터링된 콘텐츠 아이템
// ============================================================

export interface ContentCluster {
  clusterId: string
  representativeTitle: string   // 대표 제목
  aliases: string[]             // 같은 작품으로 묶인 다른 제목들
  contentType: ContentType
  sources: SourceType[]
  platforms: string[]
  regions: string[]
  
  // 점수
  totalScore: number
  mentionScore: number
  engagementScore: number
  recencyScore: number
  finalScore: number
  
  // 근거 데이터
  rawItems: NormalizedItem[]
  topComments: string[]
  
  // 메타
  firstSeen: string
  lastSeen: string
  isKContent: boolean
  actors: string[]
  genres: string[]
}

// ============================================================
// 인사이트
// ============================================================

export interface InsightSentence {
  category: 'rising' | 'dominant' | 'newcomer' | 'declining' | 'actor' | 'genre' | 'regional'
  text: string
  evidence: string[]
  score: number
}

// ============================================================
// 최종 리포트
// ============================================================

export interface RankedReport {
  id: string
  reportType: ReportType
  generatedAt: string
  period: {
    from: string
    to: string
  }
  
  // 랭킹
  topContents: ContentCluster[]
  
  // 카테고리별
  topByPlatform: Record<string, ContentCluster[]>
  topByRegion: Record<string, ContentCluster[]>
  
  // 인사이트
  insights: InsightSentence[]
  
  // 소스 통계
  sourceSummary: {
    source: SourceType
    itemCount: number
    crawledAt: string
  }[]
  
  // Reddit 카테고리 요약
  redditSummary?: RedditCategorySummary
}

export interface RedditCategorySummary {
  recommendations: { title: string; count: number }[]
  reviews: { title: string; sentiment: 'positive' | 'mixed' | 'negative'; count: number }[]
  actorMentions: { name: string; count: number; context: string }[]
  culturalQuestions: { topic: string; count: number }[]
  hotPosts: RedditPost[]
}

// ============================================================
// DB 저장 타입
// ============================================================

export interface DBReport {
  id: string
  report_type: ReportType
  generated_at: string
  period_from: string
  period_to: string
  data: string  // JSON stringified RankedReport
}

export interface DBCrawlLog {
  id: string
  source: SourceType
  crawled_at: string
  item_count: number
  status: 'success' | 'failed'
  error?: string
}
