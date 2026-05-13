// ============================================================
// K-Content Intelligence Dashboard - Node.js 단일 서버
// Express + SQLite (Reddit 전용)
// ============================================================

import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { marked } from 'marked'
import {
  db, initDb, saveReport, saveCrawlLog,
  getLatestReport, getReportList, getReportById, getCrawlLogs,
  getMdlCache, setMdlCache,
} from './db.js'
import { runPipeline } from './pipeline/index.js'
import { demoRedditPosts } from './demo-data.js'
import { analyzeMdlDramas } from './pipeline/mdlAnalysis.js'
import { buildGTrendsSummary } from './pipeline/gtrendsAnalysis.js'
import { buildYoutubeSummary } from './pipeline/youtubeAnalysis.js'
import { buildNewsletterV2 } from './pipeline/newsletter.js'
import type { MdlSummary, GTrendsSummary, YoutubeSummary, InstagramSummary } from './types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 3366

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
      reportType,
    })

    saveReport(report)
    saveCrawlLog('reddit', demoRedditPosts.length, 'success')

    console.log(`[Demo] 완료 - 클러스터: ${report.topContents.length}개, 인사이트: ${report.insights.length}개`)
    res.json({ ok: true, reportId: report.id, report })
  } catch (e) {
    console.error('[Demo] 오류:', e)
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 실제 크롤링 실행 (Reddit 전용)
// ============================================================
app.post('/api/crawl', async (req, res) => {
  const safeSend = (status: number, body: object) => {
    if (res.headersSent) return
    res.status(status).json(body)
  }

  const reportType = (req.body?.type as 'daily' | 'weekly') ?? 'daily'
  const logs: string[] = []
  const start = Date.now()

  const log = (msg: string) => { console.log(msg); logs.push(msg) }
  log(`\n[크롤링] 시작 (${reportType}) - 소스: reddit`)

  const crawlTimeout = setTimeout(() => {
    log('[타임아웃] 5분 초과 - 수집된 데이터로 파이프라인 실행')
    try {
      const report = runPipeline({ redditPosts, reportType })
      saveReport(report)
      safeSend(200, { ok: true, reportId: report.id, logs, report, timedOut: true })
    } catch (e) {
      safeSend(500, { ok: false, error: `타임아웃 후 파이프라인 오류: ${e}`, logs })
    }
  }, 5 * 60 * 1000)

  let redditPosts: any[] = []
  let redditMeta: any = undefined

  try {
    try {
      const { crawlRedditWithMeta } = await import('./crawlers/reddit.js')
      const result = await crawlRedditWithMeta({ reportType })
      redditPosts = result.posts
      redditMeta = result.meta
      saveCrawlLog('reddit', redditPosts.length, 'success')
      log(`[Reddit] ${redditPosts.length}개 포스트 (cutoff=${redditMeta.cutoffLabel}${redditMeta.fallbackUsed ? ' · fallback' : ''})`)
    } catch (e) {
      saveCrawlLog('reddit', 0, 'failed', String(e))
      log(`[Reddit] 실패: ${(e as Error).message}`)
    }

    log('[Pipeline] 데이터 처리 중...')
    // MDL airing + popular 캐시에서 작품 제목 합집합 → 콘텐츠 매칭에 사용
    const mdlCacheForPipeline = getMdlCache<MdlSummary>(MDL_CACHE_KEY)
    const airingTitles = mdlCacheForPipeline?.data?.dramas?.map((d: any) => d.drama?.title).filter(Boolean) || []
    const popularCache = getMdlCache<{ titles: string[] }>(MDL_POPULAR_CACHE_KEY)
    const popularTitles = popularCache?.data?.titles || []
    const extraKnownDramaTitles = [...new Set([...airingTitles, ...popularTitles])]
    if (extraKnownDramaTitles.length > 0) log(`[Pipeline] MDL 동적 사전 추가: airing ${airingTitles.length} + popular ${popularTitles.length} → unique ${extraKnownDramaTitles.length}개`)
    const report = runPipeline({ redditPosts, reportType, extraKnownDramaTitles })
    if (redditMeta) {
      ;(report as any).redditCrawlMeta = {
        cutoffLabel: redditMeta.cutoffLabel,
        fallbackUsed: redditMeta.fallbackUsed,
        rawCounts: redditMeta.rawCounts,
      }
    }
    // 댓글·제목 한국어 번역 (Groq AI, 캐시됨)
    try {
      const { translateDeepAnalysisInPlace } = await import('./pipeline/translateDeepAnalysis.js')
      await translateDeepAnalysisInPlace(report.deepAnalysis || [])
      log(`[번역] DeepAnalysis 한국어 번역 완료`)
    } catch (e) {
      log(`[번역] 실패 (영문 그대로): ${(e as Error).message}`)
    }
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
// 뉴스레터 HTML — buildNewsletterV2 위임 (2026-05-12)
// ============================================================
app.get('/api/newsletter/:id', (req, res) => {
  try {
    const row = getReportById(req.params.id)
    if (!row) return void res.status(404).send('<h1>리포트를 찾을 수 없습니다</h1>')
    const report = { ...row, data: JSON.parse(row.data) } as any

    // 최신 SNS 캐시 합성 (있으면 사용, 없으면 graceful skip)
    const mdl = getMdlCache<MdlSummary>('top_airing_v1')?.data || null
    const youtube = getMdlCache<YoutubeSummary>('youtube_buzz_v3')?.data || null
    const instagram = getMdlCache<InstagramSummary>('instagram_buzz_v1')?.data || null
    const gtrends = getMdlCache<GTrendsSummary>('us_daily_v1')?.data || null
    // 영문→한국 원제 동적 매핑 (popular + upcoming)
    const nativeTitleMap = getMdlCache<{ map: Record<string, string> }>(MDL_NATIVE_TITLE_MAP_KEY)?.data?.map || null
    const upcomingTitleMap = getMdlCache<{ map: Record<string, string> }>(MDL_UPCOMING_TITLE_MAP_KEY)?.data?.map || null

    const html = buildNewsletterV2({
      report: report.data,
      mdl, youtube, instagram, gtrends,
      nativeTitleMap, upcomingTitleMap,
      publicHost: `http://${req.headers.host || `localhost:${PORT}`}`,
    })
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
      daily: { cron: '0 9 * * *', description: '매일 오전 9시 (Reddit 5개 서브레딧)', enabled: true },
      weekly: { cron: '0 8 * * 1', description: '매주 월요일 오전 8시', enabled: true },
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
  const logs: string[] = []
  const start = Date.now()

  const log = (msg: string) => { console.log('[Schedule]', msg); logs.push(msg) }
  log(`스케줄 수동 트리거: ${reportType} / 소스: reddit`)

  let redditPosts: any[] = []
  let redditMeta: any = undefined

  try {
    try {
      const { crawlRedditWithMeta } = await import('./crawlers/reddit.js')
      const result = await crawlRedditWithMeta({ reportType })
      redditPosts = result.posts
      redditMeta = result.meta
      saveCrawlLog('reddit', redditPosts.length, 'success')
      log(`Reddit: ${redditPosts.length}개 포스트 (cutoff=${redditMeta.cutoffLabel}${redditMeta.fallbackUsed ? ' · fallback' : ''})`)
    } catch (e) {
      saveCrawlLog('reddit', 0, 'failed', String(e))
      log(`Reddit 실패: ${(e as Error).message}`)
    }

    const mdlCacheForSch = getMdlCache<MdlSummary>(MDL_CACHE_KEY)
    const airingTitlesForSch = mdlCacheForSch?.data?.dramas?.map((d: any) => d.drama?.title).filter(Boolean) || []
    const popularCacheForSch = getMdlCache<{ titles: string[] }>(MDL_POPULAR_CACHE_KEY)
    const popularTitlesForSch = popularCacheForSch?.data?.titles || []
    const extraKnownTitlesForSch = [...new Set([...airingTitlesForSch, ...popularTitlesForSch])]
    const report = runPipeline({ redditPosts, reportType, extraKnownDramaTitles: extraKnownTitlesForSch })
    if (redditMeta) {
      ;(report as any).redditCrawlMeta = {
        cutoffLabel: redditMeta.cutoffLabel,
        fallbackUsed: redditMeta.fallbackUsed,
        rawCounts: redditMeta.rawCounts,
      }
    }
    try {
      const { translateDeepAnalysisInPlace } = await import('./pipeline/translateDeepAnalysis.js')
      await translateDeepAnalysisInPlace(report.deepAnalysis || [])
      log(`번역 완료`)
    } catch (e) {
      log(`번역 실패: ${(e as Error).message}`)
    }
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
// MDL Top Airing K-드라마 분석
// - GET: 캐시된 결과 (없으면 stale=null 반환)
// - POST: 강제 새로고침 (Playwright 크롤링 → 분석 → 캐시 저장)
// ============================================================
const MDL_CACHE_KEY = 'top_airing_v1'
const MDL_CACHE_TTL_SEC = 6 * 3600
const MDL_TOP_ALLTIME_KEY = 'mdl_popular_ranking_v1'
const MDL_TOP_ALLTIME_TTL_SEC = 30 * 24 * 3600
// MDL Popular/TopKorea 제목 사전 (사전 매칭 자동 갱신용) — TTL 24h, 자주 안 바뀜
const MDL_POPULAR_CACHE_KEY = 'mdl_popular_titles_v1'
const MDL_POPULAR_CACHE_TTL_SEC = 24 * 3600
// 영문→한국 원제 매핑 자동 동기화 (2026-05-12) — TTL 7d, ~2-4분 크롤
const MDL_NATIVE_TITLE_MAP_KEY = 'mdl_native_title_map_v1'
const MDL_NATIVE_TITLE_MAP_TTL_SEC = 7 * 24 * 3600
// Upcoming K-드라마 영문→한국 원제 매핑 (2026-05-13) — TTL 24h, ~2분 크롤
const MDL_UPCOMING_TITLE_MAP_KEY = 'mdl_upcoming_title_map_v1'
const MDL_UPCOMING_TITLE_MAP_TTL_SEC = 24 * 3600

app.get('/api/mdl', (_req, res) => {
  try {
    const cached = getMdlCache<MdlSummary>(MDL_CACHE_KEY)
    if (!cached) return res.json({ ok: true, summary: null, cached: false })
    res.json({
      ok: true,
      summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      cached: true,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<MdlSummary>(MDL_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          cached: true,
        })
      }
    }

    console.log('[MDL] 새 크롤링 시작...')
    const t0 = Date.now()
    const { crawlMdlTopAiring } = await import('./crawlers/mdl.js')
    const dramas = await crawlMdlTopAiring({ topN: 5, reviewsPerDrama: 50 })
    saveCrawlLog('mdl', dramas.length, dramas.length > 0 ? 'success' : 'failed')
    if (dramas.length === 0) {
      return res.status(503).json({ ok: false, error: 'MDL 크롤링 실패 (0개 드라마)' })
    }

    const summary = analyzeMdlDramas(dramas)
    // 대표 리뷰 한국어 번역 (Groq, 캐시됨)
    try {
      const { translateMdlSummaryInPlace } = await import('./pipeline/translateMdl.js')
      await translateMdlSummaryInPlace(summary)
    } catch (e) {
      console.warn('[MDL] 번역 실패 (영문 유지):', (e as Error).message)
    }
    const ttl = setMdlCache(MDL_CACHE_KEY, summary, MDL_CACHE_TTL_SEC)
    console.log(`[MDL] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${dramas.length}개 드라마, 리뷰 ${dramas.reduce((s, d) => s + d.reviews.length, 0)}개`)

    res.json({
      ok: true,
      summary: { ...summary, cached: false, fetchedAt: ttl.fetchedAt, expiresAt: ttl.expiresAt },
      cached: false,
    })
  } catch (e) {
    console.error('[MDL] 오류:', e)
    saveCrawlLog('mdl', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// MDL Popular/TopKorea 제목 사전 (사전 매칭 자동 갱신용)
// - GET: 캐시 조회
// - POST: 강제 새로고침 (Playwright로 popular + top_korea 페이지 크롤 → 제목만 추출)
// ============================================================
app.get('/api/mdl/popular', (_req, res) => {
  try {
    const cached = getMdlCache<{ titles: string[] }>(MDL_POPULAR_CACHE_KEY)
    if (!cached) return res.json({ ok: true, titles: [], cached: false })
    res.json({
      ok: true,
      titles: cached.data.titles,
      count: cached.data.titles.length,
      cached: true,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/popular/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<{ titles: string[] }>(MDL_POPULAR_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          titles: cached.data.titles,
          count: cached.data.titles.length,
          cached: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        })
      }
    }

    console.log('[MDL-popular] 새 크롤링 시작...')
    const t0 = Date.now()
    const { crawlMdlPopularTitles } = await import('./crawlers/mdl.js')
    const titles = await crawlMdlPopularTitles(50)
    saveCrawlLog('mdl-popular', titles.length, titles.length > 0 ? 'success' : 'failed')
    if (titles.length === 0) {
      return res.status(503).json({ ok: false, error: 'MDL Popular 크롤링 실패 (0개 제목)' })
    }
    const ttl = setMdlCache(MDL_POPULAR_CACHE_KEY, { titles }, MDL_POPULAR_CACHE_TTL_SEC)
    console.log(`[MDL-popular] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${titles.length}개 제목`)

    res.json({
      ok: true,
      titles,
      count: titles.length,
      cached: false,
      fetchedAt: ttl.fetchedAt,
      expiresAt: ttl.expiresAt,
    })
  } catch (e) {
    console.error('[MDL-popular] 오류:', e)
    saveCrawlLog('mdl-popular', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ── 2026-05-12: 영문→한국 원제 자동 매핑 ────────────────────
app.get('/api/mdl/native-titles', (_req, res) => {
  try {
    const cached = getMdlCache<{ map: Record<string, string> }>(MDL_NATIVE_TITLE_MAP_KEY)
    if (!cached) return res.json({ ok: true, map: {}, cached: false })
    res.json({
      ok: true,
      map: cached.data.map,
      count: Object.keys(cached.data.map).length,
      cached: true,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/native-titles/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<{ map: Record<string, string> }>(MDL_NATIVE_TITLE_MAP_KEY)
      if (cached) {
        return res.json({
          ok: true,
          map: cached.data.map,
          count: Object.keys(cached.data.map).length,
          cached: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        })
      }
    }

    console.log('[MDL-native-titles] 새 크롤링 시작 (~2-4분)...')
    const t0 = Date.now()
    const { crawlMdlNativeTitleMap } = await import('./crawlers/mdl.js')
    const map = await crawlMdlNativeTitleMap(50)
    saveCrawlLog('mdl-native-titles', Object.keys(map).length, Object.keys(map).length > 0 ? 'success' : 'failed')
    if (Object.keys(map).length === 0) {
      return res.status(503).json({ ok: false, error: 'MDL nativeTitle 크롤링 실패 (0개 매핑)' })
    }
    const ttl = setMdlCache(MDL_NATIVE_TITLE_MAP_KEY, { map }, MDL_NATIVE_TITLE_MAP_TTL_SEC)
    console.log(`[MDL-native-titles] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${Object.keys(map).length}개 매핑`)

    res.json({
      ok: true,
      map,
      count: Object.keys(map).length,
      cached: false,
      fetchedAt: ttl.fetchedAt,
      expiresAt: ttl.expiresAt,
    })
  } catch (e) {
    console.error('[MDL-native-titles] 오류:', e)
    saveCrawlLog('mdl-native-titles', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ── 2026-05-13: Upcoming K-드라마 영문→한국 원제 자동 매핑 ──
// URL: /search?adv=titles&ty=68&co=3&st=2&so=date (Drama+Korea+Upcoming+sort by date)
app.get('/api/mdl/upcoming-titles', (_req, res) => {
  try {
    const cached = getMdlCache<{ map: Record<string, string> }>(MDL_UPCOMING_TITLE_MAP_KEY)
    if (!cached) return res.json({ ok: true, map: {}, cached: false })
    res.json({
      ok: true,
      map: cached.data.map,
      count: Object.keys(cached.data.map).length,
      cached: true,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/upcoming-titles/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<{ map: Record<string, string> }>(MDL_UPCOMING_TITLE_MAP_KEY)
      if (cached) {
        return res.json({
          ok: true,
          map: cached.data.map,
          count: Object.keys(cached.data.map).length,
          cached: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        })
      }
    }

    console.log('[MDL-upcoming-titles] 새 크롤링 시작 (~2분)...')
    const t0 = Date.now()
    const { crawlMdlUpcomingTitleMap } = await import('./crawlers/mdl.js')
    const map = await crawlMdlUpcomingTitleMap(30)
    saveCrawlLog('mdl-upcoming-titles', Object.keys(map).length, Object.keys(map).length > 0 ? 'success' : 'failed')
    if (Object.keys(map).length === 0) {
      return res.status(503).json({ ok: false, error: 'MDL Upcoming 매핑 0개' })
    }
    const ttl = setMdlCache(MDL_UPCOMING_TITLE_MAP_KEY, { map }, MDL_UPCOMING_TITLE_MAP_TTL_SEC)
    console.log(`[MDL-upcoming-titles] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${Object.keys(map).length}개 매핑`)

    res.json({
      ok: true,
      map,
      count: Object.keys(map).length,
      cached: false,
      fetchedAt: ttl.fetchedAt,
      expiresAt: ttl.expiresAt,
    })
  } catch (e) {
    console.error('[MDL-upcoming-titles] 오류:', e)
    saveCrawlLog('mdl-upcoming-titles', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// MDL 역대 누적 평점 TOP K-드라마 (정적 랭킹, TTL 7일)
// - GET: 캐시 조회
// - POST: 강제 새로고침 (Playwright /shows/top 페이지 순회)
// ============================================================
type TopAllTimeItem = {
  slug: string
  title: string
  url: string
  rating: number
  posterUrl?: string
  episodes?: number
  year?: number
  description?: string
}
type TopAllTimePayload = { items: TopAllTimeItem[] }

app.get('/api/mdl/top-ranking', (_req, res) => {
  try {
    const cached = getMdlCache<TopAllTimePayload>(MDL_TOP_ALLTIME_KEY)
    if (!cached) return res.json({ ok: true, items: [], cached: false })
    res.json({
      ok: true,
      items: cached.data.items,
      count: cached.data.items.length,
      cached: true,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/top-ranking/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<TopAllTimePayload>(MDL_TOP_ALLTIME_KEY)
      if (cached) {
        return res.json({
          ok: true,
          items: cached.data.items,
          count: cached.data.items.length,
          cached: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        })
      }
    }

    console.log('[MDL-popular-rank] 새 크롤링 시작...')
    const t0 = Date.now()
    const { crawlMdlPopularRanking } = await import('./crawlers/mdl.js')
    const items = await crawlMdlPopularRanking(50)
    saveCrawlLog('mdl-popular-rank', items.length, items.length > 0 ? 'success' : 'failed')
    if (items.length === 0) {
      return res.status(503).json({ ok: false, error: 'MDL Popular 크롤링 실패 (0개)' })
    }
    const ttl = setMdlCache(MDL_TOP_ALLTIME_KEY, { items }, MDL_TOP_ALLTIME_TTL_SEC)
    console.log(`[MDL-popular-rank] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${items.length}개`)

    res.json({
      ok: true,
      items,
      count: items.length,
      cached: false,
      fetchedAt: ttl.fetchedAt,
      expiresAt: ttl.expiresAt,
    })
  } catch (e) {
    console.error('[MDL-popular-rank] 오류:', e)
    saveCrawlLog('mdl-popular-rank', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// MDL 단일 드라마 lazy 분석 (역대 명작 페이지에서 행 클릭 시)
// - GET /api/mdl/drama/:slug → 캐시 조회
// - POST /api/mdl/drama/:slug/analyze → 크롤 + 분석 + 캐시 저장 (TTL 30일)
//   meta는 mdl_top_alltime_v1 캐시에서 자동 조회
// ============================================================
const MDL_DRAMA_CACHE_TTL_SEC = 30 * 24 * 3600

function dramaCacheKey(slug: string): string {
  return `mdl_drama_${slug}_v1`
}

app.get('/api/mdl/drama/:slug', (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim()
    if (!slug) return res.status(400).json({ ok: false, error: 'slug 누락' })
    const cached = getMdlCache<{ analysis: any }>(dramaCacheKey(slug))
    if (!cached) return res.json({ ok: true, analysis: null, cached: false })
    res.json({
      ok: true,
      analysis: cached.data.analysis,
      cached: true,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/mdl/drama/:slug/analyze', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim()
    if (!slug) return res.status(400).json({ ok: false, error: 'slug 누락' })

    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<{ analysis: any }>(dramaCacheKey(slug))
      if (cached) {
        return res.json({
          ok: true,
          analysis: cached.data.analysis,
          cached: true,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        })
      }
    }

    // top_alltime 캐시에서 meta 조회
    const top = getMdlCache<TopAllTimePayload>(MDL_TOP_ALLTIME_KEY)
    if (!top) {
      return res.status(409).json({ ok: false, error: '랭킹 캐시 없음 — 명작 랭킹 페이지를 먼저 로드하세요' })
    }
    const meta = top.data.items.find((x) => x.slug === slug)
    if (!meta) return res.status(404).json({ ok: false, error: `slug ${slug} not in top ranking cache` })

    console.log(`[MDL-drama] ${slug} 분석 시작...`)
    const t0 = Date.now()
    const { crawlMdlSingleDramaDeep } = await import('./crawlers/mdl.js')
    const drama = await crawlMdlSingleDramaDeep(meta, { reviewsMax: 10, commentsMax: 30 })
    saveCrawlLog('mdl-drama', drama.reviews.length, drama.reviews.length > 0 ? 'success' : 'failed')

    if (drama.reviews.length === 0) {
      return res.status(503).json({ ok: false, error: `${slug} 리뷰 0개 (Cloudflare 차단 가능성)` })
    }

    const summary = analyzeMdlDramas([drama])
    // 대표 리뷰 한국어 번역 (Groq, translation_cache 자동 활용)
    try {
      const { translateMdlSummaryInPlace } = await import('./pipeline/translateMdl.js')
      await translateMdlSummaryInPlace(summary)
    } catch (e) {
      console.warn('[MDL-drama] 번역 실패 (영문 유지):', (e as Error).message)
    }
    // 단일 분석 결과 추출
    const analysis = summary.dramas[0]
    const ttl = setMdlCache(dramaCacheKey(slug), { analysis }, MDL_DRAMA_CACHE_TTL_SEC)
    console.log(`[MDL-drama] ${slug} 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

    res.json({
      ok: true,
      analysis,
      cached: false,
      fetchedAt: ttl.fetchedAt,
      expiresAt: ttl.expiresAt,
    })
  } catch (e) {
    console.error('[MDL-drama] 오류:', e)
    saveCrawlLog('mdl-drama', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// Google Trends — 북미 거시 트렌드 + K-콘텐츠 비교
// ============================================================
const GTRENDS_CACHE_KEY = 'us_daily_v1'
const GTRENDS_CACHE_TTL_SEC = 60 * 60  // 1시간

app.get('/api/gtrends', (_req, res) => {
  try {
    const cached = getMdlCache<GTrendsSummary>(GTRENDS_CACHE_KEY)
    if (!cached) return res.json({ ok: true, summary: null, cached: false })
    res.json({
      ok: true,
      summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      cached: true,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/gtrends/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<GTrendsSummary>(GTRENDS_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          cached: true,
        })
      }
    }

    console.log('[GTrends] 새 RSS 수집 시작...')
    const t0 = Date.now()
    const summary = await buildGTrendsSummary('US')
    saveCrawlLog('gtrends', summary.totalItems, summary.totalItems > 0 ? 'success' : 'failed')
    if (summary.totalItems === 0) {
      return res.status(503).json({ ok: false, error: 'Google Trends 데이터 0개' })
    }
    const ttl = setMdlCache(GTRENDS_CACHE_KEY, summary, GTRENDS_CACHE_TTL_SEC)
    console.log(`[GTrends] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${summary.totalItems}개 트렌드, K ${summary.kItems.length}개`)
    res.json({
      ok: true,
      summary: { ...summary, cached: false, fetchedAt: ttl.fetchedAt, expiresAt: ttl.expiresAt },
      cached: false,
    })
  } catch (e) {
    console.error('[GTrends] 오류:', e)
    saveCrawlLog('gtrends', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// YouTube SNS 버즈 분석
// ============================================================
const YT_CACHE_KEY = 'youtube_buzz_v3'  // v3: contentGroups + topComments + 한국어 번역(textKo)
const YT_CACHE_TTL_SEC = 3 * 3600  // 3시간

app.get('/api/youtube', (_req, res) => {
  try {
    const cached = getMdlCache<YoutubeSummary>(YT_CACHE_KEY)
    if (!cached) return res.json({ ok: true, summary: null, cached: false })
    res.json({
      ok: true,
      summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      cached: true,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/youtube/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<YoutubeSummary>(YT_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          cached: true,
        })
      }
    }

    console.log('[YouTube] 새 크롤링 시작...')
    const t0 = Date.now()
    const summary = await buildYoutubeSummary({ topN: 30, commentsPerVideo: 100 })
    saveCrawlLog('youtube', summary.totalVideos, summary.totalVideos > 0 ? 'success' : 'failed')
    if (summary.totalVideos === 0) {
      return res.status(503).json({ ok: false, error: 'YouTube 크롤링 결과 0개' })
    }
    // 댓글 한국어 번역 (Groq AI, 캐시됨) — 캐시 저장 전에 실행
    try {
      const { translateYoutubeSummaryInPlace } = await import('./pipeline/translateYoutube.js')
      await translateYoutubeSummaryInPlace(summary)
    } catch (e) {
      console.warn(`[YouTube] 번역 실패 (영문 그대로): ${(e as Error).message}`)
    }
    const ttl = setMdlCache(YT_CACHE_KEY, summary, YT_CACHE_TTL_SEC)
    console.log(`[YouTube] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${summary.totalVideos}개 영상, 댓글 ${summary.totalComments}개`)
    res.json({
      ok: true,
      summary: { ...summary, cached: false, fetchedAt: ttl.fetchedAt, expiresAt: ttl.expiresAt },
      cached: false,
    })
  } catch (e) {
    console.error('[YouTube] 오류:', e)
    saveCrawlLog('youtube', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// TikTok SNS 버즈 분석 (메모리 캐시 — 사용자 클릭 시 1회 크롤)
// ============================================================
const TT_CACHE_KEY = 'tiktok_buzz_v1'
const TT_CACHE_TTL_SEC = 3 * 3600  // 3시간

app.get('/api/tiktok', (_req, res) => {
  try {
    const cached = getMdlCache<any>(TT_CACHE_KEY)
    if (!cached) return res.json({ ok: true, summary: null, cached: false })
    res.json({
      ok: true,
      summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      cached: true,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/tiktok/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<any>(TT_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          cached: true,
        })
      }
    }

    console.log('[TikTok] 새 크롤링 시작...')
    const t0 = Date.now()
    const { buildTiktokSummary } = await import('./pipeline/tiktokAnalysis.js')
    const summary = await buildTiktokSummary({ topN: 30, commentsPerVideo: 20 })
    saveCrawlLog('tiktok', summary.totalVideos, summary.totalVideos > 0 ? 'success' : 'failed')
    if (summary.totalVideos === 0) {
      return res.status(503).json({ ok: false, error: 'TikTok 크롤링 결과 0개 (쿠키 만료 또는 anti-bot 차단 가능성)' })
    }
    // 댓글 한국어 번역
    try {
      const { translateTiktokSummaryInPlace } = await import('./pipeline/translateTiktok.js')
      await translateTiktokSummaryInPlace(summary)
    } catch (e) {
      console.warn(`[TikTok] 번역 실패 (영문 그대로): ${(e as Error).message}`)
    }
    const ttl = setMdlCache(TT_CACHE_KEY, summary, TT_CACHE_TTL_SEC)
    console.log(`[TikTok] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${summary.totalVideos}개 영상, 댓글 ${summary.totalComments}개`)
    res.json({
      ok: true,
      summary: { ...summary, cached: false, fetchedAt: ttl.fetchedAt, expiresAt: ttl.expiresAt },
      cached: false,
    })
  } catch (e) {
    console.error('[TikTok] 오류:', e)
    saveCrawlLog('tiktok', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// Instagram SNS 버즈 분석 (메모리 캐시 — 사용자 클릭 시 1회 크롤)
//   * 쿠키 파일 (~/Desktop/secret/001/instagram-cookies.json) 필요
//   * 카테고리당 max 2 Reel, 첫 차단 감지 시 30분 lockout
// ============================================================
const IG_CACHE_KEY = 'instagram_buzz_v1'
const IG_CACHE_TTL_SEC = 12 * 3600  // 12시간 (2026-05-08: 사용자 IP throttle 부담 ↓)

app.get('/api/instagram', (_req, res) => {
  try {
    const cached = getMdlCache<InstagramSummary>(IG_CACHE_KEY)
    if (!cached) return res.json({ ok: true, summary: null, cached: false })
    res.json({
      ok: true,
      summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
      cached: true,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

app.post('/api/instagram/refresh', async (req, res) => {
  try {
    const force = req.body?.force === true
    if (!force) {
      const cached = getMdlCache<InstagramSummary>(IG_CACHE_KEY)
      if (cached) {
        return res.json({
          ok: true,
          summary: { ...cached.data, cached: true, fetchedAt: cached.fetchedAt, expiresAt: cached.expiresAt },
          cached: true,
        })
      }
    }

    console.log('[Instagram] 새 크롤링 시작...')
    const t0 = Date.now()
    const { buildInstagramSummary } = await import('./pipeline/instagramAnalysis.js')
    const summary = await buildInstagramSummary()
    saveCrawlLog('instagram', summary.totalReels, summary.totalReels > 0 ? 'success' : 'failed')
    if (summary.totalReels === 0) {
      // 정보성 첫 줄(공개 태그 표면…) 건너뛰고 실제 사유 픽
      const actionable = summary.warnings.find(
        (w) => /쿠키|lockout|로그인|wall|navigation|예외/.test(w),
      )
      const reason = actionable
        ?? summary.warnings[summary.warnings.length - 1]
        ?? 'Instagram 크롤링 결과 0개 (쿠키 만료 또는 anti-bot 차단 가능성)'
      return res.status(503).json({ ok: false, error: reason, summary })
    }
    // 댓글 한국어 번역 (Groq AI, 캐시됨) — 캐시 저장 전에 실행
    try {
      const { translateInstagramSummaryInPlace } = await import('./pipeline/translateInstagram.js')
      await translateInstagramSummaryInPlace(summary)
    } catch (e) {
      console.warn(`[Instagram] 번역 실패 (영문 그대로): ${(e as Error).message}`)
    }
    const ttl = setMdlCache(IG_CACHE_KEY, summary, IG_CACHE_TTL_SEC)
    console.log(`[Instagram] 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s) - ${summary.totalReels}개 Reel, 댓글 ${summary.totalComments}개`)
    res.json({
      ok: true,
      summary: { ...summary, cached: false, fetchedAt: ttl.fetchedAt, expiresAt: ttl.expiresAt },
      cached: false,
    })
  } catch (e) {
    console.error('[Instagram] 오류:', e)
    saveCrawlLog('instagram', 0, 'failed', String(e))
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ============================================================
// 대시보드 가이드 (docs/dashboard-guide.md → HTML)
// ============================================================
let guideHtmlCache: { html: string; mtime: number } | null = null

app.get('/api/guide', (_req, res) => {
  try {
    const mdPath = path.join(__dirname, '..', 'docs', 'dashboard-guide.md')
    const stat = fs.statSync(mdPath)
    if (!guideHtmlCache || guideHtmlCache.mtime !== stat.mtimeMs) {
      const md = fs.readFileSync(mdPath, 'utf-8')
      const html = marked.parse(md, { async: false }) as string
      guideHtmlCache = { html, mtime: stat.mtimeMs }
    }
    res.json({ ok: true, html: guideHtmlCache.html })
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
  <script src="/static/korean-titles.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`)
})

// ============================================================
// 전역 에러 핸들러 - 서버 크래시 방지
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] 치명적 에러 발생 (서버 유지):', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] Promise 에러 발생 (서버 유지):', reason)
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
