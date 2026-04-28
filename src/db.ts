// ============================================================
// SQLite DB 초기화 및 헬퍼
// ============================================================

import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import type { RankedReport } from './types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'k-content.db')

// data 디렉토리 생성
import fs from 'fs'
const dataDir = path.join(__dirname, '..', 'data')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

export const db = new Database(DB_PATH)

// WAL 모드 (성능 향상)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ============================================================
// 스키마 초기화
// ============================================================
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      report_type TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      period_from TEXT NOT NULL,
      period_to TEXT NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crawl_logs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      crawled_at TEXT NOT NULL,
      item_count INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS content_snapshots (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      title TEXT NOT NULL,
      is_k_content INTEGER DEFAULT 0,
      final_score REAL DEFAULT 0,
      sources TEXT NOT NULL,
      platforms TEXT NOT NULL,
      regions TEXT NOT NULL,
      content_type TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_type_date
      ON reports(report_type, generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_snapshots_report
      ON content_snapshots(report_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_score
      ON content_snapshots(is_k_content, final_score DESC);
    CREATE INDEX IF NOT EXISTS idx_crawl_source
      ON crawl_logs(source, crawled_at DESC);
  `)
  console.log(`[DB] 초기화 완료: ${DB_PATH}`)
}

// ============================================================
// 리포트 저장
// ============================================================
const insertReport = db.prepare(`
  INSERT OR REPLACE INTO reports (id, report_type, generated_at, period_from, period_to, data)
  VALUES (@id, @reportType, @generatedAt, @periodFrom, @periodTo, @data)
`)

const insertSnapshot = db.prepare(`
  INSERT OR REPLACE INTO content_snapshots
    (id, report_id, title, is_k_content, final_score, sources, platforms, regions, content_type, created_at)
  VALUES
    (@id, @reportId, @title, @isKContent, @finalScore, @sources, @platforms, @regions, @contentType, @createdAt)
`)

export function saveReport(report: RankedReport) {
  const saveAll = db.transaction(() => {
    insertReport.run({
      id: report.id,
      reportType: report.reportType,
      generatedAt: report.generatedAt,
      periodFrom: report.period.from,
      periodTo: report.period.to,
      data: JSON.stringify(report),
    })

    for (const cluster of report.topContents) {
      insertSnapshot.run({
        id: cluster.clusterId,
        reportId: report.id,
        title: cluster.representativeTitle,
        isKContent: cluster.isKContent ? 1 : 0,
        finalScore: cluster.finalScore,
        sources: JSON.stringify(cluster.sources),
        platforms: JSON.stringify(cluster.platforms),
        regions: JSON.stringify(cluster.regions),
        contentType: cluster.contentType,
        createdAt: report.generatedAt,
      })
    }
  })
  saveAll()
}

// ============================================================
// 크롤링 로그 저장
// ============================================================
const insertLog = db.prepare(`
  INSERT INTO crawl_logs (id, source, crawled_at, item_count, status, error)
  VALUES (@id, @source, @crawledAt, @itemCount, @status, @error)
`)

export function saveCrawlLog(
  source: string,
  itemCount: number,
  status: 'success' | 'failed',
  error?: string
) {
  insertLog.run({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    source,
    crawledAt: new Date().toISOString(),
    itemCount,
    status,
    error: error ?? null,
  })
}

// ============================================================
// 리포트 조회
// ============================================================
export function getLatestReport(type: string) {
  return db.prepare(
    `SELECT * FROM reports WHERE report_type = ? ORDER BY generated_at DESC LIMIT 1`
  ).get(type) as { id: string; report_type: string; generated_at: string; data: string } | undefined
}

export function getReportList(type: string, limit = 20) {
  return db.prepare(
    `SELECT id, report_type, generated_at, period_from, period_to
     FROM reports WHERE report_type = ?
     ORDER BY generated_at DESC LIMIT ?`
  ).all(type, limit)
}

export function getReportById(id: string) {
  return db.prepare(`SELECT * FROM reports WHERE id = ?`).get(id) as
    { id: string; report_type: string; generated_at: string; data: string } | undefined
}

export function getCrawlLogs(limit = 50) {
  return db.prepare(
    `SELECT * FROM crawl_logs ORDER BY crawled_at DESC LIMIT ?`
  ).all(limit)
}

export function searchSnapshots(q: string, kOnly: boolean, limit = 30) {
  const query = kOnly
    ? `SELECT * FROM content_snapshots WHERE title LIKE ? AND is_k_content = 1 ORDER BY final_score DESC LIMIT ?`
    : `SELECT * FROM content_snapshots WHERE title LIKE ? ORDER BY final_score DESC LIMIT ?`
  return db.prepare(query).all(`%${q}%`, limit)
}
