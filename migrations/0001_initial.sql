-- ============================================================
-- K-Content Intelligence Dashboard: 초기 스키마
-- ============================================================

-- 리포트 저장 테이블
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily', 'weekly')),
  generated_at TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  data TEXT NOT NULL  -- JSON
);

-- 크롤링 로그 테이블
CREATE TABLE IF NOT EXISTS crawl_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  crawled_at TEXT NOT NULL,
  item_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
  error TEXT
);

-- 콘텐츠 클러스터 스냅샷 (검색/필터용)
CREATE TABLE IF NOT EXISTS content_snapshots (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  title TEXT NOT NULL,
  is_k_content INTEGER DEFAULT 0,
  final_score REAL DEFAULT 0,
  sources TEXT NOT NULL,  -- JSON array
  platforms TEXT NOT NULL, -- JSON array
  regions TEXT NOT NULL,   -- JSON array
  content_type TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_type_date ON reports(report_type, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_report ON content_snapshots(report_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_kcontent ON content_snapshots(is_k_content, final_score DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source ON crawl_logs(source, crawled_at DESC);
