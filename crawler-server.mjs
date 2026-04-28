// ============================================================
// K-Content 크롤러 서버 (Node.js - port 3001)
// Playwright가 여기서만 실행됨 (Cloudflare Workers 번들과 완전 분리)
// ============================================================

import http from 'node:http'
import { runPipeline } from './src/pipeline/index.js'

// 동적 import로 크롤러 로드
async function getCrawlers() {
  const { crawlReddit } = await import('./src/crawlers/reddit.js')
  const { crawlFlixPatrol } = await import('./src/crawlers/flixpatrol.js')
  const { crawlMyDramaList } = await import('./src/crawlers/mydramalist.js')
  return { crawlReddit, crawlFlixPatrol, crawlMyDramaList }
}

// JSON 바디 파싱 헬퍼
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

// JSON 응답 헬퍼
function sendJSON(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(payload)
}

// ============================================================
// HTTP 서버
// ============================================================
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' })
    res.end()
    return
  }

  const url = new URL(req.url, `http://localhost:3001`)

  // ── GET /health ──────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, { status: 'ok', service: 'crawler', timestamp: new Date().toISOString() })
  }

  // ── POST /crawl ──────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/crawl') {
    const body = await parseBody(req)
    const {
      type: reportType = 'daily',
      sources = ['reddit', 'flixpatrol', 'mydramalist'],
      remoteDebugPort,
    } = body

    console.log(`[Crawler] 크롤링 시작 - type: ${reportType}, sources: ${sources.join(', ')}`)
    const startTime = Date.now()
    const logs = []

    try {
      const { crawlReddit, crawlFlixPatrol, crawlMyDramaList } = await getCrawlers()

      let redditPosts = []
      let flixPatrolEntries = []
      let myDramaListEntries = []

      if (sources.includes('reddit')) {
        try {
          redditPosts = await crawlReddit({ remoteDebugPort })
          logs.push(`[Reddit] ${redditPosts.length}개 포스트 수집 완료`)
          console.log(`[Crawler] Reddit: ${redditPosts.length}개`)
        } catch (e) {
          logs.push(`[Reddit] 실패: ${e.message}`)
          console.error('[Crawler] Reddit 실패:', e.message)
        }
      }

      if (sources.includes('flixpatrol')) {
        try {
          flixPatrolEntries = await crawlFlixPatrol({ remoteDebugPort })
          logs.push(`[FlixPatrol] ${flixPatrolEntries.length}개 항목 수집 완료`)
          console.log(`[Crawler] FlixPatrol: ${flixPatrolEntries.length}개`)
        } catch (e) {
          logs.push(`[FlixPatrol] 실패: ${e.message}`)
          console.error('[Crawler] FlixPatrol 실패:', e.message)
        }
      }

      if (sources.includes('mydramalist')) {
        try {
          myDramaListEntries = await crawlMyDramaList({ remoteDebugPort })
          logs.push(`[MyDramaList] ${myDramaListEntries.length}개 드라마 수집 완료`)
          console.log(`[Crawler] MyDramaList: ${myDramaListEntries.length}개`)
        } catch (e) {
          logs.push(`[MyDramaList] 실패: ${e.message}`)
          console.error('[Crawler] MyDramaList 실패:', e.message)
        }
      }

      // 파이프라인 실행
      const report = runPipeline({ redditPosts, flixPatrolEntries, myDramaListEntries, reportType })
      const duration = Date.now() - startTime

      logs.push(`[Pipeline] 완료: ${report.topContents.length}개 클러스터, ${report.insights.length}개 인사이트`)
      console.log(`[Crawler] 파이프라인 완료 (${(duration / 1000).toFixed(1)}s)`)

      return sendJSON(res, 200, { success: true, report, logs, duration })

    } catch (e) {
      console.error('[Crawler] 치명적 오류:', e)
      return sendJSON(res, 500, { success: false, error: e.message, logs })
    }
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' })
})

const PORT = 3001
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Crawler Server] 시작됨 → http://0.0.0.0:${PORT}`)
  console.log(`[Crawler Server] Playwright 크롤링 서버 대기 중...`)
})

server.on('error', (err) => {
  console.error('[Crawler Server] 오류:', err)
  process.exit(1)
})
