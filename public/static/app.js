/* ============================================================
   K-Content Intelligence Dashboard - 메인 프론트엔드 로직
   ============================================================ */

// ── 전역 상태 ────────────────────────────────────────────────
let currentReport = null
let currentPage = 'dashboard'
let currentReportType = 'daily'
let currentRankFilter = 'all'
let scoreChart = null
let allArchiveReports = []

// ── 초기화 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadLatestReport()
  loadArchive()
  setInterval(() => loadLatestReport(true), 5 * 60 * 1000) // 5분마다 자동 갱신
})

// ── 페이지 전환 ──────────────────────────────────────────────
function showPage(page) {
  currentPage = page
  document.querySelectorAll('.page-content').forEach(el => el.classList.add('hidden'))
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'))

  const pageEl = document.getElementById(`page-${page}`)
  if (pageEl) pageEl.classList.remove('hidden')

  const navBtn = document.querySelector(`[onclick="showPage('${page}')"]`)
  if (navBtn) navBtn.classList.add('active')

  const titles = {
    dashboard: ['대시보드', 'K콘텐츠 글로벌 팬 인텔리전스'],
    ranking:   ['콘텐츠 랭킹', '전체 클러스터 순위'],
    reddit:    ['Reddit 분석', '서브레딧 발화 요약'],
    platforms: ['플랫폼별 순위', 'OTT별 K콘텐츠 분포'],
    archive:   ['뉴스레터 아카이브', '저장된 리포트 목록'],
  }
  document.getElementById('pageTitle').textContent = titles[page]?.[0] ?? page
  document.getElementById('pageSubtitle').textContent = titles[page]?.[1] ?? ''

  // 페이지별 렌더링
  if (currentReport) {
    if (page === 'ranking')   renderRanking(currentReport)
    if (page === 'reddit')    renderReddit(currentReport)
    if (page === 'platforms') renderPlatforms(currentReport)
  }
  if (page === 'archive') renderArchiveList()
}

// ── 리포트 타입 변경 ─────────────────────────────────────────
function changeReportType(type) {
  currentReportType = type
  loadLatestReport()
}

// ── 최신 리포트 로드 ─────────────────────────────────────────
async function loadLatestReport(silent = false) {
  try {
    const res = await axios.get(`/api/reports/latest?type=${currentReportType}`)
    if (res.data.success) {
      currentReport = res.data.report
      renderAll(currentReport)
      const ts = new Date(currentReport.generatedAt).toLocaleString('ko-KR')
      document.getElementById('lastUpdated').textContent = `마지막 업데이트: ${ts}`
      if (!silent) showToast('리포트 로드 완료', 'success')
    }
  } catch {
    if (!silent) showToast('저장된 리포트가 없습니다. 데이터를 수집해주세요.', 'info')
  }
}

// ── 전체 렌더링 ──────────────────────────────────────────────
function renderAll(report) {
  renderStats(report)
  renderInsights(report)
  renderTopK(report)
  renderScoreChart(report)
  if (currentPage === 'ranking')   renderRanking(report)
  if (currentPage === 'reddit')    renderReddit(report)
  if (currentPage === 'platforms') renderPlatforms(report)
}

// ── 통계 카드 ────────────────────────────────────────────────
function renderStats(report) {
  const stats = { reddit: 0, flixpatrol: 0, mydramalist: 0 }
  for (const s of report.sourceSummary ?? []) stats[s.source] = s.itemCount

  animateNumber('statReddit', stats.reddit)
  animateNumber('statFlix', stats.flixpatrol)
  animateNumber('statMDL', stats.mydramalist)
  animateNumber('statClusters', report.topContents?.length ?? 0)
}

