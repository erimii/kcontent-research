// ============================================================
// K-Content Intelligence Dashboard - Hono 메인 앱
// Playwright 의존성 없음 - 크롤링은 crawler-server(3001)에 위임
// ============================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/cloudflare-workers'
import { runPipeline } from './pipeline/index.js'
import type { DBReport, RankedReport } from './types/index.js'
import { demoRedditPosts, demoFlixPatrol, demoMyDramaList } from './demo-data.js'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './' }))

// ============================================================
// DB 자동 초기화 (첫 요청 시 테이블 생성)
// ============================================================
let dbInitialized = false

async function ensureDB(db: D1Database) {
  if (dbInitialized) return
  await db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_reports_type_date ON reports(report_type, generated_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_report ON content_snapshots(report_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_score ON content_snapshots(is_k_content, final_score);
  `)
  dbInitialized = true
}

app.use('/api/*', async (c, next) => {
  try { await ensureDB(c.env.DB) } catch (_) {}
  return next()
})

// ============================================================
// 헬스체크
// ============================================================
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================================
// 리포트 목록 조회
// ============================================================
app.get('/api/reports', async (c) => {
  try {
    const type = c.req.query('type') ?? 'daily'
    const limit = parseInt(c.req.query('limit') ?? '20')
    const rows = await c.env.DB.prepare(
      `SELECT id, report_type, generated_at, period_from, period_to
       FROM reports WHERE report_type = ?
       ORDER BY generated_at DESC LIMIT ?`
    ).bind(type, limit).all()
    return c.json({ ok: true, reports: rows.results })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// 최신 리포트 조회 (/:id 보다 먼저 등록)
// ============================================================
app.get('/api/reports/latest/:type', async (c) => {
  try {
    const type = c.req.param('type') as 'daily' | 'weekly'
    const row = await c.env.DB.prepare(
      `SELECT * FROM reports WHERE report_type = ?
       ORDER BY generated_at DESC LIMIT 1`
    ).bind(type).first<DBReport>()
    if (!row) return c.json({ ok: false, error: 'No report yet', data: null })
    return c.json({ ok: true, report: { ...row, data: JSON.parse(row.data) } })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// 특정 리포트 조회
// ============================================================
app.get('/api/reports/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const row = await c.env.DB.prepare(
      `SELECT * FROM reports WHERE id = ?`
    ).bind(id).first<DBReport>()
    if (!row) return c.json({ ok: false, error: 'Not found' }, 404)
    return c.json({ ok: true, report: { ...row, data: JSON.parse(row.data) } })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// 데모 파이프라인 (크롤링 없이 내장 더미 데이터 사용)
// ============================================================
app.post('/api/crawl/demo', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const reportType = (body.type as 'daily' | 'weekly') ?? 'daily'

    const report = runPipeline({
      redditPosts: demoRedditPosts,
      flixPatrolEntries: demoFlixPatrol,
      myDramaListEntries: demoMyDramaList,
      reportType,
    })

    await saveReport(c.env.DB, report)
    return c.json({ ok: true, reportId: report.id, report })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// 실제 크롤링 → 크롤러 서버(3001)에 HTTP 위임
// Playwright는 crawler-server.ts에서만 실행
// ============================================================
app.post('/api/crawl', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))

    const resp = await fetch('http://localhost:3001/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      return c.json({ ok: false, error: `크롤러 서버 오류: ${await resp.text()}` }, 500)
    }

    const result = await resp.json() as {
      success: boolean
      report: RankedReport
      logs: string[]
      duration: number
    }

    if (!result.success) {
      return c.json({ ok: false, error: '크롤러 실패', logs: result.logs }, 500)
    }

    await saveReport(c.env.DB, result.report)

    for (const s of result.report.sourceSummary ?? []) {
      if (s.itemCount > 0) {
        await saveCrawlLog(c.env.DB, s.source, s.itemCount, 'success')
      }
    }

    return c.json({
      ok: true,
      reportId: result.report.id,
      logs: result.logs,
      duration: result.duration,
      report: result.report,
    })
  } catch (err) {
    return c.json({
      ok: false,
      error: `크롤러 서버 연결 실패 (port 3001): ${String(err)}`,
    }, 500)
  }
})

// ============================================================
// 크롤링 로그 조회
// ============================================================
app.get('/api/logs', async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      `SELECT * FROM crawl_logs ORDER BY crawled_at DESC LIMIT 50`
    ).all()
    return c.json({ ok: true, logs: rows.results })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// 콘텐츠 검색
// ============================================================
app.get('/api/search', async (c) => {
  try {
    const q = c.req.query('q') ?? ''
    const kOnly = c.req.query('konly') === 'true'
    let query = `SELECT * FROM content_snapshots WHERE title LIKE ?`
    const params: (string | number)[] = [`%${q}%`]
    if (kOnly) query += ` AND is_k_content = 1`
    query += ` ORDER BY final_score DESC LIMIT 30`
    const rows = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ ok: true, results: rows.results })
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500)
  }
})

// ============================================================
// DB 헬퍼: 리포트 저장
// ============================================================
async function saveReport(db: D1Database, report: RankedReport) {
  await db.prepare(
    `INSERT OR REPLACE INTO reports
     (id, report_type, generated_at, period_from, period_to, data)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    report.id, report.reportType, report.generatedAt,
    report.period.from, report.period.to, JSON.stringify(report)
  ).run()

  for (const cluster of report.topContents) {
    await db.prepare(
      `INSERT OR REPLACE INTO content_snapshots
       (id, report_id, title, is_k_content, final_score, sources, platforms, regions, content_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      cluster.clusterId, report.id, cluster.representativeTitle,
      cluster.isKContent ? 1 : 0, cluster.finalScore,
      JSON.stringify(cluster.sources), JSON.stringify(cluster.platforms),
      JSON.stringify(cluster.regions), cluster.contentType, report.generatedAt
    ).run()
  }
}

// ============================================================
// DB 헬퍼: 크롤링 로그 저장
// ============================================================
async function saveCrawlLog(
  db: D1Database, source: string, itemCount: number,
  status: 'success' | 'failed', error?: string
) {
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  await db.prepare(
    `INSERT INTO crawl_logs (id, source, crawled_at, item_count, status, error)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, source, new Date().toISOString(), itemCount, status, error ?? null).run()
}

// ============================================================
// 대시보드 SPA
// ============================================================
app.get('*', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>K-Content Intelligence Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <link rel="stylesheet" href="/static/style.css"/>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  <div id="app"></div>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
