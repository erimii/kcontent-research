// ============================================================
// K-Content Intelligence Dashboard - Node.js 단일 서버
// Express + SQLite + Playwright
// ============================================================

import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  db, initDb, saveReport, saveCrawlLog,
  getLatestReport, getReportList, getReportById, getCrawlLogs, searchSnapshots
} from './db.js'
import { runPipeline } from './pipeline/index.js'
import { demoRedditPosts, demoFlixPatrol, demoMyDramaList } from './demo-data.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 3000

app.use(cors())
app.use(express.json())
app.use('/static', express.static(path.join(__dirname, '..', 'public', 'static')))

// DB 초기화
initDb()

// ============================================================
// 헬스체크
// ============================================================
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ============================================================
// 최신 리포트 조회
// ============================================================
app.get('/api/reports/latest/:type', (req, res) => {
  try {
    const row = getLatestReport(req.params.type)
    if (!row) return void res.json({ ok: false, error: 'No report yet', data: null })
    res.json({ ok: true, report: { ...row, data: JSON.parse(row.data) } })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 리포트 목록
// ============================================================
app.get('/api/reports', (req, res) => {
  try {
    const type = (req.query.type as string) ?? 'daily'
    const limit = parseInt((req.query.limit as string) ?? '20')
    res.json({ ok: true, reports: getReportList(type, limit) })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 특정 리포트 조회
// ============================================================
app.get('/api/reports/:id', (req, res) => {
  try {
    const row = getReportById(req.params.id)
    if (!row) return void res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, report: { ...row, data: JSON.parse(row.data) } })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 데모 데이터로 파이프라인 실행
// ============================================================
app.post('/api/crawl/demo', (req, res) => {
  try {
    const reportType = (req.body?.type as 'daily' | 'weekly') ?? 'daily'
    console.log('\n[Demo] 파이프라인 실행 중...')

    const report = runPipeline({
      redditPosts: demoRedditPosts,
      flixPatrolEntries: demoFlixPatrol,
      myDramaListEntries: demoMyDramaList,
      reportType,
    })

    saveReport(report)
    saveCrawlLog('reddit', demoRedditPosts.length, 'success')
    saveCrawlLog('flixpatrol', demoFlixPatrol.length, 'success')
    saveCrawlLog('mydramalist', demoMyDramaList.length, 'success')

    console.log(`[Demo] 완료 - 클러스터: ${report.topContents.length}개, 인사이트: ${report.insights.length}개`)
    res.json({ ok: true, reportId: report.id, report })
  } catch (e) {
    console.error('[Demo] 오류:', e)
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 실제 크롤링 실행
// ============================================================
app.post('/api/crawl', async (req, res) => {
  // 응답이 이미 전송됐는지 체크하는 헬퍼
  const safeSend = (status: number, body: object) => {
    if (res.headersSent) return
    res.status(status).json(body)
  }

  const reportType = (req.body?.type as 'daily' | 'weekly') ?? 'daily'
  const sources: string[] = req.body?.sources ?? ['reddit', 'flixpatrol', 'mydramalist']
  const logs: string[] = []
  const start = Date.now()

  const log = (msg: string) => { console.log(msg); logs.push(msg) }
  log(`\n[크롤링] 시작 (${reportType}) - 소스: ${sources.join(', ')}`)

  // 전체 크롤링에 5분 타임아웃
  const crawlTimeout = setTimeout(() => {
    log('[타임아웃] 5분 초과 - 수집된 데이터로 파이프라인 실행')
    try {
      const report = runPipeline({ redditPosts, flixPatrolEntries, myDramaListEntries, reportType })
      saveReport(report)
      safeSend(200, { ok: true, reportId: report.id, logs, report, timedOut: true })
    } catch (e) {
      safeSend(500, { ok: false, error: `타임아웃 후 파이프라인 오류: ${e}`, logs })
    }
  }, 5 * 60 * 1000)

  let redditPosts: any[] = []
  let flixPatrolEntries: any[] = []
  let myDramaListEntries: any[] = []

  try {
    if (sources.includes('reddit')) {
      try {
        const { crawlReddit } = await import('./crawlers/reddit.js')
        redditPosts = await crawlReddit()
        saveCrawlLog('reddit', redditPosts.length, 'success')
        log(`[Reddit] ${redditPosts.length}개 포스트 수집`)
      } catch (e) {
        saveCrawlLog('reddit', 0, 'failed', String(e))
        log(`[Reddit] 실패: ${(e as Error).message}`)
      }
    }

    if (sources.includes('flixpatrol')) {
      try {
        const { crawlFlixPatrol } = await import('./crawlers/flixpatrol.js')
        flixPatrolEntries = await crawlFlixPatrol()
        saveCrawlLog('flixpatrol', flixPatrolEntries.length, 'success')
        log(`[Soompi/Koreaboo] ${flixPatrolEntries.length}개 항목 수집`)
      } catch (e) {
        saveCrawlLog('flixpatrol', 0, 'failed', String(e))
        log(`[Soompi/Koreaboo] 실패: ${(e as Error).message}`)
      }
    }

    if (sources.includes('mydramalist')) {
      try {
        const { crawlMyDramaList } = await import('./crawlers/mydramalist.js')
        myDramaListEntries = await crawlMyDramaList()
        saveCrawlLog('mydramalist', myDramaListEntries.length, 'success')
        log(`[MyDramaList] ${myDramaListEntries.length}개 드라마 수집`)
      } catch (e) {
        saveCrawlLog('mydramalist', 0, 'failed', String(e))
        log(`[MyDramaList] 실패: ${(e as Error).message}`)
      }
    }

    log('[Pipeline] 데이터 처리 중...')
    const report = runPipeline({ redditPosts, flixPatrolEntries, myDramaListEntries, reportType })
    saveReport(report)

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    log(`[완료] ${elapsed}초 소요 - 클러스터: ${report.topContents.length}개, 인사이트: ${report.insights.length}개`)
    clearTimeout(crawlTimeout)
    safeSend(200, { ok: true, reportId: report.id, logs, report })
  } catch (e) {
    clearTimeout(crawlTimeout)
    log(`[오류] ${(e as Error).message}`)
    safeSend(500, { ok: false, error: String(e), logs })
  }
})

// ============================================================
// 크롤링 로그 조회
// ============================================================
app.get('/api/logs', (_req, res) => {
  try {
    res.json({ ok: true, logs: getCrawlLogs() })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 콘텐츠 검색
// ============================================================
app.get('/api/search', (req, res) => {
  try {
    const q = (req.query.q as string) ?? ''
    const kOnly = req.query.konly === 'true'
    res.json({ ok: true, results: searchSnapshots(q, kOnly) })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 뉴스레터 HTML 내보내기
// ============================================================
app.get('/api/newsletter/:id', (req, res) => {
  try {
    const row = getReportById(req.params.id)
    if (!row) return void res.status(404).send('<h1>리포트를 찾을 수 없습니다</h1>')
    const report = { ...row, data: JSON.parse(row.data) } as any
    const r = report.data
    const topK = (r.topContents || []).filter((c: any) => c.isKContent)
    const now = new Date(r.generatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>K-Content Weekly Intelligence · ${now}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background: #f4f5f7; color: #1a1a2e; }
  .wrapper { max-width: 680px; margin: 32px auto; }
  .header { background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%); color: #fff; padding: 36px 40px; border-radius: 16px 16px 0 0; }
  .header-title { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
  .header-sub { font-size: 13px; color: #7986cb; margin-top: 6px; }
  .header-meta { margin-top: 16px; display: flex; gap: 20px; }
  .meta-chip { font-size: 11px; background: rgba(255,255,255,0.08); padding: 4px 10px; border-radius: 20px; color: #a0a8d0; }
  .section { background: #fff; border-left: 1px solid #e0e4ef; border-right: 1px solid #e0e4ef; padding: 28px 36px; }
  .section:last-of-type { border-radius: 0 0 16px 16px; border-bottom: 1px solid #e0e4ef; }
  .section-title { font-size: 15px; font-weight: 700; color: #1a1a2e; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; padding-bottom: 10px; border-bottom: 2px solid #f0f2f8; }
  .stat-row { display: flex; gap: 12px; margin-bottom: 24px; }
  .stat-box { flex: 1; background: #f7f8fc; border-radius: 10px; padding: 16px; text-align: center; border: 1px solid #e8eaf2; }
  .stat-num { font-size: 28px; font-weight: 800; line-height: 1; }
  .stat-label { font-size: 11px; color: #7986cb; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rank-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f2f8; }
  .rank-row:last-child { border-bottom: none; }
  .rank-num { font-size: 13px; font-weight: 800; min-width: 24px; text-align: right; color: #9ba3bf; }
  .rank-num.gold { color: #f1c40f; }
  .rank-num.silver { color: #95a5a6; }
  .rank-num.bronze { color: #cd6133; }
  .rank-title { font-size: 13px; font-weight: 600; flex: 1; }
  .rank-score { font-size: 12px; color: #4f8ef7; font-weight: 700; }
  .badge { display: inline-block; padding: 2px 7px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .badge-k { background: #fce4f0; color: #c2185b; }
  .badge-drama { background: #e3eeff; color: #1565c0; }
  .badge-movie { background: #f3e5f5; color: #6a1b9a; }
  .insight-item { display: flex; gap: 12px; padding: 10px 14px; background: #f7f8fc; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid; }
  .insight-dominant { border-color: #4f8ef7; }
  .insight-rising { border-color: #2ecc71; }
  .insight-newcomer { border-color: #f39c12; }
  .insight-actor { border-color: #9b59b6; }
  .insight-genre { border-color: #e91e8c; }
  .insight-regional { border-color: #1abc9c; }
  .insight-icon { font-size: 16px; }
  .insight-text { font-size: 12px; line-height: 1.55; color: #2c3e50; }
  .evidence { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .evidence span { font-size: 10px; background: rgba(0,0,0,0.05); padding: 1px 5px; border-radius: 4px; color: #7986cb; }
  .source-tag { display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-right: 3px; }
  .src-reddit { background: #fff0eb; color: #e64a19; }
  .src-flixpatrol { background: #e8f0ff; color: #1565c0; }
  .src-mydramalist { background: #f3e5f5; color: #6a1b9a; }
  .footer { text-align: center; padding: 20px; font-size: 11px; color: #9ba3bf; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-title">🇰🇷 K-Content Intelligence</div>
    <div class="header-sub">${r.reportType === 'weekly' ? '주간' : '일간'} 글로벌 팬 트렌드 리포트</div>
    <div class="header-meta">
      <span class="meta-chip">📅 ${now}</span>
      <span class="meta-chip">🎬 ${r.topContents?.length || 0} titles tracked</span>
      <span class="meta-chip">🇰🇷 ${topK.length} K-titles</span>
      <span class="meta-chip">📡 ${(r.sourceSummary || []).map((s: any) => s.source).join(', ')}</span>
    </div>
  </div>

  <div class="section">
    <div class="stat-row">
      <div class="stat-box">
        <div class="stat-num" style="color:#4f8ef7">${r.topContents?.length || 0}</div>
        <div class="stat-label">총 콘텐츠</div>
      </div>
      <div class="stat-box">
        <div class="stat-num" style="color:#e91e8c">${topK.length}</div>
        <div class="stat-label">K-콘텐츠</div>
      </div>
      <div class="stat-box">
        <div class="stat-num" style="color:#2ecc71">${r.insights?.length || 0}</div>
        <div class="stat-label">인사이트</div>
      </div>
    </div>

    <div class="section-title">🏆 전체 TOP 10</div>
    ${(r.topContents || []).slice(0, 10).map((c: any, i: number) => `
      <div class="rank-row">
        <div class="rank-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
        <div class="rank-title">
          ${c.representativeTitle}
          ${c.isKContent ? '<span class="badge badge-k">K</span>' : ''}
          ${c.contentType === 'drama' ? '<span class="badge badge-drama">드라마</span>' : c.contentType === 'movie' ? '<span class="badge badge-movie">영화</span>' : ''}
        </div>
        <div>
          ${c.sources.map((s: string) => `<span class="source-tag src-${s}">${s}</span>`).join('')}
        </div>
        <div class="rank-score">${Math.round(c.finalScore)}pts</div>
      </div>`).join('')}
  </div>

  <div class="section">
    <div class="section-title">🇰🇷 K-콘텐츠 TOP 10</div>
    ${topK.length === 0 ? '<p style="color:#9ba3bf;font-size:13px">이 기간 K-콘텐츠 없음</p>' :
      topK.slice(0, 10).map((c: any, i: number) => `
        <div class="rank-row">
          <div class="rank-num ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${i+1}</div>
          <div class="rank-title">
            ${c.representativeTitle}
            ${c.actors?.length ? `<span style="font-size:11px;color:#9ba3bf;font-weight:400"> · ${c.actors.slice(0,2).join(', ')}</span>` : ''}
          </div>
          <div style="font-size:11px;color:#9ba3bf">${c.platforms?.join(', ') || '-'}</div>
          <div class="rank-score">${Math.round(c.finalScore)}pts</div>
        </div>`).join('')}
  </div>

  <div class="section">
    <div class="section-title">💡 주요 인사이트</div>
    ${(r.insights || []).map((ins: any) => `
      <div class="insight-item insight-${ins.category}">
        <div class="insight-icon">${{dominant:'👑',rising:'📈',newcomer:'🌟',declining:'📉',actor:'🎭',genre:'🎬',regional:'🌏'}[ins.category] || '💡'}</div>
        <div>
          <div class="insight-text">${ins.text}</div>
          <div class="evidence">
            ${(ins.evidence || []).map((e: string) => `<span>${e}</span>`).join('')}
          </div>
        </div>
      </div>`).join('')}
  </div>

  ${r.redditSummary ? `
  <div class="section">
    <div class="section-title"><span style="color:#e64a19">▲</span> Reddit 커뮤니티 요약</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ba3bf;margin-bottom:8px">추천 요청</div>
        ${(r.redditSummary.recommendations || []).slice(0,5).map((rec: any) =>
          `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f0f2f8;display:flex;justify-content:space-between">
            <span>${rec.title}</span><span style="color:#9ba3bf">${rec.count}회</span>
          </div>`).join('')}
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ba3bf;margin-bottom:8px">리뷰 언급</div>
        ${(r.redditSummary.reviews || []).slice(0,5).map((rev: any) =>
          `<div style="font-size:12px;padding:4px 0;border-bottom:1px solid #f0f2f8;display:flex;justify-content:space-between">
            <span>${rev.title}</span>
            <span style="padding:1px 6px;border-radius:10px;font-size:10px;background:${rev.sentiment==='positive'?'#e8f5e9':rev.sentiment==='negative'?'#ffebee':'#fff3e0'};color:${rev.sentiment==='positive'?'#2e7d32':rev.sentiment==='negative'?'#c62828':'#e65100'}">${rev.sentiment}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>` : ''}

  <div class="footer">
    K-Content Intelligence Dashboard · 자동 생성 리포트 · ${now}<br>
    <span style="font-size:10px">소스: ${(r.sourceSummary || []).map((s: any) => `${s.source}(${s.itemCount})`).join(', ')}</span>
  </div>
</div>
</body>
</html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (e) {
    res.status(500).send(`<h1>오류: ${e}</h1>`)
  }
})

// ============================================================
// 최신 리포트 뉴스레터
// ============================================================
app.get('/api/newsletter', (req, res) => {
  try {
    const type = (req.query.type as string) ?? 'daily'
    const row = getLatestReport(type)
    if (!row) return void res.status(404).send('<h1>리포트가 없습니다. 먼저 크롤링을 실행해주세요.</h1>')
    res.redirect(`/api/newsletter/${row.id}`)
  } catch (e) {
    res.status(500).send(`<h1>오류: ${e}</h1>`)
  }
})

// ============================================================
// 스케줄 상태 조회
// ============================================================
app.get('/api/schedule', (_req, res) => {
  res.json({
    ok: true,
    schedule: {
      daily: { cron: '0 9 * * *', description: '매일 오전 9시 (Reddit + FlixPatrol + MyDramaList)', enabled: true },
      weekly: { cron: '0 8 * * 1', description: '매주 월요일 오전 8시 (전체 소스 종합)', enabled: true },
    },
    lastRuns: getCrawlLogs(5),
    nextDaily: (() => {
      const d = new Date(); d.setDate(d.getDate() + (d.getHours() >= 9 ? 1 : 0))
      d.setHours(9, 0, 0, 0); return d.toISOString()
    })(),
    nextWeekly: (() => {
      const d = new Date(); const day = d.getDay()
      const daysUntilMon = day === 1 && d.getHours() < 8 ? 0 : (8 - day) % 7 || 7
      d.setDate(d.getDate() + daysUntilMon); d.setHours(8, 0, 0, 0); return d.toISOString()
    })(),
  })
})

// ============================================================
// 스케줄 수동 트리거
// ============================================================
app.post('/api/schedule/trigger', async (req, res) => {
  const safeSend = (status: number, body: object) => {
    if (res.headersSent) return
    res.status(status).json(body)
  }

  const reportType = (req.body?.type as 'daily' | 'weekly') ?? 'daily'
  const sources: string[] = req.body?.sources ?? ['reddit', 'flixpatrol', 'mydramalist']
  const logs: string[] = []
  const start = Date.now()

  const log = (msg: string) => { console.log('[Schedule]', msg); logs.push(msg) }
  log(`스케줄 수동 트리거: ${reportType} / 소스: ${sources.join(', ')}`)

  let redditPosts: any[] = []
  let flixPatrolEntries: any[] = []
  let myDramaListEntries: any[] = []

  try {
    if (sources.includes('reddit')) {
      try {
        const { crawlReddit } = await import('./crawlers/reddit.js')
        redditPosts = await crawlReddit()
        saveCrawlLog('reddit', redditPosts.length, 'success')
        log(`Reddit: ${redditPosts.length}개 포스트`)
      } catch (e) {
        saveCrawlLog('reddit', 0, 'failed', String(e))
        log(`Reddit 실패: ${(e as Error).message}`)
      }
    }
    if (sources.includes('flixpatrol')) {
      try {
        const { crawlFlixPatrol } = await import('./crawlers/flixpatrol.js')
        flixPatrolEntries = await crawlFlixPatrol()
        saveCrawlLog('flixpatrol', flixPatrolEntries.length, 'success')
        log(`Soompi/Koreaboo: ${flixPatrolEntries.length}개`)
      } catch (e) {
        saveCrawlLog('flixpatrol', 0, 'failed', String(e))
        log(`Soompi/Koreaboo 실패: ${(e as Error).message}`)
      }
    }
    if (sources.includes('mydramalist')) {
      try {
        const { crawlMyDramaList } = await import('./crawlers/mydramalist.js')
        myDramaListEntries = await crawlMyDramaList()
        saveCrawlLog('mydramalist', myDramaListEntries.length, 'success')
        log(`MyDramaList: ${myDramaListEntries.length}개`)
      } catch (e) {
        saveCrawlLog('mydramalist', 0, 'failed', String(e))
        log(`MyDramaList 실패: ${(e as Error).message}`)
      }
    }

    const report = runPipeline({ redditPosts, flixPatrolEntries, myDramaListEntries, reportType })
    saveReport(report)
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    log(`완료 (${elapsed}s) - 클러스터: ${report.topContents.length}개, 인사이트: ${report.insights.length}개`)

    safeSend(200, { ok: true, reportId: report.id, elapsed: Number(elapsed), logs })
  } catch (e) {
    log(`오류: ${(e as Error).message}`)
    safeSend(500, { ok: false, error: String(e), logs })
  }
})

// ============================================================
// 리포트 삭제
// ============================================================
app.delete('/api/reports/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM content_snapshots WHERE report_id = ?').run(req.params.id)
    db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id)
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 통계 요약
// ============================================================
app.get('/api/stats', (_req, res) => {
  try {
    const totalReports = (db.prepare('SELECT COUNT(*) as c FROM reports').get() as any)?.c ?? 0
    const totalSnapshots = (db.prepare('SELECT COUNT(*) as c FROM content_snapshots').get() as any)?.c ?? 0
    const kSnapshots = (db.prepare('SELECT COUNT(*) as c FROM content_snapshots WHERE is_k_content = 1').get() as any)?.c ?? 0
    const totalCrawls = (db.prepare('SELECT COUNT(*) as c FROM crawl_logs').get() as any)?.c ?? 0
    const successCrawls = (db.prepare("SELECT COUNT(*) as c FROM crawl_logs WHERE status='success'").get() as any)?.c ?? 0
    res.json({
      ok: true,
      stats: {
        totalReports, totalSnapshots, kSnapshots,
        kRatio: totalSnapshots ? Math.round(kSnapshots / totalSnapshots * 100) : 0,
        totalCrawls, successRate: totalCrawls ? Math.round(successCrawls / totalCrawls * 100) : 0,
      }
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 대시보드 SPA
// ============================================================
app.get('*', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>K-Content Intelligence Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <link rel="stylesheet" href="/static/style.css" />
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  <div id="app"></div>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

// ============================================================
// 서버 시작
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 K-Content Intelligence Dashboard`)
  console.log(`   http://localhost:${PORT}`)
  console.log(`   데모: POST /api/crawl/demo`)
  console.log(`   크롤링: POST /api/crawl\n`)
})

export default app
