export type SourceType = 'reddit'
export type ContentType = 'drama' | 'movie' | 'variety' | 'unknown'
export type ReportType = 'daily' | 'weekly'

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
}

export interface PipelineInput {
  redditPosts?: RedditPost[]
  reportType?: ReportType
}