function animateNumber(id, target) {
  const el = document.getElementById(id)
  if (!el) return
  el.classList.add('stat-num-animate')
  let current = 0
  const step = Math.max(1, Math.floor(target / 20))
  const timer = setInterval(() => {
    current = Math.min(current + step, target)
    el.textContent = current.toLocaleString()
    if (current >= target) clearInterval(timer)
  }, 40)
  setTimeout(() => el.classList.remove('stat-num-animate'), 500)
}

// ── 인사이트 렌더링 ──────────────────────────────────────────
function renderInsights(report) {
  const el = document.getElementById('insightsList')
  const insights = report.insights ?? []

  if (!insights.length) {
    el.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">인사이트를 생성하려면 데이터를 수집해주세요</p>'
    return
  }

  const categoryConfig = {
    rising:    { icon: '📈', label: 'Rising',   cls: 'badge-rising' },
    dominant:  { icon: '🔥', label: 'Dominant', cls: 'badge-dominant' },
    newcomer:  { icon: '✨', label: 'Newcomer', cls: 'badge-newcomer' },
    declining: { icon: '📉', label: 'Declining',cls: 'badge-declining' },
    actor:     { icon: '🎭', label: 'Actor',    cls: 'badge-actor' },
    genre:     { icon: '🎬', label: 'Genre',    cls: 'badge-genre' },
    regional:  { icon: '🌍', label: 'Regional', cls: 'badge-regional' },
  }

  el.innerHTML = insights.map(ins => {
    const cfg = categoryConfig[ins.category] ?? { icon: '💡', label: ins.category, cls: 'badge-rising' }
    const evidence = ins.evidence?.slice(0, 2).join(' · ') ?? ''
    return `
      <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50 hover-card">
        <div class="flex items-start gap-3">
          <span class="text-lg flex-shrink-0 mt-0.5">${cfg.icon}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="badge ${cfg.cls}">${cfg.label}</span>
              <span class="text-xs text-gray-500">${ins.score}pts</span>
            </div>
            <p class="text-sm text-gray-200 leading-snug">${ins.text}</p>
            ${evidence ? `<p class="text-xs text-gray-500 mt-1">${evidence}</p>` : ''}
          </div>
        </div>
      </div>`
  }).join('')
}

// ── Top K콘텐츠 ──────────────────────────────────────────────
function renderTopK(report) {
  const el = document.getElementById('topKList')
  const kContents = (report.topContents ?? []).filter(c => c.isKContent).slice(0, 8)

  if (!kContents.length) {
    el.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">—</p>'
    return
  }

  const maxScore = kContents[0]?.finalScore ?? 1
  el.innerHTML = kContents.map((c, i) => `
    <div class="flex items-center gap-2 py-1.5">
      <span class="rank-num ${i < 3 ? `rank-${i+1}` : 'rank-other'}">#${i+1}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="text-sm text-gray-200 truncate font-medium">${escHtml(c.representativeTitle)}</span>
          <span class="badge-k">K</span>
        </div>
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${Math.round((c.finalScore/maxScore)*100)}%"></div>
        </div>
      </div>
      <span class="text-xs text-gray-500 flex-shrink-0">${c.finalScore}</span>
    </div>`
  ).join('')
}

