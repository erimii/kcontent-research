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
  getLatestReport, getReportList, getReportById, getCrawlLogs, searchSnapshots,
  getMdlCache, setMdlCache,
} from './db.js'
import { runPipeline } from './pipeline/index.js'
import { demoRedditPosts } from './demo-data.js'
import { analyzeMdlDramas } from './pipeline/mdlAnalysis.js'
import { buildGTrendsSummary } from './pipeline/gtrendsAnalysis.js'
import { buildYoutubeSummary } from './pipeline/youtubeAnalysis.js'
import type { MdlSummary, GTrendsSummary, YoutubeSummary } from './types/index.js'

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
// 뉴스레터 HTML — 대시보드 6단계 결과를 이메일 친화 레이아웃으로 압축
// ============================================================
const KR_INSIGHT_META: Record<string, { icon: string; label: string; color: string }> = {
  trend_summary:       { icon: '📈', label: '트렌드 요약',      color: '#3b82f6' },
  fan_reaction:        { icon: '💬', label: '팬 반응 특징',     color: '#f59e0b' },
  consumption_pattern: { icon: '🎬', label: '콘텐츠 소비 패턴',  color: '#8b5cf6' },
  expansion:           { icon: '🌏', label: '확장 흐름',         color: '#10b981' },
  subreddit:           { icon: '👥', label: '커뮤니티 특성',     color: '#ec4899' },
}
const BEHAVIOR_KO: Record<string, string> = {
  recommendation: '추천 요청', review: '리뷰/후기', question: '질문', discussion: '의견/토론',
}
const escNl = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pctNl = (n: number) => `${Math.round((n || 0) * 100)}%`

