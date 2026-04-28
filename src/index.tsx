// ============================================================
// K-Content Research Dashboard - Hono 메인 앱
// ============================================================

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())
app.use('/static/*', serveStatic({ root: './' }))

// ============================================================
// 메인 대시보드 페이지
// ============================================================

app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>K-Content Intelligence Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <link rel="stylesheet" href="/static/style.css"/>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">

<!-- 사이드바 -->
<div class="flex h-screen overflow-hidden">
  <aside id="sidebar" class="w-64 bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0">
    <div class="p-5 border-b border-gray-800">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-rose-600 rounded-lg flex items-center justify-center">
          <i class="fas fa-fire text-white text-sm"></i>
        </div>
        <div>
          <h1 class="font-bold text-sm text-white leading-tight">K-Content</h1>
          <p class="text-xs text-gray-400">Intelligence Dashboard</p>
        </div>
      </div>
    </div>
    <nav class="flex-1 p-4 space-y-1 overflow-y-auto">
      <button onclick="showPage('dashboard')" class="nav-btn active w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3">
        <i class="fas fa-chart-line w-4"></i> 대시보드
      </button>
      <button onclick="showPage('ranking')" class="nav-btn w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3">
        <i class="fas fa-trophy w-4"></i> 콘텐츠 랭킹
      </button>
      <button onclick="showPage('reddit')" class="nav-btn w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3">
        <i class="fab fa-reddit w-4"></i> Reddit 분석
      </button>
      <button onclick="showPage('platforms')" class="nav-btn w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3">
        <i class="fas fa-tv w-4"></i> 플랫폼별
      </button>
      <button onclick="showPage('archive')" class="nav-btn w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3">
        <i class="fas fa-archive w-4"></i> 뉴스레터 아카이브
      </button>
    </nav>
    <div class="p-4 border-t border-gray-800">
      <button id="crawlBtn" onclick="triggerCrawl()" class="w-full bg-rose-600 hover:bg-rose-700 text-white text-sm py-2.5 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2">
        <i class="fas fa-sync-alt"></i> 데이터 수집 시작
      </button>
      <div id="crawlStatus" class="mt-2 text-xs text-gray-500 text-center hidden"></div>
    </div>
  </aside>

  <!-- 메인 콘텐츠 -->
  <main class="flex-1 overflow-y-auto">
    <!-- 상단 바 -->
    <header class="sticky top-0 z-10 bg-gray-900/80 backdrop-blur border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <div>
        <h2 id="pageTitle" class="font-semibold text-white">대시보드</h2>
        <p id="pageSubtitle" class="text-xs text-gray-400">K콘텐츠 글로벌 팬 인텔리전스</p>
      </div>
      <div class="flex items-center gap-3">
        <select id="reportTypeSelect" onchange="changeReportType(this.value)" class="bg-gray-800 border border-gray-700 text-sm text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none">
          <option value="daily">일간 리포트</option>
          <option value="weekly">주간 리포트</option>
        </select>
        <div id="lastUpdated" class="text-xs text-gray-500"></div>
      </div>
    </header>

    <!-- 페이지들 -->
    <div class="p-6">

      <!-- 대시보드 페이지 -->
      <div id="page-dashboard" class="page-content">
        <!-- 소스 통계 카드 -->
        <div id="statsCards" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div class="stat-card bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div class="flex items-center gap-2 mb-2">
              <i class="fab fa-reddit text-orange-400 text-lg"></i>
              <span class="text-xs text-gray-400">Reddit</span>
            </div>
            <div id="statReddit" class="text-2xl font-bold text-white">—</div>
            <div class="text-xs text-gray-500 mt-1">포스트 수집</div>
          </div>
          <div class="stat-card bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-film text-green-400 text-lg"></i>
              <span class="text-xs text-gray-400">FlixPatrol</span>
            </div>
            <div id="statFlix" class="text-2xl font-bold text-white">—</div>
            <div class="text-xs text-gray-500 mt-1">OTT 순위</div>
          </div>
          <div class="stat-card bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-star text-yellow-400 text-lg"></i>
              <span class="text-xs text-gray-400">MyDramaList</span>
            </div>
            <div id="statMDL" class="text-2xl font-bold text-white">—</div>
            <div class="text-xs text-gray-500 mt-1">드라마 평점</div>
          </div>
          <div class="stat-card bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div class="flex items-center gap-2 mb-2">
              <i class="fas fa-layer-group text-rose-400 text-lg"></i>
              <span class="text-xs text-gray-400">클러스터</span>
            </div>
            <div id="statClusters" class="text-2xl font-bold text-white">—</div>
            <div class="text-xs text-gray-500 mt-1">콘텐츠 클러스터</div>
          </div>
        </div>

        <!-- 인사이트 + Top5 -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <!-- 인사이트 -->
          <div class="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-lightbulb text-yellow-400"></i> 핵심 인사이트
            </h3>
            <div id="insightsList" class="space-y-3">
              <div class="text-sm text-gray-500 text-center py-8">데이터를 수집하면 인사이트가 생성됩니다</div>
            </div>
          </div>

          <!-- Top K콘텐츠 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-crown text-yellow-400"></i> Top K콘텐츠
            </h3>
            <div id="topKList" class="space-y-2">
              <div class="text-sm text-gray-500 text-center py-8">—</div>
            </div>
          </div>
        </div>

        <!-- 점수 분포 차트 -->
        <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
            <i class="fas fa-chart-bar text-blue-400"></i> 상위 콘텐츠 점수 분포
          </h3>
          <canvas id="scoreChart" height="80"></canvas>
        </div>
      </div>

      <!-- 랭킹 페이지 -->
      <div id="page-ranking" class="page-content hidden">
        <div class="flex items-center gap-3 mb-4">
          <button onclick="filterRanking('all')" class="rank-filter-btn active px-4 py-1.5 rounded-full text-sm border">전체</button>
          <button onclick="filterRanking('k')" class="rank-filter-btn px-4 py-1.5 rounded-full text-sm border">K콘텐츠만</button>
          <button onclick="filterRanking('drama')" class="rank-filter-btn px-4 py-1.5 rounded-full text-sm border">드라마</button>
          <button onclick="filterRanking('movie')" class="rank-filter-btn px-4 py-1.5 rounded-full text-sm border">영화</button>
        </div>
        <div id="rankingTable" class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div class="text-sm text-gray-500 text-center py-16">데이터를 수집해주세요</div>
        </div>
      </div>

      <!-- Reddit 분석 페이지 -->
      <div id="page-reddit" class="page-content hidden">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- 핫 포스트 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-fire text-orange-400"></i> 핫 포스트
            </h3>
            <div id="redditHotPosts" class="space-y-3">
              <div class="text-sm text-gray-500 text-center py-8">—</div>
            </div>
          </div>
          <!-- 추천 요청 분석 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-hand-point-right text-blue-400"></i> 추천 요청 Top 10
            </h3>
            <div id="redditRecs" class="space-y-2">
              <div class="text-sm text-gray-500 text-center py-8">—</div>
            </div>
          </div>
          <!-- 리뷰 감성 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-comments text-green-400"></i> 리뷰 감성 분석
            </h3>
            <div id="redditReviews" class="space-y-2">
              <div class="text-sm text-gray-500 text-center py-8">—</div>
            </div>
          </div>
          <!-- 문화 질문 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4 flex items-center gap-2">
              <i class="fas fa-globe text-purple-400"></i> 문화/여행 발화 주제
            </h3>
            <div id="redditCulture" class="space-y-2">
              <div class="text-sm text-gray-500 text-center py-8">—</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 플랫폼별 페이지 -->
      <div id="page-platforms" class="page-content hidden">
        <div id="platformsGrid" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <div class="text-sm text-gray-500 text-center py-16 col-span-full">데이터를 수집해주세요</div>
        </div>
      </div>

      <!-- 뉴스레터 아카이브 페이지 -->
      <div id="page-archive" class="page-content hidden">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- 아카이브 목록 -->
          <div class="bg-gray-900 rounded-xl border border-gray-800 p-5">
            <h3 class="font-semibold text-white mb-4">📁 저장된 리포트</h3>
            <div id="archiveList" class="space-y-2">
              <div class="text-sm text-gray-500 text-center py-8">아직 리포트가 없습니다</div>
            </div>
          </div>
          <!-- 뉴스레터 프리뷰 -->
          <div class="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-white">📰 뉴스레터 프리뷰</h3>
              <button onclick="exportNewsletter()" class="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700 transition-all">
                <i class="fas fa-download mr-1"></i> 내보내기
              </button>
            </div>
            <div id="newsletterPreview" class="text-sm text-gray-400 leading-relaxed">
              왼쪽에서 리포트를 선택하세요
            </div>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<script src="/static/app.js"></script>