// ── 점수 분포 차트 ───────────────────────────────────────────
function renderScoreChart(report) {
  const top10 = (report.topContents ?? []).slice(0, 10)
  if (!top10.length) return

  const ctx = document.getElementById('scoreChart')?.getContext('2d')
  if (!ctx) return

  if (scoreChart) scoreChart.destroy()

  const labels = top10.map(c => c.representativeTitle.length > 20
    ? c.representativeTitle.slice(0, 18) + '…'
    : c.representativeTitle)

  const colors = top10.map(c => c.isKContent
    ? 'rgba(248,113,113,0.8)'
    : 'rgba(96,165,250,0.8)')

  scoreChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Mention Score',
          data: top10.map(c => c.mentionScore),
          backgroundColor: 'rgba(248,113,113,0.7)',
          borderRadius: 4,
        },
        {
          label: 'Engagement Score',
          data: top10.map(c => c.engagementScore),
          backgroundColor: 'rgba(251,191,36,0.7)',
          borderRadius: 4,
        },
        {
          label: 'Recency Score',
          data: top10.map(c => c.recencyScore),
          backgroundColor: 'rgba(96,165,250,0.7)',
          borderRadius: 4,
        },
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#9CA3AF', font: { size: 11 } } },
        tooltip: { backgroundColor: '#1F2937', titleColor: '#F9FAFB', bodyColor: '#D1D5DB' },
      },
      scales: {
        x: {
          stacked: false,
          ticks: { color: '#6B7280', font: { size: 10 } },
          grid: { color: 'rgba(55,65,81,0.5)' },
        },
        y: {
          ticks: { color: '#6B7280', font: { size: 10 } },
          grid: { color: 'rgba(55,65,81,0.5)' },
        },
      },
    }
  })
}

// ── 랭킹 테이블 ──────────────────────────────────────────────
function filterRanking(filter) {
  currentRankFilter = filter
  document.querySelectorAll('.rank-filter-btn').forEach(el => el.classList.remove('active'))
  document.querySelector(`[onclick="filterRanking('${filter}')"]`)?.classList.add('active')
  if (currentReport) renderRanking(currentReport)
}

