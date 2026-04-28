-- ============================================================
-- K-Content Research Dashboard 초기 스키마
-- ============================================================

-- 리포트 아카이브 (주간/일간 리포트 저장)
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily', 'weekly')),
  generated_at TEXT NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  data TEXT NOT NULL,  -- JSON stringified RankedReport
  created_at TEXT DEFAULT (datetime('now'))
);

-- 크롤링 실행 로그
CREATE TABLE IF NOT EXISTS crawl_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  crawled_at TEXT NOT NULL,
  item_count INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
  error TEXT,
  duration_ms INTEGER
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_generated ON reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_source ON crawl_logs(source);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_crawled ON crawl_logs(crawled_at DESC);