</body>
</html>`)
})

// ============================================================
// API: 크롤링 트리거 (서버 사이드 - Playwright는 별도 서비스)
// ============================================================

app.post('/api/crawl', async (c) => {
  // Cloudflare Pages에서는 Playwright 직접 실행 불가
  // 크롤러 서비스(Node.js)에 위임하거나 mock 데이터 반환
  try {
    const body = await c.req.json().catch(() => ({}))
    const reportType = (body as { reportType?: string }).reportType ?? 'daily'

    // 크롤러 서비스 호출 (같은 서버에서 Node.js 크롤러가 별도 포트로 실행)
    const crawlerUrl = 'http://localhost:3001/crawl'
    const response = await fetch(crawlerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportType }),
    })

    if (!response.ok) throw new Error('크롤러 서비스 응답 오류')

    const result = await response.json() as { report: unknown }

    // D1에 저장
    const report = result.report as {
      id: string; reportType: string; generatedAt: string;
      period: { from: string; to: string }
    }
    if (c.env?.DB) {
      await c.env.DB.prepare(
        'INSERT OR REPLACE INTO reports (id, report_type, generated_at, period_from, period_to, data) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        report.id,
        report.reportType,
        report.generatedAt,
        report.period.from,
        report.period.to,
        JSON.stringify(report)
      ).run()

      await c.env.DB.prepare(
        'INSERT INTO crawl_logs (id, source, crawled_at, item_count, status, duration_ms) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        `log_${Date.now()}`, 'pipeline', new Date().toISOString(),
        (report as unknown as { sourceSummary: { itemCount: number }[] }).sourceSummary?.reduce((s: number, x: { itemCount: number }) => s + x.itemCount, 0) ?? 0,
        'success', 0
      ).run()
    }

    return c.json({ success: true, report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return c.json({ success: false, error: msg }, 500)
  }
})

// ============================================================
// API: 최신 리포트 조회
// ============================================================

app.get('/api/reports/latest', async (c) => {
  const reportType = c.req.query('type') ?? 'daily'

  if (!c.env?.DB) {
    return c.json({ success: false, error: 'DB not available' }, 500)
  }

  const row = await c.env.DB.prepare(
    'SELECT * FROM reports WHERE report_type = ? ORDER BY generated_at DESC LIMIT 1'
  ).bind(reportType).first()

  if (!row) return c.json({ success: false, error: 'No report found' }, 404)

  return c.json({ success: true, report: JSON.parse(row.data as string) })
})

// ============================================================
// API: 리포트 목록 (아카이브)
// ============================================================

app.get('/api/reports', async (c) => {
  const reportType = c.req.query('type')
  const limit = parseInt(c.req.query('limit') ?? '20')

  if (!c.env?.DB) {
    return c.json({ success: false, error: 'DB not available' }, 500)
  }

  const query = reportType
    ? 'SELECT id, report_type, generated_at, period_from, period_to FROM reports WHERE report_type = ? ORDER BY generated_at DESC LIMIT ?'
    : 'SELECT id, report_type, generated_at, period_from, period_to FROM reports ORDER BY generated_at DESC LIMIT ?'

  const rows = reportType
    ? await c.env.DB.prepare(query).bind(reportType, limit).all()
    : await c.env.DB.prepare(query).bind(limit).all()

  return c.json({ success: true, reports: rows.results })
})

// ============================================================
// API: 특정 리포트 조회
// ============================================================

app.get('/api/reports/:id', async (c) => {
  const id = c.req.param('id')
  if (!c.env?.DB) return c.json({ success: false, error: 'DB not available' }, 500)

  const row = await c.env.DB.prepare(
    'SELECT * FROM reports WHERE id = ?'
  ).bind(id).first()

  if (!row) return c.json({ success: false, error: 'Not found' }, 404)
  return c.json({ success: true, report: JSON.parse(row.data as string) })
})

// ============================================================
// API: 크롤링 로그
// ============================================================

app.get('/api/logs', async (c) => {
  if (!c.env?.DB) return c.json({ success: false, error: 'DB not available' }, 500)
  const rows = await c.env.DB.prepare(
    'SELECT * FROM crawl_logs ORDER BY crawled_at DESC LIMIT 50'
  ).all()
  return c.json({ success: true, logs: rows.results })
})

export default app