function renderRanking(report) {
  const el = document.getElementById('rankingTable')
  let contents = report.topContents ?? []

  // 필터 적용
  if (currentRankFilter === 'k')     contents = contents.filter(c => c.isKContent)
  if (currentRankFilter === 'drama') contents = contents.filter(c => c.contentType === 'drama')
  if (currentRankFilter === 'movie') contents = contents.filter(c => c.contentType === 'movie')

  if (!contents.length) {
    el.innerHTML = '<div class="text-sm text-gray-500 text-center py-16">해당 조건의 콘텐츠가 없습니다</div>'
    return
  }

  el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="text-xs text-gray-500 border-b border-gray-800">
          <th class="px-4 py-3 text-left w-12">#</th>
          <th class="px-4 py-3 text-left">제목</th>
          <th class="px-4 py-3 text-left hidden md:table-cell">타입</th>
          <th class="px-4 py-3 text-left hidden lg:table-cell">소스</th>
          <th class="px-4 py-3 text-left hidden lg:table-cell">플랫폼</th>
          <th class="px-4 py-3 text-right">점수</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-800/50">
        ${contents.map((c, i) => {
          const rankCls = i < 3 ? `rank-${i+1}` : 'rank-other'
          const sourceBadges = c.sources.slice(0, 3).map(s =>
            `<span class="source-badge source-${s}">${s}</span>`).join(' ')
          const platformStr = c.platforms.slice(0, 2).map(p =>
            `<span class="text-xs text-gray-400">${p}</span>`).join(' ')
          const typeBadge = c.contentType !== 'unknown'
            ? `<span class="text-xs text-gray-400">${c.contentType}</span>` : ''

          return `
            <tr class="hover:bg-gray-800/40 transition-colors cursor-pointer" onclick="showClusterDetail(${i})">
              <td class="px-4 py-3">
                <span class="rank-num ${rankCls}">${i+1}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-100">${escHtml(c.representativeTitle)}</span>
                  ${c.isKContent ? '<span class="badge-k">K</span>' : ''}
                </div>
                ${c.aliases.length > 0 ? `<div class="text-xs text-gray-500 mt-0.5">= ${escHtml(c.aliases[0])}</div>` : ''}
              </td>
              <td class="px-4 py-3 hidden md:table-cell">${typeBadge}</td>
              <td class="px-4 py-3 hidden lg:table-cell"><div class="flex gap-1 flex-wrap">${sourceBadges}</div></td>
              <td class="px-4 py-3 hidden lg:table-cell">${platformStr || '—'}</td>
              <td class="px-4 py-3 text-right">
                <span class="font-bold text-rose-400">${c.finalScore}</span>
              </td>
            </tr>`
        }).join('')}
      </tbody>
    </table>`
}

// ── 클러스터 상세 (모달) ─────────────────────────────────────
function showClusterDetail(index) {
  const c = currentReport?.topContents?.[index]
  if (!c) return

  const modal = document.createElement('div')
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm'
  modal.onclick = (e) => { if (e.target === modal) modal.remove() }

  const sourceBadges = c.sources.map(s =>
    `<span class="source-badge source-${s}">${s}</span>`).join(' ')

  const topComments = c.topComments?.slice(0, 3).map(comment =>
    `<li class="text-xs text-gray-400 border-l-2 border-gray-700 pl-3 py-1">${escHtml(comment.slice(0, 200))}${comment.length > 200 ? '…' : ''}</li>`
  ).join('') ?? ''

  modal.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-lg font-bold text-white">${escHtml(c.representativeTitle)}</h3>
            ${c.isKContent ? '<span class="badge-k">K</span>' : ''}
          </div>
          ${c.aliases.length > 0 ? `<p class="text-xs text-gray-400">= ${c.aliases.slice(0,3).map(escHtml).join(', ')}</p>` : ''}
        </div>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-300 text-lg">✕</button>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-gray-800 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">최종 점수</div>
          <div class="text-2xl font-bold text-rose-400">${c.finalScore}</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-3">
          <div class="text-xs text-gray-400 mb-1">타입</div>
          <div class="text-sm font-semibold text-gray-200">${c.contentType}</div>
        </div>
      </div>

      <div class="space-y-3 mb-4">
        <div>
          <div class="text-xs text-gray-400 mb-1.5">점수 분해</div>
          <div class="space-y-1.5">
            ${scoreBreakdown('Mention', c.mentionScore, '#F87171')}
            ${scoreBreakdown('Engagement', c.engagementScore, '#FCD34D')}
            ${scoreBreakdown('Recency', c.recencyScore, '#60A5FA')}
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-1.5">소스</div>
          <div class="flex gap-1 flex-wrap">${sourceBadges}</div>
        </div>
        ${c.platforms.length > 0 ? `
        <div>
          <div class="text-xs text-gray-400 mb-1.5">플랫폼</div>
          <div class="text-sm text-gray-300">${c.platforms.join(', ')}</div>
        </div>` : ''}
        ${c.regions.length > 0 ? `
        <div>
          <div class="text-xs text-gray-400 mb-1.5">권역</div>
          <div class="text-sm text-gray-300">${c.regions.join(', ')}</div>
        </div>` : ''}
        ${c.actors.length > 0 ? `
        <div>
          <div class="text-xs text-gray-400 mb-1.5">배우</div>
          <div class="text-sm text-gray-300">${c.actors.slice(0,5).join(', ')}</div>
        </div>` : ''}
      </div>

      ${topComments ? `
      <div>
        <div class="text-xs text-gray-400 mb-2">주요 댓글</div>
        <ul class="space-y-1.5">${topComments}</ul>
      </div>` : ''}
    </div>`

  document.body.appendChild(modal)
}

function scoreBreakdown(label, score, color) {
  const maxScore = 300
  const pct = Math.min(100, Math.round((score / maxScore) * 100))
  return `
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 w-20">${label}</span>
      <div class="flex-1 bg-gray-800 rounded h-1.5">
        <div class="h-full rounded" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="text-xs text-gray-400 w-8 text-right">${score}</span>
    </div>`
}

