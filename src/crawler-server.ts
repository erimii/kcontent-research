// ============================================================
// 크롤러 독립 서버 (Node.js - Playwright 실행)
// Hono 앱에서 fetch로 호출됨 → port 3001
// ============================================================

import http from 'http'
import { crawlReddit } from './crawlers/reddit.js'
import { crawlFlixPatrol } from './crawlers/flixpatrol.js'
import { crawlMyDramaList } from './crawlers/mydramalist.js'
import { runPipeline } from './pipeline/index.js'
import type { ReportType } from './types/index.js'

const PORT = 3001

// ============================================================
// 요청 핸들러
// ============================================================

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return
  }

  // POST /crawl - 전체 파이프라인 실행
  if (req.method === 'POST' && req.url === '/crawl') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const startTime = Date.now()
      try {
        const params = body ? JSON.parse(body) : {}
        const reportType: ReportType = params.reportType ?? 'daily'
        const sources: string[] = params.sources ?? ['reddit', 'flixpatrol', 'mydramalist']

        console.log(`\n[Pipeline] 시작 - ${reportType} / sources: ${sources.join(', ')}`)

        // 병렬 크롤링
        const [redditPosts, flixPatrolEntries, myDramaListEntries] = await Promise.allSettled([
          sources.includes('reddit') ? crawlReddit({ subreddits: ['kdramas', 'kdrama', 'kdramarecommends'] }) : Promise.resolve([]),
          sources.includes('flixpatrol') ? crawlFlixPatrol() : Promise.resolve([]),
          sources.includes('mydramalist') ? crawlMyDramaList() : Promise.resolve([]),
        ])

        const reddit = redditPosts.status === 'fulfilled' ? redditPosts.value : []
        const flix = flixPatrolEntries.status === 'fulfilled' ? flixPatrolEntries.value : []
        const mdl = myDramaListEntries.status === 'fulfilled' ? myDramaListEntries.value : []

        if (redditPosts.status === 'rejected') console.error('[Reddit] 실패:', redditPosts.reason)
        if (flixPatrolEntries.status === 'rejected') console.error('[FlixPatrol] 실패:', flixPatrolEntries.reason)
        if (myDramaListEntries.status === 'rejected') console.error('[MDL] 실패:', myDramaListEntries.reason)

        console.log(`[Pipeline] 수집 완료 - Reddit: ${reddit.length}, FlixPatrol: ${flix.length}, MDL: ${mdl.length}`)

        // 파이프라인 실행
        const report = runPipeline({
          redditPosts: reddit,
          flixPatrolEntries: flix,
          myDramaListEntries: mdl,
          reportType,
        })

        const duration = Date.now() - startTime
        console.log(`[Pipeline] 완료 - ${duration}ms, 클러스터: ${report.topContents.length}개`)

        res.writeHead(200)
        res.end(JSON.stringify({ success: true, report, duration }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Pipeline] 오류:', msg)
        res.writeHead(500)
        res.end(JSON.stringify({ success: false, error: msg }))
      }
    })
    return
  }

  // GET /health - 헬스체크
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200)
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    return
  }

  // GET /crawl/reddit - Reddit만 크롤링 (테스트용)
  if (req.method === 'GET' && req.url?.startsWith('/crawl/reddit')) {
    try {
      const posts = await crawlReddit({
        subreddits: ['kdramas', 'kdrama'],
      })
      res.writeHead(200)
      res.end(JSON.stringify({ success: true, count: posts.length, posts: posts.slice(0, 5) }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      res.writeHead(500)
      res.end(JSON.stringify({ success: false, error: msg }))
    }
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log(`\n🚀 크롤러 서버 실행 중 - http://localhost:${PORT}`)
  console.log(`   POST /crawl         - 전체 파이프라인 실행`)
  console.log(`   GET  /crawl/reddit  - Reddit 테스트 크롤링`)
  console.log(`   GET  /health        - 헬스체크\n`)
})

export default server
