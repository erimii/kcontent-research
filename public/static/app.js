// ============================================================
// K-Content Intelligence Dashboard - Frontend App
// ============================================================

const API = axios.create({ baseURL: '/api' })

// ============================================================
// 상태 관리
// ============================================================
const state = {
  currentTab: 'dashboard',
  currentReport: null,
  reportHistory: [],
  isLoading: false,
  crawlLogs: [],
}

// ============================================================
// 유틸리티
// ============================================================
function formatDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateFull(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function showToast(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = `toast toast-${type}`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function platformIcon(platform) {
  const icons = {
    netflix: '<i class="fab fa-neos plat-netflix" title="Netflix">N</i>',
    disney: '<span class="plat-disney" style="font-weight:900;font-size:11px">D+</span>',
    apple: '<i class="fab fa-apple plat-apple"></i>',
    amazon: '<i class="fab fa-amazon plat-amazon"></i>',
    hulu: '<span class="plat-hulu" style="font-weight:700;font-size:10px">H</span>',
    hbo: '<span class="plat-hbo" style="font-weight:700;font-size:10px">HBO</span>',
  }
  return icons[platform?.toLowerCase()] ?? `<span style="font-size:10px">${platform ?? ''}</span>`
}

function sourceIcon(source) {
  const icons = {
    reddit: '<i class="fab fa-reddit" style="color:#ff4500"></i>',
    flixpatrol: '<i class="fas fa-chart-line" style="color:#06b6d4"></i>',
    mydramalist: '<i class="fas fa-star" style="color:#f59e0b"></i>',
    letterboxd: '<i class="fas fa-film" style="color:#00e054"></i>',
    fundex: '<i class="fas fa-fire" style="color:#f97316"></i>',
    google_trends: '<i class="fab fa-google" style="color:#4285f4"></i>',
  }
  return icons[source] ?? `<i class="fas fa-circle"></i>`
}

function insightIcon(category) {
  const icons = {
    rising: '📈', dominant: '🏆', newcomer: '🆕',
    actor: '⭐', genre: '🎭', regional: '🌏', declining: '📉'
  }
  return icons[category] ?? '💡'
}

function getRankClass(rank) {
  if (rank === 1) return 'rank-1'
  if (rank === 2) return 'rank-2'
  if (rank === 3) return 'rank-3'
  return 'rank-other'
}

function scoreColor(score, max) {
  const pct = max > 0 ? (score / max) * 100 : 0
  if (pct >= 70) return '#7c3aed'
  if (pct >= 40) return '#06b6d4'
  return '#334155'
}

// ============================================================
// 앱 렌더링
// ============================================================
function renderApp() {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen flex flex-col">
      ${renderHeader()}
      <div class="flex flex-1">
        ${renderSidebar()}
        <main class="flex-1 p-6 overflow-auto" id="main-content">
          ${renderMainContent()}
        </main>
      </div>
    </div>
  `
  bindEvents()
  updateMainContent()
}

// ============================================================
// 헤더
// ============================================================
function renderHeader() {
  const report = state.currentReport
  const generatedAt = report?.data?.generatedAt
  return `
  <header style="background:#0a0f1e;border-bottom:1px solid #1e293b;" class="px-6 py-4 flex items-center justify-between sticky top-0 z-50">
    <div class="flex items-center gap-3">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <i class="fas fa-satellite-dish text-white" style="font-size:16px"></i>
      </div>
      <div>
        <h1 style="font-size:16px;font-weight:700;letter-spacing:-0.3px">K-Content Intelligence</h1>
        <p style="font-size:11px;color:#64748b">Global Fan Research Dashboard</p>
      </div>
    </div>
    <div class="flex items-center gap-3">
      ${generatedAt ? `<span style="font-size:12px;color:#64748b"><i class="fas fa-clock mr-1"></i>마지막 업데이트: ${timeAgo(generatedAt)}</span>` : ''}
      <button class="btn-primary" id="btn-demo" style="padding:8px 16px;font-size:13px">
        <i class="fas fa-flask"></i> 데모 실행
      </button>
      <button class="btn-primary" id="btn-crawl" style="padding:8px 16px;font-size:13px;background:linear-gradient(135deg,#059669,#0d9488)">
        <i class="fas fa-spider"></i> 실제 크롤링
      </button>
    </div>
  </header>`
}

// ============================================================
// 사이드바
// ============================================================
function renderSidebar() {
  const tabs = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: '대시보드' },
    { id: 'ranking', icon: 'fa-trophy', label: '콘텐츠 랭킹' },
    { id: 'reddit', icon: 'fa-reddit', label: 'Reddit 분석', fab: true },
    { id: 'platforms', icon: 'fa-tv', label: 'OTT 플랫폼' },
    { id: 'insights', icon: 'fa-lightbulb', label: '인사이트' },
    { id: 'archive', icon: 'fa-archive', label: '리포트 아카이브' },
    { id: 'crawl', icon: 'fa-cog', label: '크롤링 관리' },
  ]
  return `
  <aside style="width:220px;background:#080d18;border-right:1px solid #1e293b;padding:16px 12px;flex-shrink:0;">
    <nav class="flex flex-col gap-1">
      ${tabs.map(t => `
        <button class="tab-btn ${state.currentTab === t.id ? 'active' : ''} text-left w-full"
          data-tab="${t.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <i class="${t.fab ? 'fab' : 'fas'} ${t.icon}" style="width:16px;text-align:center"></i>
          <span>${t.label}</span>
        </button>
      `).join('')}
    </nav>
    <div style="margin-top:24px;padding:12px;background:#0f172a;border-radius:10px;border:1px solid #1e293b;">
      <p style="font-size:11px;color:#64748b;margin-bottom:8px">데이터 소스</p>
      ${['reddit','flixpatrol','mydramalist'].map(s => `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:12px;color:#94a3b8">
          ${sourceIcon(s)} <span>${s}</span>
        </div>
      `).join('')}
    </div>
  </aside>`
}

// ============================================================
// 메인 콘텐츠 컨테이너
// ============================================================
function renderMainContent() {
  return `<div id="tab-content" class="fade-in"></div>`
}

// ============================================================
// 탭별 콘텐츠 렌더링
// ============================================================
function updateMainContent() {
  const container = document.getElementById('tab-content')
  if (!container) return

  const report = state.currentReport?.data

  const tabRenderers = {
    dashboard: () => renderDashboardTab(report),
    ranking: () => renderRankingTab(report),
    reddit: () => renderRedditTab(report),
    platforms: () => renderPlatformsTab(report),
    insights: () => renderInsightsTab(report),
    archive: () => renderArchiveTab(),
    crawl: () => renderCrawlTab(),
  }

  const renderer = tabRenderers[state.currentTab]
  container.innerHTML = renderer ? renderer() : '<p>준비 중...</p>'
  container.className = 'fade-in'

  // 차트/이벤트 후처리
  setTimeout(() => {
    if (state.currentTab === 'dashboard' && report) renderCharts(report)
    if (state.currentTab === 'archive') loadArchive()
    if (state.currentTab === 'crawl') loadCrawlLogs()
  }, 100)
}

// ============================================================
// 대시보드 탭
// ============================================================
function renderDashboardTab(report) {
  if (!report) return renderEmptyState()

  const topK = report.topContents?.filter(c => c.isKContent) ?? []
  const topAll = report.topContents ?? []
  const maxScore = topAll[0]?.finalScore ?? 1

  return `
  <div class="flex flex-col gap-6">
    <!-- 요약 스탯 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${statCard('🎯', '총 콘텐츠', topAll.length + '개', '#7c3aed')}
      ${statCard('🇰🇷', 'K-Content', topK.length + '개', '#4f46e5')}
      ${statCard('📊', '데이터 소스', (report.sourceSummary?.length ?? 0) + '개', '#0891b2')}
      ${statCard('💡', '인사이트', (report.insights?.length ?? 0) + '개', '#059669')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- TOP 10 랭킹 -->
      <div class="card">
        <div class="section-header">
          <div class="section-icon" style="background:#7c3aed22"><i class="fas fa-trophy" style="color:#a78bfa"></i></div>
          <h2 style="font-size:15px;font-weight:700">전체 TOP 10</h2>
        </div>
        <div class="flex flex-col gap-2">
          ${topAll.slice(0, 10).map((c, i) => miniRankRow(c, i + 1, maxScore)).join('')}
        </div>
      </div>

      <!-- K-Content TOP 10 -->
      <div class="card">
        <div class="section-header">
          <div class="section-icon" style="background:#4f46e522"><i class="fas fa-flag" style="color:#818cf8"></i></div>
          <h2 style="font-size:15px;font-weight:700">K-Content TOP 10</h2>
        </div>
        <div class="flex flex-col gap-2">
          ${topK.length === 0
            ? '<p style="color:#64748b;font-size:13px">K-Content 데이터 없음</p>'
            : topK.slice(0, 10).map((c, i) => miniRankRow(c, i + 1, topK[0]?.finalScore ?? 1)).join('')}
        </div>
      </div>
    </div>

    <!-- 소스 현황 + 인사이트 미리보기 -->
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px">
      <!-- 소스 현황 -->
      <div class="card">
        <div class="section-header">
          <div class="section-icon" style="background:#0891b222"><i class="fas fa-database" style="color:#22d3ee"></i></div>
          <h2 style="font-size:15px;font-weight:700">수집 현황</h2>
        </div>
        <div class="flex flex-col gap-3">
          ${(report.sourceSummary ?? []).map(s => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1e293b;border-radius:8px">
              <div style="display:flex;align-items:center;gap-8px">
                ${sourceIcon(s.source)}
                <span style="font-size:13px;margin-left:6px">${s.source}</span>
              </div>
              <span style="font-size:13px;font-weight:600;color:#a78bfa">${s.itemCount}건</span>
            </div>
          `).join('')}
        </div>
        <canvas id="chart-sources" style="margin-top:16px;max-height:160px"></canvas>
      </div>

      <!-- 인사이트 미리보기 -->
      <div class="card">
        <div class="section-header">
          <div class="section-icon" style="background:#05945922"><i class="fas fa-lightbulb" style="color:#34d399"></i></div>
          <h2 style="font-size:15px;font-weight:700">주요 인사이트</h2>
          <span style="font-size:11px;color:#64748b;margin-left:auto">${formatDate(report.generatedAt)}</span>
        </div>
        <div class="flex flex-col gap-3">
          ${(report.insights ?? []).slice(0, 4).map(ins => `
            <div class="insight-card insight-${ins.category}">
              <p style="font-size:13px;line-height:1.6">${insightIcon(ins.category)} ${ins.text}</p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- 점수 분포 차트 -->
    <div class="card">
      <div class="section-header">
        <div class="section-icon" style="background:#7c3aed22"><i class="fas fa-chart-bar" style="color:#a78bfa"></i></div>
        <h2 style="font-size:15px;font-weight:700">TOP 15 점수 분포</h2>
      </div>
      <canvas id="chart-scores" style="max-height:200px"></canvas>
    </div>
  </div>`
}

function statCard(emoji, label, value, color) {
  return `
  <div class="stat-card">
    <div style="font-size:20px;margin-bottom:4px">${emoji}</div>
    <div class="stat-value" style="color:${color}">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`
}

function miniRankRow(cluster, rank, maxScore) {
  const pct = maxScore > 0 ? Math.round((cluster.finalScore / maxScore) * 100) : 0
  return `
  <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:#070d1a;border:1px solid #1e293b">
    <span class="rank-badge ${getRankClass(rank)}">${rank}</span>
    <div style="flex:1;min-width:0">
      <p style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cluster.representativeTitle}</p>
      <div class="score-bar" style="margin-top:4px">
        <div class="score-fill" style="width:${pct}%"></div>
      </div>
    </div>
    <div style="flex-shrink:0;text-align:right">
      <p style="font-size:12px;font-weight:600;color:#a78bfa">${cluster.finalScore}</p>
      ${cluster.isKContent ? '<span class="k-badge">🇰🇷 K</span>' : ''}
    </div>
  </div>`
}

// ============================================================
// 랭킹 탭
// ============================================================
function renderRankingTab(report) {
  if (!report) return renderEmptyState()
  const contents = report.topContents ?? []
  const maxScore = contents[0]?.finalScore ?? 1

  return `
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 style="font-size:18px;font-weight:700">전체 콘텐츠 랭킹</h2>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" style="padding:6px 14px;font-size:12px" onclick="filterRanking('all')">전체</button>
        <button class="btn-secondary" style="padding:6px 14px;font-size:12px" onclick="filterRanking('kcontent')">K-Content만</button>
      </div>
    </div>
    <div id="ranking-list" class="flex flex-col gap-3">
      ${contents.map((c, i) => rankCard(c, i + 1, maxScore)).join('')}
    </div>
  </div>`
}

function rankCard(cluster, rank, maxScore) {
  const pct = maxScore > 0 ? Math.round((cluster.finalScore / maxScore) * 100) : 0
  const sourceTags = cluster.sources.map(s =>
    `<span class="source-tag">${sourceIcon(s)} ${s}</span>`).join('')
  const platformTags = cluster.platforms.map(p =>
    `<span class="source-tag">${platformIcon(p)} ${p}</span>`).join('')

  return `
  <div class="card" style="display:flex;gap:16px;align-items:flex-start">
    <span class="rank-badge ${getRankClass(rank)}" style="width:36px;height:36px;font-size:14px;flex-shrink:0">${rank}</span>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
        <h3 style="font-size:15px;font-weight:700">${cluster.representativeTitle}</h3>
        ${cluster.isKContent ? '<span class="k-badge">🇰🇷 K-Content</span>' : ''}
        <span style="font-size:11px;color:#475569;background:#1e293b;padding:2px 6px;border-radius:4px">${cluster.contentType}</span>
      </div>
      ${cluster.aliases.length > 0 ? `<p style="font-size:11px;color:#475569;margin-bottom:6px">aka: ${cluster.aliases.join(', ')}</p>` : ''}

      <!-- 점수 바 -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="score-bar" style="flex:1"><div class="score-fill" style="width:${pct}%"></div></div>
        <span style="font-size:12px;font-weight:700;color:#a78bfa;flex-shrink:0">${cluster.finalScore}pts</span>
      </div>

      <!-- 점수 분해 -->
      <div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">
        ${scoreChip('언급', cluster.mentionScore, '#7c3aed')}
        ${scoreChip('참여', cluster.engagementScore, '#0891b2')}
        ${scoreChip('최신', cluster.recencyScore, '#059669')}
      </div>

      <!-- 태그들 -->
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
        ${sourceTags}
        ${platformTags}
        ${cluster.regions.map(r => `<span class="source-tag"><i class="fas fa-globe-asia"></i> ${r}</span>`).join('')}
      </div>

      <!-- 상위 댓글 -->
      ${cluster.topComments.length > 0 ? `
        <div style="margin-top:8px;padding:10px;background:#070d1a;border-radius:8px;border:1px solid #1e293b">
          <p style="font-size:11px;color:#475569;margin-bottom:4px"><i class="fas fa-comment"></i> 주요 반응</p>
          <p style="font-size:12px;color:#94a3b8;line-height:1.5">"${cluster.topComments[0]}"</p>
        </div>
      ` : ''}

      <!-- 배우 -->
      ${cluster.actors.length > 0 ? `
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
          ${cluster.actors.map(a => `<span style="font-size:11px;padding:2px 6px;background:#1e1b4b;border:1px solid #4338ca33;border-radius:4px;color:#a5b4fc">${a}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  </div>`
}

function scoreChip(label, value, color) {
  return `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${color}22;color:${color};border:1px solid ${color}44">
    ${label}: ${Math.round(value)}
  </span>`
}

// ============================================================
// Reddit 탭
// ============================================================
function renderRedditTab(report) {
  if (!report?.redditSummary) return renderEmptyState()
  const rs = report.redditSummary

  return `
  <div class="flex flex-col gap-4">
    <h2 style="font-size:18px;font-weight:700"><i class="fab fa-reddit" style="color:#ff4500"></i> Reddit 커뮤니티 분석</h2>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- HOT 포스트 -->
      <div class="card">
        <div class="section-header">
          <span style="font-size:16px">🔥</span>
          <h3 style="font-size:14px;font-weight:700">HOT 포스트</h3>
        </div>
        <div class="flex flex-col gap-3">
          ${(rs.hotPosts ?? []).slice(0, 5).map(p => `
            <div style="padding:10px;background:#070d1a;border-radius:8px;border:1px solid #1e293b">
              <p style="font-size:12px;font-weight:500;line-height:1.4;margin-bottom:6px">${p.title}</p>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:11px;color:#64748b">r/${p.subreddit}</span>
                <span style="font-size:11px;color:#f59e0b"><i class="fas fa-arrow-up"></i> ${p.score?.toLocaleString()}</span>
                <span style="font-size:11px;color:#64748b"><i class="fas fa-comment"></i> ${p.commentCount}</span>
                ${p.flair ? `<span style="font-size:10px;padding:1px 6px;background:#1e293b;border-radius:4px;color:#94a3b8">${p.flair}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 추천 요청 -->
      <div class="card">
        <div class="section-header">
          <span style="font-size:16px">💬</span>
          <h3 style="font-size:14px;font-weight:700">가장 많이 추천된 콘텐츠</h3>
        </div>
        <div class="flex flex-col gap-2">
          ${(rs.recommendations ?? []).slice(0, 8).map((r, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;background:#070d1a;border-radius:6px">
              <span style="font-size:12px;font-weight:700;color:#64748b;width:20px">${i + 1}</span>
              <span style="font-size:13px;flex:1">${r.title}</span>
              <span style="font-size:12px;font-weight:600;color:#a78bfa">${r.count}회</span>
            </div>
          `).join('')}
          ${(rs.recommendations ?? []).length === 0 ? '<p style="color:#64748b;font-size:13px">추천 데이터 없음</p>' : ''}
        </div>
      </div>

      <!-- 리뷰 감성 -->
      <div class="card">
        <div class="section-header">
          <span style="font-size:16px">⭐</span>
          <h3 style="font-size:14px;font-weight:700">리뷰 감성 분석</h3>
        </div>
        <div class="flex flex-col gap-2">
          ${(rs.reviews ?? []).slice(0, 8).map(r => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;background:#070d1a;border-radius:6px">
              <span style="font-size:14px">${r.sentiment === 'positive' ? '😊' : r.sentiment === 'negative' ? '😞' : '😐'}</span>
              <span style="font-size:13px;flex:1">${r.title}</span>
              <span style="font-size:11px;padding:2px 6px;border-radius:4px;
                background:${r.sentiment === 'positive' ? '#05251422' : r.sentiment === 'negative' ? '#2d0a0a' : '#1e293b'};
                color:${r.sentiment === 'positive' ? '#86efac' : r.sentiment === 'negative' ? '#fca5a5' : '#94a3b8'}"
              >${r.sentiment}</span>
            </div>
          `).join('')}
          ${(rs.reviews ?? []).length === 0 ? '<p style="color:#64748b;font-size:13px">리뷰 데이터 없음</p>' : ''}
        </div>
      </div>

      <!-- 문화 질문 -->
      <div class="card">
        <div class="section-header">
          <span style="font-size:16px">🌏</span>
          <h3 style="font-size:14px;font-weight:700">문화 관련 화제</h3>
        </div>
        <div class="flex flex-col gap-2">
          ${(rs.culturalQuestions ?? []).slice(0, 8).map((q, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;background:#070d1a;border-radius:6px">
              <span style="font-size:12px;color:#64748b;width:20px">${i + 1}</span>
              <span style="font-size:13px;flex:1">${q.topic}</span>
              <span style="font-size:12px;font-weight:600;color:#22d3ee">${q.count}회</span>
            </div>
          `).join('')}
          ${(rs.culturalQuestions ?? []).length === 0 ? '<p style="color:#64748b;font-size:13px">문화 데이터 없음</p>' : ''}
        </div>
      </div>
    </div>
  </div>`
}

// ============================================================
// OTT 플랫폼 탭
// ============================================================
function renderPlatformsTab(report) {
  if (!report) return renderEmptyState()
  const byPlatform = report.topByPlatform ?? {}
  const platforms = Object.keys(byPlatform)

  return `
  <div class="flex flex-col gap-4">
    <h2 style="font-size:18px;font-weight:700"><i class="fas fa-tv"></i> OTT 플랫폼별 순위</h2>
    ${platforms.length === 0 ? '<p style="color:#64748b">플랫폼 데이터 없음</p>' : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">
      ${platforms.map(platform => {
        const items = byPlatform[platform] ?? []
        const maxScore = items[0]?.finalScore ?? 1
        return `
        <div class="card">
          <div class="section-header" style="margin-bottom:12px">
            <div style="font-size:20px">${platformIcon(platform)}</div>
            <h3 style="font-size:14px;font-weight:700;text-transform:capitalize">${platform}</h3>
            <span style="font-size:11px;color:#64748b;margin-left:auto">${items.length}개</span>
          </div>
          <div class="flex flex-col gap-2">
            ${items.slice(0, 5).map((c, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:6px;background:#070d1a;border-radius:6px">
                <span class="rank-badge ${getRankClass(i+1)}" style="width:24px;height:24px;font-size:11px">${i+1}</span>
                <span style="font-size:13px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.representativeTitle}</span>
                ${c.isKContent ? '<span class="k-badge" style="flex-shrink:0">K</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>`
      }).join('')}
    </div>

    <!-- 권역별 -->
    <h2 style="font-size:18px;font-weight:700;margin-top:8px"><i class="fas fa-globe-asia"></i> 권역별 순위</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      ${Object.entries(report.topByRegion ?? {}).map(([region, items]) => `
        <div class="card">
          <div class="section-header" style="margin-bottom:12px">
            <i class="fas fa-map-marker-alt" style="color:#f59e0b"></i>
            <h3 style="font-size:14px;font-weight:700">${region}</h3>
            <span style="font-size:11px;color:#64748b;margin-left:auto">${items.length}개</span>
          </div>
          <div class="flex flex-col gap-2">
            ${items.slice(0, 5).map((c, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:5px;background:#070d1a;border-radius:6px">
                <span class="rank-badge ${getRankClass(i+1)}" style="width:22px;height:22px;font-size:10px">${i+1}</span>
                <span style="font-size:12px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.representativeTitle}</span>
                ${c.isKContent ? '<span class="k-badge" style="font-size:9px;padding:1px 5px">K</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`
}

// ============================================================
// 인사이트 탭
// ============================================================
function renderInsightsTab(report) {
  if (!report) return renderEmptyState()
  const insights = report.insights ?? []

  return `
  <div class="flex flex-col gap-4">
    <h2 style="font-size:18px;font-weight:700"><i class="fas fa-lightbulb" style="color:#f59e0b"></i> 전체 인사이트</h2>
    <p style="font-size:13px;color:#64748b">데이터 파이프라인이 자동 생성한 인사이트 (언급량·참여도·최신성 기반)</p>
    <div class="flex flex-col gap-3">
      ${insights.map((ins, i) => `
        <div class="insight-card insight-${ins.category}" style="padding:16px 20px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:20px;flex-shrink:0;margin-top:2px">${insightIcon(ins.category)}</span>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="font-size:11px;font-weight:600;text-transform:uppercase;
                  color:${ins.category === 'rising' ? '#22c55e' : ins.category === 'dominant' ? '#f59e0b' : ins.category === 'newcomer' ? '#06b6d4' : ins.category === 'actor' ? '#a78bfa' : '#94a3b8'}"
                >${ins.category}</span>
                <span style="font-size:11px;color:#475569">score: ${ins.score}</span>
              </div>
              <p style="font-size:14px;line-height:1.7;color:#e2e8f0">${ins.text}</p>
              ${ins.evidence.length > 0 ? `
                <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px">
                  ${ins.evidence.map(e => `<span style="font-size:11px;padding:2px 8px;background:#0f172a;border:1px solid #1e293b;border-radius:4px;color:#64748b">${e}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
      ${insights.length === 0 ? '<p style="color:#64748b">인사이트 데이터 없음 — 크롤링을 먼저 실행하세요</p>' : ''}
    </div>
  </div>`
}

// ============================================================
// 아카이브 탭
// ============================================================
function renderArchiveTab() {
  return `
  <div class="flex flex-col gap-4">
    <h2 style="font-size:18px;font-weight:700"><i class="fas fa-archive"></i> 리포트 아카이브</h2>
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn-secondary" onclick="loadArchive('daily')" style="padding:6px 14px;font-size:12px">일간 리포트</button>
      <button class="btn-secondary" onclick="loadArchive('weekly')" style="padding:6px 14px;font-size:12px">주간 리포트</button>
    </div>
    <div id="archive-list" class="flex flex-col gap-3">
      <div style="display:flex;align-items:center;gap:8px;color:#64748b"><div class="spinner"></div> 로딩 중...</div>
    </div>
  </div>`
}

async function loadArchive(type = 'daily') {
  const container = document.getElementById('archive-list')
  if (!container) return
  try {
    const res = await API.get(`/reports?type=${type}&limit=20`)
    const reports = res.data.reports ?? []
    if (reports.length === 0) {
      container.innerHTML = '<p style="color:#64748b">저장된 리포트 없음 — 데모 또는 크롤링을 실행하세요</p>'
      return
    }
    container.innerHTML = reports.map(r => `
      <div class="card" style="display:flex;align-items:center;gap:16px;cursor:pointer"
        onclick="loadReportById('${r.id}')">
        <div style="width:40px;height:40px;border-radius:10px;
          background:${r.report_type === 'daily' ? '#0891b222' : '#7c3aed22'};
          display:flex;align-items:center;justify-content:center">
          <i class="fas ${r.report_type === 'daily' ? 'fa-calendar-day' : 'fa-calendar-week'}"
            style="color:${r.report_type === 'daily' ? '#22d3ee' : '#a78bfa'}"></i>
        </div>
        <div style="flex:1">
          <p style="font-size:14px;font-weight:600">${r.report_type === 'daily' ? '일간' : '주간'} 리포트</p>
          <p style="font-size:12px;color:#64748b">${formatDateFull(r.generated_at)}</p>
        </div>
        <i class="fas fa-chevron-right" style="color:#334155"></i>
      </div>
    `).join('')
  } catch (e) {
    container.innerHTML = `<p style="color:#fca5a5">로드 실패: ${e.message}</p>`
  }
}

async function loadReportById(id) {
  try {
    const res = await API.get(`/reports/${id}`)
    state.currentReport = res.data.report
    state.currentTab = 'dashboard'
    renderApp()
    showToast('리포트를 불러왔습니다', 'success')
  } catch (e) {
    showToast('리포트 로드 실패', 'error')
  }
}

// ============================================================
// 크롤링 관리 탭
// ============================================================
function renderCrawlTab() {
  return `
  <div class="flex flex-col gap-4">
    <h2 style="font-size:18px;font-weight:700"><i class="fas fa-cog"></i> 크롤링 관리</h2>

    <!-- 크롤링 설정 -->
    <div class="card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:16px">크롤링 설정</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;color:#64748b;display:block;margin-bottom:6px">리포트 타입</label>
          <select id="crawl-type" style="width:100%;padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:13px">
            <option value="daily">일간</option>
            <option value="weekly">주간</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:#64748b;display:block;margin-bottom:6px">CDP 포트 (선택)</label>
          <input id="cdp-port" type="number" placeholder="9222" style="width:100%;padding:8px 12px;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:13px" />
        </div>
      </div>

      <div style="margin-bottom:16px">
        <label style="font-size:12px;color:#64748b;display:block;margin-bottom:8px">수집 소스</label>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          ${['reddit','flixpatrol','mydramalist'].map(s => `
            <label style="display:flex;align-items:center;gap-6px;cursor:pointer;font-size:13px">
              <input type="checkbox" id="src-${s}" checked style="accent-color:#7c3aed;width:14px;height:14px;margin-right:6px" />
              ${sourceIcon(s)} ${s}
            </label>
          `).join('')}
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button class="btn-primary" id="btn-run-crawl">
          <i class="fas fa-spider"></i> 크롤링 시작
        </button>
        <button class="btn-secondary" id="btn-run-demo">
          <i class="fas fa-flask"></i> 데모 데이터로 실행
        </button>
      </div>
    </div>

    <!-- 크롤링 진행 로그 -->
    <div class="card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">실행 로그</h3>
      <div id="crawl-progress" style="background:#070d1a;border-radius:8px;padding:12px;min-height:80px;max-height:200px;overflow-y:auto;font-family:monospace;font-size:12px;color:#64748b">
        대기 중...
      </div>
    </div>

    <!-- 최근 크롤링 이력 -->
    <div class="card">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">최근 크롤링 이력</h3>
      <div id="crawl-logs-list" class="flex flex-col gap-2">
        <div style="display:flex;align-items:center;gap:8px;color:#64748b"><div class="spinner"></div> 로딩 중...</div>
      </div>
    </div>
  </div>`
}

async function loadCrawlLogs() {
  const container = document.getElementById('crawl-logs-list')
  if (!container) return
  try {
    const res = await API.get('/logs')
    const logs = res.data.logs ?? []
    if (logs.length === 0) {
      container.innerHTML = '<p style="color:#64748b;font-size:13px">크롤링 이력 없음</p>'
      return
    }
    container.innerHTML = logs.slice(0, 20).map(log => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 10px;background:#070d1a;border-radius:6px">
        <span style="color:${log.status === 'success' ? '#22c55e' : '#ef4444'};font-size:14px">
          <i class="fas fa-${log.status === 'success' ? 'check-circle' : 'times-circle'}"></i>
        </span>
        <span style="font-size:12px;width:100px;color:#94a3b8">${log.source}</span>
        <span style="font-size:12px;color:#64748b;flex:1">${formatDate(log.crawled_at)}</span>
        <span style="font-size:12px;font-weight:600;color:#a78bfa">${log.item_count}건</span>
        ${log.error ? `<span style="font-size:11px;color:#fca5a5">${log.error.slice(0,40)}</span>` : ''}
      </div>
    `).join('')
  } catch (e) {
    container.innerHTML = `<p style="color:#fca5a5">로드 실패</p>`
  }
}

// ============================================================
// 빈 상태
// ============================================================
function renderEmptyState() {
  return `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;gap:16px;color:#475569">
    <div style="width:64px;height:64px;background:#1e293b;border-radius:16px;display:flex;align-items:center;justify-content:center">
      <i class="fas fa-satellite-dish" style="font-size:28px;color:#334155"></i>
    </div>
    <div style="text-align:center">
      <p style="font-size:16px;font-weight:600;color:#64748b;margin-bottom:6px">리포트 없음</p>
      <p style="font-size:13px">상단 버튼으로 데모 실행 또는 실제 크롤링을 시작하세요</p>
    </div>
    <button class="btn-primary" id="btn-demo-empty">
      <i class="fas fa-flask"></i> 데모 데이터로 시작
    </button>
  </div>`
}

// ============================================================
// 소스 분포 차트 (Canvas 없이 순수 CSS 바로 렌더링)
// ============================================================
function renderCharts(report) {
  // Chart.js 없이 SVG/CSS 기반 미니 차트로 대체
  const sourceCtx = document.getElementById('chart-sources')
  if (sourceCtx && report.sourceSummary?.length > 0) {
    const total = report.sourceSummary.reduce((s, x) => s + x.itemCount, 0) || 1
    const colors = ['#ff4500', '#06b6d4', '#f59e0b', '#22c55e', '#a78bfa']
    sourceCtx.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0">
        ${report.sourceSummary.map((s, i) => `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:#94a3b8;width:90px;flex-shrink:0">${s.source}</span>
            <div style="flex:1;background:#1e293b;border-radius:4px;height:8px;overflow:hidden">
              <div style="width:${Math.round((s.itemCount/total)*100)}%;height:100%;background:${colors[i%colors.length]};border-radius:4px;transition:width 0.8s"></div>
            </div>
            <span style="font-size:11px;color:#64748b;width:30px;text-align:right">${s.itemCount}</span>
          </div>`).join('')}
      </div>`
  }

  // 점수 바 차트 (CSS 기반)
  const scoreCtx = document.getElementById('chart-scores')
  if (scoreCtx && report.topContents?.length > 0) {
    const top10 = report.topContents.slice(0, 10)
    const maxScore = top10[0]?.finalScore || 1
    scoreCtx.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;padding:8px 0">
        ${top10.map((c, i) => `
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:#64748b;width:16px;text-align:right;flex-shrink:0">${i+1}</span>
            <span style="font-size:11px;color:#94a3b8;width:130px;truncate;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex-shrink:0"
                  title="${c.representativeTitle}">${c.representativeTitle.slice(0,16)}</span>
            <div style="flex:1;background:#1e293b;border-radius:4px;height:8px;overflow:hidden">
              <div style="width:${Math.round((c.finalScore/maxScore)*100)}%;height:100%;background:${c.isKContent?'#7c3aed':'#334155'};border-radius:4px;transition:width 0.8s"></div>
            </div>
            <span style="font-size:10px;color:#64748b;width:44px;text-align:right;flex-shrink:0">${c.finalScore}</span>
          </div>`).join('')}
      </div>`
  }
}

// ============================================================
// 이벤트 바인딩
// ============================================================
function bindEvents() {
  // 탭 전환
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentTab = btn.dataset.tab
      renderApp()
    })
  })

  // 데모 버튼
  document.querySelectorAll('#btn-demo, #btn-demo-empty, #btn-run-demo').forEach(btn => {
    btn?.addEventListener('click', runDemo)
  })

  // 크롤링 버튼
  document.getElementById('btn-crawl')?.addEventListener('click', () => {
    state.currentTab = 'crawl'
    renderApp()
  })

  // 크롤링 실행
  document.getElementById('btn-run-crawl')?.addEventListener('click', runCrawl)
}

// ============================================================
// 데모 실행
// ============================================================
async function runDemo() {
  if (state.isLoading) return
  state.isLoading = true
  showToast('데모 데이터로 파이프라인 실행 중...', 'info')

  const progressEl = document.getElementById('crawl-progress')

  try {
    const res = await API.post('/crawl/demo', { type: 'daily' })
    if (res.data.ok) {
      state.currentReport = { data: res.data.report }
      state.currentTab = 'dashboard'
      renderApp()
      showToast('데모 리포트 생성 완료!', 'success')
    }
  } catch (e) {
    showToast(`오류: ${e.message}`, 'error')
  } finally {
    state.isLoading = false
  }
}

// ============================================================
// 실제 크롤링 실행
// ============================================================
async function runCrawl() {
  if (state.isLoading) return
  state.isLoading = true

  const progressEl = document.getElementById('crawl-progress')
  if (progressEl) progressEl.innerHTML = '<span style="color:#22d3ee">크롤링 시작...</span><br>'

  const type = document.getElementById('crawl-type')?.value ?? 'daily'
  const port = document.getElementById('cdp-port')?.value
  const sources = ['reddit', 'flixpatrol', 'mydramalist'].filter(s => {
    const el = document.getElementById(`src-${s}`)
    return el?.checked !== false
  })

  const payload = {
    type,
    sources,
    ...(port ? { remoteDebugPort: parseInt(port) } : {}),
  }

  function appendLog(msg) {
    if (!progressEl) return
    progressEl.innerHTML += `<span>${msg}</span><br>`
    progressEl.scrollTop = progressEl.scrollHeight
  }

  appendLog(`[${new Date().toLocaleTimeString()}] 소스: ${sources.join(', ')}`)
  appendLog(`[${new Date().toLocaleTimeString()}] 리포트 타입: ${type}`)

  try {
    const res = await API.post('/crawl', payload)
    if (res.data.ok) {
      ;(res.data.logs ?? []).forEach(l => appendLog(l))
      state.currentReport = { data: res.data.report }
      state.currentTab = 'dashboard'
      renderApp()
      showToast('크롤링 및 리포트 생성 완료!', 'success')
    } else {
      appendLog(`❌ 오류: ${res.data.error}`)
      showToast(`크롤링 실패: ${res.data.error}`, 'error')
    }
  } catch (e) {
    appendLog(`❌ 네트워크 오류: ${e.message}`)
    showToast(`오류: ${e.message}`, 'error')
  } finally {
    state.isLoading = false
  }
}

// ============================================================
// 랭킹 필터
// ============================================================
function filterRanking(mode) {
  const report = state.currentReport?.data
  if (!report) return
  const container = document.getElementById('ranking-list')
  if (!container) return
  const contents = mode === 'kcontent'
    ? report.topContents.filter(c => c.isKContent)
    : report.topContents
  const maxScore = contents[0]?.finalScore ?? 1
  container.innerHTML = contents.map((c, i) => rankCard(c, i + 1, maxScore)).join('')
}

// ============================================================
// 초기화
// ============================================================
async function init() {
  // 최신 리포트 자동 로드
  try {
    const res = await API.get('/reports/latest/daily')
    if (res.data.ok && res.data.report) {
      state.currentReport = res.data.report
    }
  } catch (e) {
    // 없으면 빈 상태로 시작
  }
  renderApp()
}

init()