// ── Reddit 분석 ──────────────────────────────────────────────
function renderReddit(report) {
  const summary = report.redditSummary
  if (!summary) {
    document.querySelectorAll('#page-reddit .space-y-3, #page-reddit .space-y-2').forEach(el => {
      el.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">Reddit 데이터가 없습니다</p>'
    })
    return
  }

  // 핫 포스트
  const hotEl = document.getElementById('redditHotPosts')
  hotEl.innerHTML = (summary.hotPosts ?? []).slice(0, 5).map(p => `
    <a href="${escHtml(p.url)}" target="_blank" rel="noopener" class="block bg-gray-800/60 rounded-lg p-3 border border-gray-700/50 hover:border-gray-600 transition-colors">
      <div class="flex items-start gap-2">
        <span class="text-orange-400 text-xs font-bold flex-shrink-0 mt-0.5">r/${escHtml(p.subreddit)}</span>
        ${p.flair ? `<span class="text-xs text-purple-400 flex-shrink-0">[${escHtml(p.flair)}]</span>` : ''}
      </div>
      <p class="text-sm text-gray-200 mt-1 leading-snug">${escHtml(p.title)}</p>
      <div class="flex gap-3 mt-1.5 text-xs text-gray-500">
        <span>↑ ${(p.score||0).toLocaleString()}</span>
        <span>💬 ${(p.commentCount||0).toLocaleString()}</span>
      </div>
    </a>`
  ).join('') || '<p class="text-sm text-gray-500 text-center py-8">—</p>'

  // 추천 요청
  const recsEl = document.getElementById('redditRecs')
  recsEl.innerHTML = (summary.recommendations ?? []).slice(0, 10).map((r, i) => `
    <div class="flex items-center gap-2 py-1">
      <span class="rank-num ${i < 3 ? `rank-${i+1}` : 'rank-other'}">${i+1}</span>
      <span class="flex-1 text-sm text-gray-200 truncate">${escHtml(r.title)}</span>
      <span class="text-xs text-blue-400">${r.count}회</span>
    </div>`
  ).join('') || '<p class="text-sm text-gray-500 text-center py-8">—</p>'

  // 리뷰 감성
  const reviewsEl = document.getElementById('redditReviews')
  reviewsEl.innerHTML = (summary.reviews ?? []).slice(0, 8).map(r => {
    const sentCfg = {
      positive: { cls: 'sentiment-positive', icon: '😊', label: '긍정' },
      mixed:    { cls: 'sentiment-mixed',    icon: '😐', label: '혼재' },
      negative: { cls: 'sentiment-negative', icon: '😞', label: '부정' },
    }[r.sentiment] ?? { cls: 'sentiment-mixed', icon: '😐', label: '혼재' }
    return `
      <div class="flex items-center gap-2 py-1">
        <span class="text-sm">${sentCfg.icon}</span>
        <span class="flex-1 text-sm text-gray-200 truncate">${escHtml(r.title)}</span>
        <span class="text-xs text-gray-400">${sentCfg.label}</span>
        <span class="text-xs text-gray-500">${r.count}건</span>
      </div>`
  }).join('') || '<p class="text-sm text-gray-500 text-center py-8">—</p>'

  // 문화 질문
  const cultureEl = document.getElementById('redditCulture')
  cultureEl.innerHTML = (summary.culturalQuestions ?? []).slice(0, 8).map(q => `
    <div class="flex items-center gap-2 py-1">
      <span class="text-purple-400 text-sm">🌏</span>
      <span class="flex-1 text-sm text-gray-200 capitalize">${escHtml(q.topic)}</span>
      <span class="text-xs text-gray-500">${q.count}회</span>
    </div>`
  ).join('') || '<p class="text-sm text-gray-500 text-center py-8">—</p>'
}