app.get('/api/newsletter/:id', (req, res) => {
  try {
    const row = getReportById(req.params.id)
    if (!row) return void res.status(404).send('<h1>리포트를 찾을 수 없습니다</h1>')
    const report = { ...row, data: JSON.parse(row.data) } as any
    const r = report.data
    const now = new Date(r.generatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    const koreanInsights = (r.koreanInsights || []) as { category: string; text: string; evidence?: string[] }[]
    const trends = r.trends
    const sent = trends?.sentiment
    const beh = trends?.behavior
    const dominantBeh = beh ? Object.entries(beh.ratios as Record<string, number>).sort((a, b) => b[1] - a[1])[0] : null

    // Reddit 토론 TOP 3 (deepAnalysis 우선)
    const deep = (r.deepAnalysis || []) as any[]
    const top3Posts = deep.slice(0, 3)

    // MDL 캐시
    const mdlCache = getMdlCache<MdlSummary>('top_airing_v1')
    const mdl = mdlCache?.data
    const top3Dramas = (mdl?.dramas || []).slice(0, 3)

    // 헤드라인 — ① 평가 분열 작품 ② trend_summary ③ TOP 작품 ④ fallback
    const polarizedDrama = (mdl?.dramas || []).find((d: any) => d.polarized)
    const trendSummary = koreanInsights.find((k) => k.category === 'trend_summary')?.text
    const topTitle = trends?.content?.topContents?.[0]?.title
    const headline = polarizedDrama
      ? `⚠ ${polarizedDrama.drama.title} — 평점 ${polarizedDrama.drama.rating.toFixed(1)}점이지만 호불호가 갈리는 작품${polarizedDrama.polarizedReason ? ` (${polarizedDrama.polarizedReason})` : ''}으로 주목받고 있습니다.`
      : trendSummary
      ? trendSummary
      : topTitle
      ? `이번 기간 글로벌 K-팬덤은 '${topTitle}'을(를) 중심으로 활발히 토론하고 있습니다.`
      : `${r.topContents?.length || 0}개 콘텐츠 분석 리포트`

    // GTrends 캐시
    const gtCache = getMdlCache<GTrendsSummary>('us_daily_v1')
    const gt = gtCache?.data

    // YouTube 캐시
    const ytCache = getMdlCache<YoutubeSummary>('youtube_buzz_v1')
    const yt = ytCache?.data

    const insightCard = (ins: { category: string; text: string; observation?: string; interpretation?: string; action?: string; evidence?: string[] }) => {
      const meta = KR_INSIGHT_META[ins.category] || { icon: '✨', label: '인사이트', color: '#888' }
      const hasStructured = !!(ins.observation && ins.interpretation && ins.action)
      return `
      <tr><td style="padding:0 0 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid ${meta.color};background:#f7f8fc;border-radius:6px">
          <tr><td style="padding:14px 16px">
            <div style="font-size:11px;color:${meta.color};font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px">${meta.icon} ${meta.label}</div>
            ${hasStructured ? `
              <div style="margin-bottom:10px">
                <div style="font-size:11px;color:${meta.color};font-weight:700;margin-bottom:3px">📌 핵심 인사이트</div>
                <div style="font-size:13px;line-height:1.55;color:#1a1a2e">${escNl(ins.observation)}</div>
              </div>
              <div style="margin-bottom:10px">
                <div style="font-size:11px;color:#5d6680;font-weight:700;margin-bottom:3px">🔍 해석</div>
                <div style="font-size:13px;line-height:1.55;color:#3a4163">${escNl(ins.interpretation)}</div>
              </div>
              <div style="padding:10px 12px;background:#fff;border-radius:5px;border-left:2px solid ${meta.color}">
                <div style="font-size:11px;color:${meta.color};font-weight:700;margin-bottom:3px">💡 액션 제안 (Claude의 의견)</div>
                <div style="font-size:13px;line-height:1.6;color:#1a1a2e">${escNl(ins.action)}</div>
              </div>
            ` : `
              <div style="font-size:13px;line-height:1.6;color:#1a1a2e">${escNl(ins.text)}</div>
            `}
            ${ins.evidence && ins.evidence.length ? `
              <div style="margin-top:10px">
                ${ins.evidence.slice(0, 3).map((e) => `<span style="display:inline-block;font-size:10px;background:rgba(0,0,0,0.04);padding:2px 6px;border-radius:4px;color:#5d6680;margin-right:3px;margin-bottom:2px">${escNl(e)}</span>`).join('')}
              </div>` : ''}
          </td></tr>
        </table>
      </td></tr>`
    }

    const postCard = (d: any, i: number) => {
      const debate = (d.commentDebates || [])[0]
      const debateColor = debate
        ? (debate.opinionDirection === 'mixed' ? '#f59e0b' : debate.opinionDirection === 'positive' ? '#10b981' : debate.opinionDirection === 'negative' ? '#ef4444' : '#6b7280')
        : '#8b5cf6'
      return `
      <tr><td style="padding:0 0 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e8eaf2;border-radius:8px;background:#fff">
          <tr><td style="padding:14px 16px">
            <div style="font-size:12px;color:#8b5cf6;font-weight:700;margin-bottom:4px">#${i + 1} · r/${escNl(d.subreddit)} · 💬 ${d.commentCount}</div>
            <a href="${escNl(d.url)}" style="font-size:14px;font-weight:700;color:#1a1a2e;text-decoration:none;line-height:1.4;display:block">${escNl(d.titleKo || d.title)}</a>
            ${d.titleKo && d.titleKo !== d.title ? `<div style="font-size:11px;color:#9ba3bf;font-style:italic;margin-bottom:10px">${escNl(d.title)}</div>` : '<div style="margin-bottom:10px"></div>'}
            ${debate ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f8fc;border-left:3px solid ${debateColor};border-radius:4px">
                <tr><td style="padding:8px 12px">
                  <div style="font-size:11px;color:${debateColor};font-weight:700;margin-bottom:3px">🗣️ 핵심 쟁점 — ${escNl(debate.topic)}</div>
                  <div style="font-size:11px;color:#5d6680;line-height:1.5">${escNl(debate.description)} <span style="color:${debateColor}">(${escNl(debate.opinionDistribution.mixedLabel)})</span></div>
                  <div style="font-size:11px;color:#3a4163;line-height:1.5;margin-top:3px"><strong>해석:</strong> ${escNl(debate.interpretation)}</div>
                  ${(debate.representatives || []).slice(0, 2).map((rep: any) => {
                    const display = rep.bodyKo || rep.body
                    const orig = rep.bodyKo && rep.bodyKo !== rep.body ? rep.body : null
                    return `<div style="font-size:11px;color:#3a4163;line-height:1.5;margin-top:5px;padding:4px 8px;background:#fff;border-radius:3px;border-left:2px solid ${debateColor}">
                      "${escNl(display.slice(0, 200))}${display.length > 200 ? '…' : ''}"
                      ${orig ? `<div style="font-size:10px;color:#9ba3bf;font-style:italic;margin-top:2px">↳ ${escNl(orig.slice(0, 180))}${orig.length > 180 ? '…' : ''}</div>` : ''}
                    </div>`
                  }).join('')}
                </td></tr>
              </table>` : ''}
          </td></tr>
        </table>
      </td></tr>`
    }

    const dramaCard = (a: any, i: number) => {
      const d = a.drama
      const sent = a.reviewSentiment
      const total = (sent.positive + sent.negative) || 1
      const posPct = Math.round((sent.positiveRatio || 0) * 100)
      return `
      <tr><td style="padding:0 0 12px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e8eaf2;border-radius:8px;background:#fff">
          <tr>
            ${d.posterUrl ? `<td valign="top" style="padding:14px 0 14px 14px;width:80px"><img src="${escNl(d.posterUrl)}" alt="${escNl(d.title)}" width="68" style="border-radius:4px;display:block;width:68px;height:auto"></td>` : ''}
            <td style="padding:14px 16px;vertical-align:top">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
                <a href="${escNl(d.url)}" style="font-size:14px;font-weight:700;color:#1a1a2e;text-decoration:none">#${i + 1} ${escNl(d.title)}${a.polarized ? ' <span style="display:inline-block;font-size:10px;background:#ef4444;color:#fff;padding:2px 6px;border-radius:4px;margin-left:4px;vertical-align:middle;font-weight:700">⚠ 평가 분열</span>' : ''}</a>
                <span style="font-size:13px;color:#a78bfa;font-weight:700;white-space:nowrap;margin-left:10px">⭐ ${d.rating.toFixed(1)}</span>
              </div>
              <div style="font-size:11px;color:#9ba3bf;margin-bottom:6px">
                ${d.year ? d.year + ' · ' : ''}${d.episodes ? d.episodes + '부작 · ' : ''}리뷰 ${d.reviewCount}개${total > 1 ? ` · 댓글 긍정 ${posPct}%` : ''}
              </div>
              <div style="font-size:12px;color:#3a4163;line-height:1.55">${escNl(a.popularityReason)}</div>
              ${a.polarized && a.polarizedReason ? `
                <div style="margin-top:6px;font-size:11px;color:#ef4444;background:#fef5f5;padding:6px 10px;border-radius:4px;line-height:1.5">
                  <strong>⚠ ${escNl(a.polarizedReason)}</strong>
                </div>` : ''}
            </td>
          </tr>
        </table>
      </td></tr>`
    }

    const sentLine = sent
      ? `긍정 <strong style="color:#10b981">${pctNl(sent.positiveRatio)}</strong> · 중립 <strong>${pctNl(sent.neutralRatio)}</strong> · 부정 <strong style="color:#ef4444">${pctNl(sent.negativeRatio)}</strong>`
      : ''
    const behLine = beh && dominantBeh
      ? `행동: <strong>${BEHAVIOR_KO[dominantBeh[0]] || dominantBeh[0]}</strong> ${pctNl(dominantBeh[1])} 우세`
      : ''

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>K-Content Intelligence · ${now}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f5f7;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="max-width:680px;width:100%">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0f0f1a 0%,#2a2a4e 100%);color:#fff;padding:32px 36px;border-radius:16px 16px 0 0">
        <div style="font-size:22px;font-weight:800;letter-spacing:-0.3px">🇰🇷 K-Content Intelligence</div>
        <div style="font-size:12px;color:#a0a8d0;margin-top:4px">${r.reportType === 'weekly' ? '주간' : '일간'} 글로벌 K-콘텐츠 팬덤 리포트 · ${now}</div>
        <div style="margin-top:14px;padding:12px 14px;background:rgba(255,255,255,0.07);border-radius:8px;border-left:3px solid #ec4899">
          <div style="font-size:10px;color:#ec4899;font-weight:700;text-transform:uppercase;margin-bottom:4px">이번 호 헤드라인</div>
          <div style="font-size:13px;line-height:1.55;color:#e8eaf6">${escNl(headline)}</div>
        </div>
      </td></tr>

      <!-- 통계 한 줄 -->
      <tr><td style="background:#fff;padding:18px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef;border-bottom:1px solid #f0f2f8">
        <div style="font-size:12px;color:#5d6680;line-height:1.6">
          📊 <strong>${r.topContents?.length || 0}개 콘텐츠</strong> · 포스트 <strong>${r.filterStats?.after || 0}개</strong>
          ${sentLine ? ` · ${sentLine}` : ''}
          ${behLine ? ` · ${behLine}` : ''}
        </div>
      </td></tr>

      <!-- K-콘텐츠 트렌드 분석 (작품·배우 빈도 + 핵심 인사이트 통합) -->
      ${(koreanInsights.length > 0 || (trends?.content && ((trends.content.topContents?.length || 0) + (trends.content.topActors?.length || 0)) > 0)) ? `
      <tr><td style="background:#fff;padding:24px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef">
        <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #f0f2f8">🔥 K-콘텐츠 트렌드 분석</div>
        <div style="font-size:11px;color:#9ba3bf;line-height:1.55;margin-bottom:14px">
          📡 출처: Reddit ${(r.subredditInsights || []).length > 0 ? (r.subredditInsights || []).map((s: any) => `r/${escNl(s.subreddit)}`).join(' · ') : 'r/kdramas · r/kdrama · r/kdramarecommends · r/korean'} ·
          hot+new+top+controversial RSS · ${
            r.redditCrawlMeta
              ? `최근 <strong>${escNl(r.redditCrawlMeta.cutoffLabel)}</strong>${r.redditCrawlMeta.fallbackUsed ? ` <span style="color:#f59e0b">⚠ 표본 부족으로 ${escNl(r.redditCrawlMeta.cutoffLabel)} fallback</span>` : ''}`
              : '최근 7일'
          } ·
          포스트 <strong>${r.filterStats?.after || 0}개</strong> 분석 (수집 ${r.filterStats?.before || 0} → 필터 후 ${r.filterStats?.after || 0}) · title+selftext+댓글 통합 추출${
            (r.deepAnalysis || []).length > 0
              ? ` · 그중 댓글 많은 TOP ${(r.deepAnalysis || []).length}개 (댓글 ${(r.deepAnalysis || []).reduce((s: number, d: any) => s + (d.commentCount || 0), 0)}개)도 함께 분석`
              : ''
          }
        </div>

        ${trends?.content && ((trends.content.topContents?.length || 0) + (trends.content.topActors?.length || 0)) > 0 ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px">
          ${(trends.content.topContents || []).slice(0, 5).length > 0 ? `
          <tr><td style="padding:6px 0;font-size:12px;color:#3a4163;line-height:1.7">
            <strong style="color:#8b5cf6">📺 작품 TOP ${Math.min(5, (trends.content.topContents || []).length)}</strong> ·
            ${(trends.content.topContents || []).slice(0, 5).map((c: any) => `${escNl(c.title)} <span style="color:#9ba3bf">(${c.count})</span>`).join(' · ')}
          </td></tr>` : ''}
          ${(trends.content.topActors || []).slice(0, 5).length > 0 ? `
          <tr><td style="padding:6px 0;font-size:12px;color:#3a4163;line-height:1.7;border-top:1px solid #f0f2f8">
            <strong style="color:#10b981">🎭 배우 TOP ${Math.min(5, (trends.content.topActors || []).length)}</strong> ·
            ${(trends.content.topActors || []).slice(0, 5).map((a: any) => `${escNl(a.name)} <span style="color:#9ba3bf">(${a.count})</span>`).join(' · ')}
          </td></tr>` : ''}
        </table>` : ''}

        ${koreanInsights.length > 0 ? `
        <div style="font-size:12px;font-weight:700;color:#ec4899;text-transform:uppercase;letter-spacing:0.4px;margin:6px 0 10px;padding-top:8px;border-top:2px solid #f0f2f8">🧠 핵심 인사이트 (Claude 해석)</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${koreanInsights.slice(0, 3).map(insightCard).join('')}
        </table>` : ''}
      </td></tr>` : ''}

      <!-- Reddit TOP 포스트 댓글 딥분석 -->
      ${top3Posts.length > 0 ? `
      <tr><td style="background:#fff;padding:24px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef">
        <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #f0f2f8">🔥 Reddit TOP ${top3Posts.length} 포스트 댓글 딥분석</div>
        <div style="font-size:11px;color:#9ba3bf;line-height:1.55;margin-bottom:12px">
          📡 출처: Reddit 토론 TOP ${top3Posts.length} 포스트 · 댓글 합계 <strong style="color:#3a4163">${top3Posts.reduce((s: number, d: any) => s + (d.commentCount || 0), 0)}개</strong> 분석 · 포스트당 댓글 RSS에서 본문 길이 ≥20자 댓글 수집 후 감정/의견/쟁점 클러스터링
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${top3Posts.map((d: any, i: number) => postCard(d, i)).join('')}
        </table>
      </td></tr>` : ''}

      <!-- MDL Top Airing TOP 3 -->
      ${top3Dramas.length > 0 ? `
      <tr><td style="background:#fff;padding:24px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef">
        <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #f0f2f8">📺 MyDramaList Top Airing K-드라마 TOP ${top3Dramas.length}</div>
        <div style="font-size:11px;color:#9ba3bf;margin-bottom:12px">평균 평점 ${(mdl?.aggregate?.avgRating || 0).toFixed(2)}/10 · ${escNl(mdl?.aggregate?.overallSentimentSummary || '')}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${top3Dramas.map((a: any, i: number) => dramaCard(a, i)).join('')}
        </table>
      </td></tr>` : ''}

      <!-- YouTube SNS 버즈 -->
      ${yt && yt.totalVideos > 0 ? `
      <tr><td style="background:#fff;padding:24px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef">
        <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:6px;padding-bottom:8px;border-bottom:2px solid #f0f2f8">▶️ SNS 버즈 분석 (YouTube)</div>
        <div style="font-size:11px;color:#9ba3bf;margin-bottom:12px">${yt.totalVideos}개 영상 · 댓글 ${yt.totalComments}개 분석</div>

        <div style="padding:10px 12px;background:#fef5f5;border-left:3px solid #ef4444;border-radius:4px;margin-bottom:12px;font-size:12px;line-height:1.6">
          ${escNl(yt.oneLineSummary)}
          ${yt.buzzInsight || yt.fandomFlowInsight ? `<div style="margin-top:6px;font-size:11px;color:#5d6680;line-height:1.55">${escNl([yt.buzzInsight, yt.fandomFlowInsight].filter(Boolean).join(' · '))}</div>` : ''}
        </div>

        <!-- TOP 3 영상 -->
        ${(yt.topVideos || []).slice(0, 3).map((v: any, i: number) => `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e8eaf2;border-radius:6px;margin-bottom:6px">
            <tr><td style="padding:10px 12px">
              <a href="https://www.youtube.com/watch?v=${escNl(v.id)}" style="font-size:12px;font-weight:700;color:#1a1a2e;text-decoration:none">
                <span style="color:#ef4444;margin-right:5px">#${i + 1}</span>${escNl((v.title || '').slice(0, 100))}
              </a>
              <div style="font-size:10px;color:#9ba3bf;margin-top:3px">
                ${escNl(v.channel || '')}${v.isOfficial ? ' · ✓공식' : ''} · 👁 ${(v.views || 0).toLocaleString()}${v.likes ? ' · 👍 ' + v.likes.toLocaleString() : ''}
              </div>
            </td></tr>
          </table>`).join('')}

        <!-- 콘텐츠 유형 -->
        ${(yt.contentTypeStats || []).length > 0 ? `
          <div style="margin-top:8px;font-size:11px;color:#5d6680">
            <strong>콘텐츠 유형:</strong> ${(yt.contentTypeStats || []).slice(0, 5).map((c: any) => `${escNl(c.label)} <strong>${c.count}</strong>`).join(' · ')}
          </div>` : ''}

        <!-- 댓글 반응 패턴 -->
        ${(yt.reactionPatterns || []).length > 0 ? `
          <div style="margin-top:6px;font-size:11px;color:#5d6680">
            <strong>댓글 반응:</strong> ${(yt.reactionPatterns || []).slice(0, 4).map((rp: any) => `${escNl(rp.label)} <strong>${rp.count}</strong>`).join(' · ')}
          </div>` : ''}
      </td></tr>` : ''}

      <!-- Google Trends — 북미 거시 + K-콘텐츠 비교 -->
      ${gt ? `
      <tr><td style="background:#fff;padding:24px 36px;border-left:1px solid #e0e4ef;border-right:1px solid #e0e4ef">
        <div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #f0f2f8">🌎 북미 트렌드 분석 (Google Trends · ${escNl(gt.geo)})</div>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:0 0 10px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid #ef4444;background:#fef5f5;border-radius:6px">
              <tr><td style="padding:12px 14px">
                <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:4px">① K-콘텐츠 트렌드</div>
                <div style="font-size:12px;line-height:1.6;color:#1a1a2e">${escNl(gt.kInsight)}</div>
                ${(gt.kItems || []).slice(0, 3).length > 0 ? `
                  <div style="margin-top:6px;font-size:11px;color:#5d6680">
                    ${(gt.kItems || []).slice(0, 3).map((it: any) => `<strong>${escNl(it.title)}</strong> (${escNl(it.traffic)})`).join(' · ')}
                  </div>` : ''}
              </td></tr>
            </table>
          </td></tr>

          <tr><td style="padding:0 0 10px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid #22d3ee;background:#f0fbff;border-radius:6px">
              <tr><td style="padding:12px 14px">
                <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:4px">② 트렌드 비교 인사이트</div>
                <div style="font-size:12px;line-height:1.65;color:#1a1a2e">${escNl(gt.comparison)}</div>
              </td></tr>
            </table>
          </td></tr>

          <tr><td>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-left:3px solid #22d3ee;background:#f0fbff;border-radius:6px">
              <tr><td style="padding:12px 14px">
                <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;margin-bottom:4px">③ 북미 거시 트렌드</div>
                <div style="font-size:12px;line-height:1.6;color:#1a1a2e">${escNl(gt.oneLineSummary)}</div>
                ${(gt.topItems || []).slice(0, 5).length > 0 ? `
                  <div style="margin-top:8px;font-size:11px;color:#5d6680">
                    <strong>TOP 5</strong>: ${(gt.topItems || []).slice(0, 5).map((it: any) => `${escNl(it.title)} <span style="color:#9ba3bf">(${escNl(it.traffic)})</span>`).join(' · ')}
                  </div>` : ''}
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>` : ''}

      <!-- Footer -->
      <tr><td style="background:#fff;padding:20px 36px;border:1px solid #e0e4ef;border-top:none;border-radius:0 0 16px 16px;text-align:center;color:#9ba3bf;font-size:11px;line-height:1.5">
        K-Content Intelligence Dashboard · 자동 생성 리포트 · ${now}<br>
        <span style="font-size:10px">소스: ${(r.sourceSummary || []).map((s: any) => `${escNl(s.source)}(${s.itemCount})`).join(', ')}${mdl ? ` · MDL(${(mdl.dramas || []).length} 드라마)` : ''}${gt ? ` · GTrends(${gt.totalItems} 트렌드)` : ''}${yt ? ` · YouTube(${yt.totalVideos} 영상)` : ''}</span>
      </td></tr>

    </table>
  </td></tr>
</table>
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
// MDL Popular/TopKorea 제목 사전 (사전 매칭 자동 갱신용) — TTL 24h, 자주 안 바뀜
const MDL_POPULAR_CACHE_KEY = 'mdl_popular_titles_v1'
const MDL_POPULAR_CACHE_TTL_SEC = 24 * 3600

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
const YT_CACHE_KEY = 'youtube_buzz_v1'
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
    const summary = await buildYoutubeSummary({ topN: 30, commentsPerVideo: 30 })
    saveCrawlLog('youtube', summary.totalVideos, summary.totalVideos > 0 ? 'success' : 'failed')
    if (summary.totalVideos === 0) {
      return res.status(503).json({ ok: false, error: 'YouTube 크롤링 결과 0개' })
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