// ── 플랫폼별 ─────────────────────────────────────────────────
function renderPlatforms(report) {
  const el = document.getElementById('platformsGrid')
  const byPlatform = report.topByPlatform ?? {}

  if (Object.keys(byPlatform).length === 0) {
    el.innerHTML = '<div class="text-sm text-gray-500 text-center py-16 col-span-full">데이터를 수집해주세요</div>'
    return
  }

  const platformIcon = {
    netflix: '🎬', disney: '🏰', apple: '🍎', amazon: '📦',
    hulu: '📺', hbo: '🎭', paramount: '⛰️', other: '📡',
  }

  el.innerHTML = Object.entries(byPlatform).map(([platform, contents]) => {
    const icon = platformIcon[platform] ?? '📡'
    const headerCls = `platform-${platform}` || 'platform-default'
    const kCount = contents.filter(c => c.isKContent).length

    return `
      <div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover-card">
        <div class="${headerCls} px-4 py-3">
          <div class="flex items-center justify-between">
            <span class="font-bold text-white capitalize">${icon} ${platform}</span>
            <span class="text-xs text-white/70">${contents.length}개 콘텐츠</span>
          </div>
          <div class="text-xs text-white/60 mt-0.5">K콘텐츠: ${kCount}개</div>
        </div>
        <div class="p-3 space-y-1.5">
          ${contents.slice(0, 8).map((c, i) => `
            <div class="flex items-center gap-2">
              <span class="rank-num ${i < 3 ? `rank-${i+1}` : 'rank-other'} text-xs">${i+1}</span>
              <span class="flex-1 text-xs text-gray-200 truncate">${escHtml(c.representativeTitle)}</span>
              ${c.isKContent ? '<span class="badge-k">K</span>' : ''}
            </div>`
          ).join('')}
        </div>
      </div>`
  }).join('')
}

// ── 아카이브 ─────────────────────────────────────────────────
async function loadArchive() {
  try {
    const res = await axios.get('/api/reports?limit=30')
    if (res.data.success) {
      allArchiveReports = res.data.reports ?? []
      renderArchiveList()
    }
  } catch { /* ignore */ }
}

function renderArchiveList() {
  const el = document.getElementById('archiveList')
  if (!allArchiveReports.length) {
    el.innerHTML = '<p class="text-sm text-gray-500 text-center py-8">아직 리포트가 없습니다</p>'
    return
  }

  el.innerHTML = allArchiveReports.map(r => {
    const dt = new Date(r.generated_at).toLocaleString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    const typeLabel = r.report_type === 'daily' ? '일간' : '주간'
    const typeCls = r.report_type === 'daily' ? 'text-blue-400' : 'text-yellow-400'
    return `
      <button onclick="loadArchiveReport('${r.id}')"
        class="w-full text-left bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600
               rounded-lg px-3 py-2 transition-all">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold ${typeCls}">${typeLabel}</span>
          <span class="text-xs text-gray-500">${dt}</span>
        </div>
        <div class="text-xs text-gray-400 mt-0.5">ID: ${r.id.slice(-8)}</div>
      </button>`
  }).join('')
}

async function loadArchiveReport(id) {
  try {
    const res = await axios.get(`/api/reports/${id}`)
    if (res.data.success) {
      const report = res.data.report
      renderNewsletterPreview(report)
    }
  } catch (err) {
    showToast('리포트 로드 실패', 'error')
  }
}

// ── 뉴스레터 생성 ────────────────────────────────────────────
function renderNewsletterPreview(report) {
  const el = document.getElementById('newsletterPreview')
  const date = new Date(report.generatedAt).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric'
  })
  const typeLabel = report.reportType === 'daily' ? '일간' : '주간'

  const topContents = (report.topContents ?? []).slice(0, 10)
  const topK = topContents.filter(c => c.isKContent).slice(0, 5)
  const insights = (report.insights ?? []).slice(0, 5)

  el.innerHTML = `
    <h2>📊 K-Content Intelligence ${typeLabel} 리포트</h2>
    <p style="color:#6B7280;font-size:12px;margin-bottom:16px">${date} | 자동 생성</p>

    <h3>🏆 이번 ${typeLabel} Top K-Content</h3>
    <ul>
      ${topK.map((c, i) => `<li>#${i+1} <strong>${escHtml(c.representativeTitle)}</strong> — Score ${c.finalScore} | ${c.sources.join(', ')}</li>`).join('')}
    </ul>

    <h3>💡 핵심 인사이트</h3>
    <ul>
      ${insights.map(ins => `<li>${ins.text}</li>`).join('')}
    </ul>

    <h3>📈 전체 Top 10</h3>
    <ul>
      ${topContents.map((c, i) => `<li>#${i+1} ${escHtml(c.representativeTitle)} ${c.isKContent ? '[K]' : ''} — ${c.finalScore}pts</li>`).join('')}
    </ul>

    ${report.redditSummary ? `
    <h3>🔴 Reddit 핫 토픽</h3>
    <ul>
      ${(report.redditSummary.hotPosts ?? []).slice(0, 3).map(p =>
        `<li>${escHtml(p.title)} (↑${p.score})</li>`).join('')}
    </ul>` : ''}

    <h3>📊 수집 소스</h3>
    <ul>
      ${(report.sourceSummary ?? []).map(s => `<li>${s.source}: ${s.itemCount}개 항목</li>`).join('')}
    </ul>

    <p style="color:#6B7280;font-size:11px;margin-top:16px;border-top:1px solid #374151;padding-top:8px">
      Generated by K-Content Intelligence Dashboard · ${new Date().toLocaleString('ko-KR')}
    </p>`
}

function exportNewsletter() {
  const content = document.getElementById('newsletterPreview')?.innerHTML
  if (!content || content.includes('왼쪽에서')) {
    showToast('먼저 리포트를 선택해주세요', 'info')
    return
  }
  const blob = new Blob([`<html><body style="font-family:Georgia,serif;max-width:640px;margin:40px auto;color:#111">${content}</body></html>`], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `k-content-newsletter-${Date.now()}.html`
  a.click()
  showToast('뉴스레터 내보내기 완료', 'success')
}

// ── 크롤링 트리거 ────────────────────────────────────────────
async function triggerCrawl() {
  const btn = document.getElementById('crawlBtn')
  const statusEl = document.getElementById('crawlStatus')

  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> 수집 중...'
  statusEl.classList.remove('hidden')
  statusEl.textContent = '크롤러 서비스에 연결 중...'

  const steps = [
    { text: 'Reddit 서브레딧 수집 중...', delay: 0 },
    { text: 'FlixPatrol OTT 순위 수집 중...', delay: 3000 },
    { text: 'MyDramaList 드라마 순위 수집 중...', delay: 6000 },
    { text: '데이터 파이프라인 처리 중...', delay: 9000 },
    { text: '클러스터링 + 점수화 중...', delay: 12000 },
    { text: '인사이트 생성 중...', delay: 15000 },
  ]

  // UI 단계 표시 (크롤링 동안 진행 상황 시각화)
  steps.forEach(s => {
    setTimeout(() => { statusEl.textContent = s.text }, s.delay)
  })

  try {
    const res = await axios.post('/api/crawl', { reportType: currentReportType }, { timeout: 120000 })
    if (res.data.success) {
      currentReport = res.data.report
      renderAll(currentReport)
      await loadArchive()
      showToast(`수집 완료! 클러스터 ${currentReport.topContents?.length}개 생성`, 'success')
    } else {
      showToast(`수집 실패: ${res.data.error}`, 'error')
    }
  } catch (err) {
    const msg = err?.response?.data?.error ?? err?.message ?? '알 수 없는 오류'
    showToast(`크롤러 연결 오류: ${msg}`, 'error')
  } finally {
    btn.disabled = false
    btn.innerHTML = '<i class="fas fa-sync-alt"></i> 데이터 수집 시작'
    setTimeout(() => statusEl.classList.add('hidden'), 3000)
  }
}

// ── 유틸리티 ─────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function showToast(message, type = 'info') {
  const icons = { success: '✓', error: '✗', info: 'ℹ' }
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}
