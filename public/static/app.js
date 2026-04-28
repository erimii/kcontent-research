// ============================================================
// K-Content Intelligence Dashboard - Frontend App
// ============================================================

const API = {
  health:       () => fetch('/api/health').then(r => r.json()),
  demo:  (type = 'daily') => fetch('/api/crawl/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  }).then(r => r.json()),
  crawl: (type = 'daily', sources = ['reddit','flixpatrol','mydramalist']) => fetch('/api/crawl', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sources })
  }).then(r => r.json()),
  scheduleTrigger: (type = 'daily', sources = ['reddit','flixpatrol','mydramalist']) => fetch('/api/schedule/trigger', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sources })
  }).then(r => r.json()),
  reports:      (type = 'daily') => fetch(`/api/reports?type=${type}&limit=20`).then(r => r.json()),
  latestReport: (type = 'daily') => fetch(`/api/reports/latest/${type}`).then(r => r.json()),
  report:       (id) => fetch(`/api/reports/${id}`).then(r => r.json()),
  deleteReport: (id) => fetch(`/api/reports/${id}`, { method: 'DELETE' }).then(r => r.json()),
  logs:         () => fetch('/api/logs').then(r => r.json()),
  search:       (q, kOnly = false) => fetch(`/api/search?q=${encodeURIComponent(q)}&konly=${kOnly}`).then(r => r.json()),
  schedule:     () => fetch('/api/schedule').then(r => r.json()),
  stats:        () => fetch('/api/stats').then(r => r.json()),
  newsletterUrl:(id) => `/api/newsletter/${id}`,
}

// ============================================================
// State
// ============================================================
const state = {
  page: 'dashboard',
  reportType: 'daily',
  currentReport: null,
  reports: [],
  logs: [],
  crawling: false,
  crawlLogs: [],
  stats: null,
  schedule: null,
}

// ============================================================
// Utils
// ============================================================
function timeAgo(iso) {
  if (!iso) return '-'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '방금 전'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

function fmtDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtDateFull(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtScore(n) {
  return typeof n === 'number' ? n.toFixed(0) : '-'
}

function rankColor(i) {
  if (i === 0) return 'gold'
  if (i === 1) return 'silver'
  if (i === 2) return 'bronze'
  return ''
}

function insightIcon(cat) {
  const map = { dominant: '👑', rising: '📈', newcomer: '🌟', declining: '📉', actor: '🎭', genre: '🎬', regional: '🌏' }
  return map[cat] || '💡'
}

function sourceColor(s) {
  const map = { reddit: '#ff6534', flixpatrol: '#4f8ef7', mydramalist: '#9b59b6', letterboxd: '#2ecc71', fundex: '#f39c12' }
  return map[s] || '#7986cb'
}

function contentTypeBadge(type) {
  if (type === 'drama') return '<span class="badge badge-drama">드라마</span>'
  if (type === 'movie') return '<span class="badge badge-movie">영화</span>'
  return ''
}

function toast(msg, type = 'info') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  document.getElementById('toast-container').appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ============================================================
// Page: Dashboard
// ============================================================
function renderDashboard() {
  const r = state.currentReport
  if (!r) {
    return `
      <div class="page-header">
        <div>
          <div class="page-title">📊 대시보드</div>
          <div class="page-sub">K-Content 글로벌 팬 인텔리전스</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="runDemo('daily')"><i class="fas fa-vial"></i> 데모 실행</button>
          <button class="btn btn-primary" onclick="navigateTo('crawl')"><i class="fas fa-spider"></i> 크롤링 시작</button>
        </div>
      </div>
      <div style="padding:24px 28px">
        <div class="empty-state">
          <i class="fas fa-chart-line"></i>
          <p style="font-size:16px;margin-bottom:8px;color:var(--text-primary)">아직 리포트가 없습니다</p>
          <p>데모 실행으로 파이프라인을 테스트하거나, 크롤링을 시작해보세요.</p>
          <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
            <button class="btn btn-primary" onclick="runDemo('daily')"><i class="fas fa-play"></i> 데모 실행</button>
            <button class="btn btn-outline" onclick="navigateTo('crawl')"><i class="fas fa-spider"></i> 실제 크롤링</button>
          </div>
        </div>
      </div>`
  }

  const topK = r.topContents?.filter(c => c.isKContent) || []
  const allContents = r.topContents || []

  // 플랫폼별 TOP N 추출 (finalScore 기준, 이미 정렬됨)
  const platformTop = (key, n = 7) => allContents
    .filter(c => c.platforms?.includes(key))
    .slice(0, n)

  // Reddit 버즈 TOP 5: 댓글 수 기준
  const redditBuzz = [...allContents]
    .filter(c => c.sources.includes('reddit'))
    .sort((a, b) => {
      const aC = a.rawItems?.filter(i => i.source==='reddit').reduce((s,i)=>s+i.commentCount,0) || 0
      const bC = b.rawItems?.filter(i => i.source==='reddit').reduce((s,i)=>s+i.commentCount,0) || 0
      return bC - aC
    })
    .slice(0, 5)

  // MyDramaList 독점 (플랫폼 없음)
  const mdlOnly = allContents
    .filter(c => (!c.platforms || c.platforms.length === 0) && c.sources.includes('mydramalist'))
    .slice(0, 5)

  const netflix = platformTop('netflix', 7)
  const disney  = platformTop('disney', 5)
  const apple   = platformTop('apple', 5)

  // 플랫폼별 K-콘텐츠 비율
  const kRatio = (list) => list.length ? Math.round(list.filter(c=>c.isKContent).length / list.length * 100) : 0

  // 공통 랭크 아이템 렌더러
  const rankItem = (c, i, extraHtml = '') => `
    <div class="plat-rank-item">
      <div class="rank-num ${rankColor(i)}">${i+1}</div>
      <div class="plat-rank-info">
        <div class="plat-rank-title" title="${escHtml(c.representativeTitle)}">${escHtml(c.representativeTitle)}</div>
        <div class="plat-rank-meta">
          ${c.isKContent ? '<span class="badge badge-k">K</span>' : ''}
          ${contentTypeBadge(c.contentType)}
          ${extraHtml}
        </div>
      </div>
      <div class="rank-score">${fmtScore(c.finalScore)}</div>
    </div>`

  // 플랫폼 헤더 렌더러
  const platHeader = (icon, label, accentColor, list, subLabel = '') => `
    <div class="card-header" style="border-left:3px solid ${accentColor}">
      <div class="card-title">
        <i class="${icon}" style="color:${accentColor}"></i> ${label}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${list.length ? `<span class="plat-k-ratio" style="background:${accentColor}22;color:${accentColor}">K ${kRatio(list)}%</span>` : ''}
        <span style="font-size:10px;color:var(--text-muted)">${subLabel || `TOP ${list.length}`}</span>
      </div>
    </div>`

  return `
    <div class="page-header">
      <div>
        <div class="page-title">📊 대시보드</div>
        <div class="page-sub">
          ${r.reportType === 'daily' ? '일간' : '주간'} 리포트 · ${fmtDateFull(r.generatedAt)}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="openNewsletter('${r.id}')">
          <i class="fas fa-newspaper"></i> 뉴스레터
        </button>
        <button class="btn btn-outline" onclick="runDemo('${state.reportType}')">
          <i class="fas fa-sync-alt"></i> 새로고침
        </button>
        <button class="btn btn-primary" onclick="navigateTo('crawl')">
          <i class="fas fa-robot"></i> 크롤링
        </button>
      </div>
    </div>

    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:20px">

      <!-- Stats -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">🎬 총 콘텐츠</div>
          <div class="stat-value" style="color:var(--accent-blue)">${allContents.length}</div>
          <div class="stat-change">중복 제거 후</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">🇰🇷 K-콘텐츠</div>
          <div class="stat-value" style="color:var(--accent-pink)">${topK.length}</div>
          <div class="stat-change">전체의 ${allContents.length ? Math.round(topK.length/allContents.length*100) : 0}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">💡 인사이트</div>
          <div class="stat-value" style="color:var(--accent-green)">${r.insights?.length || 0}</div>
          <div class="stat-change">자동 생성</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">📡 수집 소스</div>
          <div class="stat-value" style="color:var(--accent-orange)">${r.sourceSummary?.length || 0}</div>
          <div class="stat-change">${r.sourceSummary?.map(s => `${s.source}(${s.itemCount})`).join(' · ') || '-'}</div>
        </div>
      </div>

      <!-- 플랫폼별 섹션 헤더 -->
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">
        📺 플랫폼별 인기 콘텐츠
      </div>

      <!-- 1행: Netflix (큰 카드) + Disney+ + Apple TV+ -->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;align-items:start">

        <!-- Netflix TOP 7 -->
        <div class="card">
          ${platHeader('fas fa-play-circle', 'Netflix', '#e50914', netflix, `TOP ${netflix.length}`)}
          <div class="card-body" style="padding:4px 14px">
            ${netflix.length === 0
              ? '<div class="plat-empty">데이터 없음</div>'
              : netflix.map((c, i) => rankItem(c, i,
                  c.regions?.length ? `<span style="font-size:10px;color:var(--text-muted)">${c.regions.slice(0,2).join('·')}</span>` : ''
                )).join('')}
          </div>
        </div>

        <!-- Disney+ TOP 5 -->
        <div class="card">
          ${platHeader('fas fa-star', 'Disney+', '#4f8ef7', disney)}
          <div class="card-body" style="padding:4px 14px">
            ${disney.length === 0
              ? '<div class="plat-empty">데이터 없음</div>'
              : disney.map((c, i) => rankItem(c, i,
                  c.regions?.length ? `<span style="font-size:10px;color:var(--text-muted)">${c.regions[0]}</span>` : ''
                )).join('')}
          </div>
        </div>

        <!-- Apple TV+ TOP 5 -->
        <div class="card">
          ${platHeader('fab fa-apple', 'Apple TV+', '#a0a0a0', apple)}
          <div class="card-body" style="padding:4px 14px">
            ${apple.length === 0
              ? '<div class="plat-empty">데이터 없음</div>'
              : apple.map((c, i) => rankItem(c, i)).join('')}
          </div>
        </div>

      </div>

      <!-- 2행: Reddit 버즈 + MyDramaList 독점 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">

        <!-- Reddit 버즈 TOP 5 -->
        <div class="card">
          <div class="card-header" style="border-left:3px solid #ff6534">
            <div class="card-title">
              <i class="fab fa-reddit" style="color:#ff6534"></i> Reddit 버즈
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:10px;color:var(--text-muted)">댓글 수 기준</span>
              <button class="btn btn-outline" style="padding:2px 8px;font-size:10px" onclick="navigateTo('reddit')">전체 보기</button>
            </div>
          </div>
          <div class="card-body" style="padding:4px 14px">
            ${redditBuzz.length === 0
              ? '<div class="plat-empty">Reddit 데이터 없음</div>'
              : redditBuzz.map((c, i) => {
                  const rItems = c.rawItems?.filter(ri => ri.source === 'reddit') || []
                  const totalComments = rItems.reduce((s, ri) => s + ri.commentCount, 0)
                  const totalScore    = rItems.reduce((s, ri) => s + (ri.score || 0), 0)
                  const postUrl  = rItems[0]?.metadata?.url || ''
                  const sub      = rItems[0]?.metadata?.subreddit || ''
                  return `
                    <div class="plat-rank-item">
                      <div class="rank-num ${rankColor(i)}">${i+1}</div>
                      <div class="plat-rank-info">
                        <div class="plat-rank-title">
                          ${postUrl
                            ? `<a href="${postUrl}" target="_blank" rel="noopener noreferrer" class="reddit-plat-link">${escHtml(c.representativeTitle)}</a>`
                            : escHtml(c.representativeTitle)}
                        </div>
                        <div class="plat-rank-meta">
                          ${c.isKContent ? '<span class="badge badge-k">K</span>' : ''}
                          ${sub ? `<a href="https://reddit.com/r/${sub}" target="_blank" style="color:#ff6534;font-size:10px;text-decoration:none">r/${sub}</a>` : ''}
                          <span style="font-size:10px;color:var(--text-muted)">▲${totalScore.toLocaleString()}</span>
                        </div>
                      </div>
                      <div style="font-size:11px;color:#ff6534;white-space:nowrap;font-weight:600">
                        💬 ${totalComments}
                      </div>
                    </div>`
                }).join('')}
          </div>
        </div>

        <!-- MyDramaList 독점 인기작 -->
        <div class="card">
          <div class="card-header" style="border-left:3px solid #9b59b6">
            <div class="card-title">
              <i class="fas fa-star" style="color:#9b59b6"></i> MyDramaList 인기작
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${mdlOnly.length ? `<span class="plat-k-ratio" style="background:#9b59b622;color:#9b59b6">K ${kRatio(mdlOnly)}%</span>` : ''}
              <span style="font-size:10px;color:var(--text-muted)">스트리밍 미집계</span>
            </div>
          </div>
          <div class="card-body" style="padding:4px 14px">
            ${mdlOnly.length === 0
              ? '<div class="plat-empty">모든 항목이 플랫폼에 포함됨</div>'
              : mdlOnly.map((c, i) => {
                  const mdlItem = c.rawItems?.find(ri => ri.source === 'mydramalist')
                  const rating = mdlItem?.metadata?.rating
                  const genres = c.genres?.slice(0,2).join(', ') || ''
                  return `
                    <div class="plat-rank-item">
                      <div class="rank-num ${rankColor(i)}">${i+1}</div>
                      <div class="plat-rank-info">
                        <div class="plat-rank-title" title="${escHtml(c.representativeTitle)}">${escHtml(c.representativeTitle)}</div>
                        <div class="plat-rank-meta">
                          ${c.isKContent ? '<span class="badge badge-k">K</span>' : ''}
                          ${contentTypeBadge(c.contentType)}
                          ${rating ? `<span style="font-size:10px;color:#f1c40f">★ ${rating}</span>` : ''}
                          ${genres ? `<span style="font-size:10px;color:var(--text-muted)">${genres}</span>` : ''}
                        </div>
                      </div>
                      <div class="rank-score">${fmtScore(c.finalScore)}</div>
                    </div>`
                }).join('')}
          </div>
        </div>

      </div>

      <!-- Insights -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-lightbulb" style="color:var(--accent-orange)"></i> 자동 인사이트</div>
          <span style="font-size:11px;color:var(--text-muted)">${r.insights?.length || 0}개 생성됨</span>
        </div>
        <div class="card-body">
          ${(r.insights || []).map(ins => `
            <div class="insight-item ${ins.category}">
              <div class="insight-icon">${insightIcon(ins.category)}</div>
              <div style="flex:1">
                <div class="insight-text">${escHtml(ins.text)}</div>
                <div class="insight-evidence">
                  ${(ins.evidence || []).map(e => `<span class="insight-chip">${escHtml(e)}</span>`).join('')}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Reddit Summary -->
      ${r.redditSummary ? `
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fab fa-reddit" style="color:#ff6534"></i> Reddit 커뮤니티 요약</div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;font-weight:600">📋 추천 요청</div>
              ${(r.redditSummary.recommendations || []).slice(0,5).map(rec => `
                <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">
                  <span>${escHtml(rec.title)}</span>
                  <span style="color:var(--text-muted)">${rec.count}회</span>
                </div>`).join('')}
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;font-weight:600">⭐ 리뷰 언급</div>
              ${(r.redditSummary.reviews || []).slice(0,5).map(rev => `
                <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">
                  <span>${escHtml(rev.title)}</span>
                  <span class="badge ${rev.sentiment === 'positive' ? 'badge-success' : rev.sentiment === 'negative' ? 'badge-failed' : 'badge-new'}">${rev.sentiment}</span>
                </div>`).join('')}
            </div>
            <div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;font-weight:600">🌏 문화 질문</div>
              ${(r.redditSummary.culturalQuestions || []).slice(0,5).map(q => `
                <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">
                  <span>${escHtml(q.topic)}</span>
                  <span style="color:var(--text-muted)">${q.count}회</span>
                </div>`).join('')}
            </div>
          </div>
          ${r.redditSummary.hotPosts?.length ? `
          <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.06);padding-top:14px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600">🔥 인기 포스트</div>
              <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="navigateTo('reddit')">전체 보기 →</button>
            </div>
            ${(r.redditSummary.hotPosts || []).slice(0,3).map(p => `
              <div class="reddit-post">
                <a class="reddit-title-link" href="${p.url}" target="_blank" rel="noopener noreferrer">
                  ${escHtml(p.title)}
                  <i class="fas fa-external-link-alt" style="font-size:10px;margin-left:5px;opacity:0.5"></i>
                </a>
                <div class="reddit-meta">
                  <a href="https://reddit.com/r/${p.subreddit}" target="_blank" rel="noopener noreferrer" style="color:#ff6534;text-decoration:none">r/${p.subreddit}</a>
                  <span>▲ ${p.score}</span>
                  <span>💬 ${p.commentCount}</span>
                  <span>${timeAgo(p.createdAt)}</span>
                  ${p.flair ? `<span class="badge badge-new">${escHtml(p.flair)}</span>` : ''}
                </div>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>` : ''}

    </div>`
}

// ============================================================
// Page: Reddit
// ============================================================
function renderReddit() {
  const r = state.currentReport
  if (!r || !r.redditSummary) return `
    <div class="page-header">
      <div><div class="page-title"><i class="fab fa-reddit" style="color:#ff6534"></i> Reddit 포스트</div>
      <div class="page-sub">수집된 Reddit 포스트 목록</div></div>
    </div>
    <div style="padding:28px">${renderNoReport()}</div>`

  const posts = r.redditSummary.hotPosts || []
  // rawItems에서 Reddit 소스 전체 포스트 URL 맵 구성
  const urlMap = {}
  for (const cluster of (r.topContents || [])) {
    for (const item of (cluster.rawItems || [])) {
      if (item.source === 'reddit' && item.metadata?.url) {
        urlMap[item.rawTitle] = {
          url: item.metadata.url,
          subreddit: item.metadata.subreddit,
          originalTitle: item.metadata.originalTitle || item.rawTitle,
        }
      }
    }
  }

  const activeTab = window._redditTab || 'hot'
  const subreddits = ['전체', 'kdramas', 'kdrama', 'kdramarecommends', 'korean', 'koreatravel']
  const activeSub  = window._redditSub || '전체'

  let displayPosts = posts
  if (activeSub !== '전체') displayPosts = displayPosts.filter(p => p.subreddit === activeSub)

  return `
    <div class="page-header">
      <div>
        <div class="page-title"><i class="fab fa-reddit" style="color:#ff6534"></i> Reddit 포스트</div>
        <div class="page-sub">수집된 Reddit 포스트 · ${posts.length}개 (클릭하면 원문으로 이동)</div>
      </div>
      <button class="btn btn-outline" onclick="navigateTo('crawl')">
        <i class="fas fa-sync-alt"></i> 새로 수집
      </button>
    </div>
    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:16px">

      <!-- 필터 바 -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <div class="tabs" style="width:fit-content">
          ${subreddits.map(sub => `
            <button class="tab-btn ${activeSub === sub ? 'active' : ''}" onclick="setRedditSub('${sub}')">${sub === '전체' ? '전체' : 'r/' + sub}</button>
          `).join('')}
        </div>
        <span style="font-size:12px;color:var(--text-muted)">${displayPosts.length}개</span>
      </div>

      <!-- 포스트 목록 -->
      <div class="card">
        <div class="card-body" style="padding:0">
          ${displayPosts.length === 0
            ? '<div class="empty-state"><i class="fab fa-reddit"></i><p>포스트 없음</p></div>'
            : displayPosts.map((p, i) => `
              <div class="reddit-post-row" onclick="window.open('${p.url}', '_blank')">
                <div class="reddit-post-rank">${i + 1}</div>
                <div class="reddit-post-body">
                  <a class="reddit-post-title" href="${p.url}" target="_blank" rel="noopener noreferrer"
                    onclick="event.stopPropagation()">
                    ${escHtml(p.title)}
                    <i class="fas fa-external-link-alt" style="font-size:10px;margin-left:6px;opacity:0.4"></i>
                  </a>
                  <div class="reddit-post-meta">
                    <a href="https://reddit.com/r/${p.subreddit}" target="_blank" rel="noopener noreferrer"
                      onclick="event.stopPropagation()" class="reddit-sub-link">r/${p.subreddit}</a>
                    <span><i class="fas fa-arrow-up" style="font-size:10px"></i> ${p.score.toLocaleString()}</span>
                    <span><i class="fas fa-comment" style="font-size:10px"></i> ${p.commentCount}</span>
                    <span>${timeAgo(p.createdAt)}</span>
                    ${p.flair ? `<span class="badge badge-new">${escHtml(p.flair)}</span>` : ''}
                  </div>
                  ${p.comments?.length ? `
                  <div class="reddit-comments-preview">
                    ${p.comments.slice(0,2).map(c => `
                      <div class="reddit-comment-chip">
                        <i class="fas fa-quote-left" style="font-size:9px;opacity:0.4;margin-right:4px"></i>
                        ${escHtml(c.body?.slice(0, 120))}${c.body?.length > 120 ? '...' : ''}
                      </div>`).join('')}
                  </div>` : ''}
                </div>
              </div>`).join('')
          }
        </div>
      </div>

      <!-- 클러스터에서 추출한 Reddit 연결 항목 -->
      ${Object.keys(urlMap).length > 0 ? `
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-link"></i> 랭킹에 반영된 Reddit 포스트</div>
          <span style="font-size:11px;color:var(--text-muted)">${Object.keys(urlMap).length}개</span>
        </div>
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead><tr><th>제목</th><th>서브레딧</th><th>링크</th></tr></thead>
            <tbody>
              ${Object.entries(urlMap).map(([title, info]) => `
                <tr style="cursor:pointer" onclick="window.open('${info.url}', '_blank')">
                  <td style="font-size:13px">${escHtml(info.originalTitle)}</td>
                  <td><a href="https://reddit.com/r/${info.subreddit}" target="_blank" onclick="event.stopPropagation()" style="color:#ff6534;text-decoration:none">r/${info.subreddit}</a></td>
                  <td>
                    <a href="${info.url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
                      class="btn btn-outline" style="padding:3px 10px;font-size:11px">
                      <i class="fas fa-external-link-alt"></i> 원문 보기
                    </a>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

    </div>`
}

function setRedditSub(sub) {
  window._redditSub = sub
  renderPage()
}

// ============================================================
// Page: Ranking
// ============================================================
function renderRanking() {
  const r = state.currentReport
  if (!r) return renderNoReport()

  const activeTab = window._rankTab || 'all'
  let items = r.topContents || []
  if (activeTab === 'k')          items = items.filter(c => c.isKContent)
  if (activeTab === 'reddit')     items = items.filter(c => c.sources.includes('reddit'))
  if (activeTab === 'flixpatrol') items = items.filter(c => c.sources.includes('flixpatrol'))
  if (activeTab === 'multi')      items = items.filter(c => c.sources.length >= 2)
  const maxScore = items[0]?.finalScore || 1

  return `
    <div class="page-header">
      <div>
        <div class="page-title">🏆 콘텐츠 랭킹</div>
        <div class="page-sub">${fmtDate(r.generatedAt)} · ${items.length}개 항목</div>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
        <div class="tabs" style="width:fit-content">
          ${[['all','전체'],['k','🇰🇷 K-콘텐츠'],['multi','멀티소스'],['reddit','Reddit'],['flixpatrol','FlixPatrol']].map(([tab, label]) =>
            `<button class="tab-btn ${activeTab===tab?'active':''}" onclick="setRankTab('${tab}')">${label}</button>`
          ).join('')}
        </div>
        <div style="flex:1"></div>
        <span style="font-size:12px;color:var(--text-muted)">총 ${items.length}개</span>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:40px">#</th>
                <th>제목</th>
                <th>타입</th>
                <th>소스</th>
                <th>플랫폼</th>
                <th>배우</th>
                <th style="text-align:right">점수</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((c, i) => `
                <tr>
                  <td><span class="rank-num ${rankColor(i)}" style="font-size:13px">${i+1}</span></td>
                  <td>
                    <div style="font-size:13px;font-weight:500">${escHtml(c.representativeTitle)}</div>
                    ${c.aliases?.length ? `<div style="font-size:11px;color:var(--text-muted)">별칭: ${c.aliases.slice(0,2).join(', ')}</div>` : ''}
                    <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">
                      ${c.isKContent ? '<span class="badge badge-k">K</span>' : ''}
                      ${renderRedditSourceLinks(c.rawItems)}
                    </div>
                  </td>
                  <td>${contentTypeBadge(c.contentType) || '<span style="color:var(--text-muted)">-</span>'}</td>
                  <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap">
                      ${c.sources.map(s => `<span style="font-size:11px;color:${sourceColor(s)}">${s}</span>`).join('<span style="color:var(--text-muted)"> · </span>')}
                    </div>
                  </td>
                  <td style="font-size:11px;color:var(--text-muted)">${c.platforms?.join(', ') || '-'}</td>
                  <td style="font-size:11px;color:var(--text-muted)">${c.actors?.slice(0,2).join(', ') || '-'}</td>
                  <td style="text-align:right">
                    <div class="score-bar-wrap">
                      <div class="score-bar"><div class="score-fill" style="width:${Math.round(c.finalScore/maxScore*100)}%"></div></div>
                      <span style="font-size:12px;color:var(--accent-blue);min-width:36px;text-align:right">${fmtScore(c.finalScore)}</span>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`
}

// ============================================================
// Page: Crawl
// ============================================================
function renderCrawl() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">🤖 크롤링 제어</div>
        <div class="page-sub">Playwright 기반 실제 데이터 수집</div>
      </div>
    </div>
    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:20px">

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-cog"></i> 크롤링 설정</div>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
            ${[
              ['reddit',      'fab fa-reddit', '#ff6534',  'Reddit',      'r/kdramas, r/kdrama 등 5개 서브레딧'],
              ['flixpatrol',  'fas fa-film',   '#4f8ef7',  'FlixPatrol',  'Netflix·Disney+ 글로벌 순위'],
              ['mydramalist', 'fas fa-star',   '#9b59b6',  'MyDramaList', '한국 드라마 인기 순위'],
            ].map(([id, icon, color, label, desc]) => `
              <label style="cursor:pointer">
                <div class="card" style="padding:14px;border-color:${color}33;transition:all 0.2s" id="src-${id}-card">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
                    <input type="checkbox" id="src-${id}" checked onchange="updateSourceCard('${id}')"
                      style="accent-color:${color};width:16px;height:16px">
                    <i class="${icon}" style="color:${color};font-size:16px"></i>
                    <span style="font-weight:600;font-size:13px">${label}</span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);padding-left:26px">${desc}</div>
                </div>
              </label>`).join('')}
          </div>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="tabs" style="width:fit-content">
              <button class="tab-btn active" id="type-daily"  onclick="setCrawlType('daily')">일간</button>
              <button class="tab-btn"        id="type-weekly" onclick="setCrawlType('weekly')">주간</button>
            </div>
            <button class="btn btn-primary" id="crawl-btn" onclick="startCrawl()">
              <i class="fas fa-spider"></i> 실제 크롤링 시작
            </button>
            <button class="btn btn-outline" onclick="runDemo(window._crawlType||'daily')">
              <i class="fas fa-vial"></i> 데모 데이터로 실행
            </button>
          </div>
        </div>
      </div>

      <!-- 실행 로그 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-terminal"></i> 실행 로그</div>
          <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="loadLogs()">새로고침</button>
        </div>
        <div class="card-body" id="crawl-log-area"
          style="min-height:120px;max-height:280px;overflow-y:auto;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px">
          ${state.crawlLogs.length === 0
            ? '<div class="empty-state" style="padding:24px"><i class="fas fa-terminal"></i><p>크롤링을 시작하면 여기에 로그가 표시됩니다</p></div>'
            : state.crawlLogs.map(l => `<div class="log-line ${l.type||'info'}">${escHtml(l.msg)}</div>`).join('')}
        </div>
      </div>

      <!-- 크롤링 이력 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-history"></i> 크롤링 이력</div>
        </div>
        <div class="card-body" style="padding:0" id="log-table">
          <div class="loading-overlay"><div class="spinner"></div> 로딩 중...</div>
        </div>
      </div>
    </div>`
}

// ============================================================
// Page: History (Archive)
// ============================================================
function renderHistory() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">📁 리포트 아카이브</div>
        <div class="page-sub">생성된 모든 리포트 목록</div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="tabs" style="width:fit-content">
          <button class="tab-btn ${state.reportType==='daily'?'active':''}"  onclick="setHistoryType('daily')">일간</button>
          <button class="tab-btn ${state.reportType==='weekly'?'active':''}" onclick="setHistoryType('weekly')">주간</button>
        </div>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div class="card">
        <div class="card-body" style="padding:0" id="history-table">
          <div class="loading-overlay"><div class="spinner"></div> 로딩 중...</div>
        </div>
      </div>
    </div>`
}

// ============================================================
// Page: Search
// ============================================================
function renderSearch() {
  return `
    <div class="page-header">
      <div>
        <div class="page-title">🔍 콘텐츠 검색</div>
        <div class="page-sub">수집된 콘텐츠 스냅샷 검색</div>
      </div>
    </div>
    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="card-body">
          <div style="display:flex;gap:10px">
            <input type="text" id="search-input" placeholder="콘텐츠 제목 검색..."
              style="flex:1;padding:10px 14px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none"
              onkeydown="if(event.key==='Enter')doSearch()"
              oninput="if(this.value.length===0)clearSearch()">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-muted);cursor:pointer;white-space:nowrap">
              <input type="checkbox" id="konly-check" style="accent-color:var(--accent-pink)"> K-콘텐츠만
            </label>
            <button class="btn btn-primary" onclick="doSearch()"><i class="fas fa-search"></i> 검색</button>
          </div>
        </div>
      </div>
      <div class="card" id="search-results">
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <p>검색어를 입력하고 Enter 또는 검색 버튼을 누르세요</p>
        </div>
      </div>
    </div>`
}

// ============================================================
// Page: Schedule
// ============================================================
function renderSchedule() {
  const s = state.schedule
  return `
    <div class="page-header">
      <div>
        <div class="page-title">⏰ 스케줄 & 자동화</div>
        <div class="page-sub">크롤링 일정 관리 및 수동 트리거</div>
      </div>
      <button class="btn btn-outline" onclick="loadSchedule()"><i class="fas fa-sync-alt"></i> 새로고침</button>
    </div>
    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:20px">

      <!-- 스케줄 정보 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-sun" style="color:var(--accent-orange)"></i> 일간 스케줄</div>
            <span class="badge badge-success">활성</span>
          </div>
          <div class="card-body">
            <div style="font-size:22px;font-weight:700;color:var(--accent-blue);margin-bottom:6px">매일 오전 9시</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Reddit + FlixPatrol + MyDramaList</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">다음 실행</div>
            <div style="font-size:13px;color:var(--text-primary)">${s ? fmtDateFull(s.nextDaily) : '-'}</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <div class="card-title"><i class="fas fa-calendar-week" style="color:var(--accent-purple)"></i> 주간 스케줄</div>
            <span class="badge badge-success">활성</span>
          </div>
          <div class="card-body">
            <div style="font-size:22px;font-weight:700;color:var(--accent-purple);margin-bottom:6px">매주 월요일 오전 8시</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">전체 소스 종합 리포트</div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">다음 실행</div>
            <div style="font-size:13px;color:var(--text-primary)">${s ? fmtDateFull(s.nextWeekly) : '-'}</div>
          </div>
        </div>
      </div>

      <!-- 수동 트리거 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-hand-pointer"></i> 수동 트리거</div>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <button class="btn btn-primary" id="trigger-daily-btn" onclick="triggerSchedule('daily')">
              <i class="fas fa-play"></i> 일간 크롤링 실행
            </button>
            <button class="btn btn-outline" id="trigger-weekly-btn" onclick="triggerSchedule('weekly')">
              <i class="fas fa-calendar"></i> 주간 크롤링 실행
            </button>
            <button class="btn btn-outline" onclick="runDemo('daily')">
              <i class="fas fa-vial"></i> 데모 실행
            </button>
            <div id="trigger-status" style="font-size:12px;color:var(--text-muted)"></div>
          </div>
          <div id="trigger-log" style="margin-top:14px;font-family:monospace;font-size:12px;background:rgba(0,0,0,0.2);border-radius:8px;padding:12px;min-height:60px;display:none"></div>
        </div>
      </div>

      <!-- 최근 크롤링 이력 -->
      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-history"></i> 최근 실행 이력</div>
        </div>
        <div class="card-body" style="padding:0" id="schedule-log-table">
          ${s && s.lastRuns?.length ? renderLogTable(s.lastRuns)
            : '<div class="empty-state"><i class="fas fa-history"></i><p>실행 이력 없음</p></div>'}
        </div>
      </div>

      <!-- 시스템 통계 -->
      <div class="card" id="stats-card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-chart-bar"></i> 시스템 통계</div>
        </div>
        <div class="card-body">
          <div class="loading-overlay"><div class="spinner"></div> 로딩 중...</div>
        </div>
      </div>
    </div>`
}

function renderLogTable(logs) {
  if (!logs?.length) return '<div class="empty-state"><i class="fas fa-history"></i><p>이력 없음</p></div>'
  return `
    <table class="data-table">
      <thead><tr><th>소스</th><th>수집 시각</th><th>아이템 수</th><th>상태</th><th>오류</th></tr></thead>
      <tbody>
        ${logs.map(l => `
          <tr>
            <td><span style="color:${sourceColor(l.source)}">${l.source}</span></td>
            <td style="color:var(--text-muted)">${fmtDate(l.crawled_at)}</td>
            <td style="font-weight:600">${l.item_count}</td>
            <td><span class="badge ${l.status === 'success' ? 'badge-success' : 'badge-failed'}">${l.status}</span></td>
            <td style="font-size:11px;color:#e74c3c;max-width:180px;overflow:hidden;text-overflow:ellipsis">${l.error || '-'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`
}

function renderRedditSourceLinks(rawItems) {
  if (!rawItems?.length) return ''
  const redditItems = rawItems.filter(i => i.source === 'reddit' && i.metadata?.url)
  if (!redditItems.length) return ''
  return redditItems.map(i => `
    <a href="${i.metadata.url}" target="_blank" rel="noopener noreferrer"
      title="${escHtml(i.metadata.originalTitle || i.rawTitle)}"
      style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#ff6534;text-decoration:none;margin-right:6px"
      onclick="event.stopPropagation()">
      <i class="fab fa-reddit"></i>
      r/${i.metadata.subreddit}
      <i class="fas fa-external-link-alt" style="font-size:9px;opacity:0.5"></i>
    </a>`).join('')
}

function renderNoReport() {
  return `
    <div style="padding:28px">
      <div class="empty-state">
        <i class="fas fa-database"></i>
        <p>아직 리포트가 없습니다. 먼저 크롤링 또는 데모를 실행해주세요.</p>
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center">
          <button class="btn btn-primary" onclick="runDemo('daily')"><i class="fas fa-vial"></i> 데모 실행</button>
          <button class="btn btn-outline" onclick="navigateTo('crawl')">크롤링 시작</button>
        </div>
      </div>
    </div>`
}

// ============================================================
// Navigation
// ============================================================
function navigateTo(page) {
  state.page = page
  render()
  if (page === 'crawl')    setTimeout(loadLogs, 100)
  if (page === 'history')  setTimeout(loadHistory, 100)
  if (page === 'schedule') setTimeout(loadSchedule, 100)
  if (page === 'reddit')   { window._redditSub = '전체'; renderPage() }
}

function setRankTab(tab) {
  window._rankTab = tab
  renderPage()
}

function setCrawlType(type) {
  window._crawlType = type
  document.querySelectorAll('#type-daily,#type-weekly').forEach(b => b.classList.remove('active'))
  document.getElementById(`type-${type}`)?.classList.add('active')
}

function setHistoryType(type) {
  state.reportType = type
  render()
  setTimeout(loadHistory, 100)
}

function updateSourceCard(id) {
  const checked = document.getElementById(`src-${id}`)?.checked
  const card = document.getElementById(`src-${id}-card`)
  if (card) card.style.opacity = checked ? '1' : '0.4'
}

// ============================================================
// Data Actions
// ============================================================
async function loadLatestReport() {
  try {
    const res = await API.latestReport(state.reportType)
    if (res.ok && res.report) state.currentReport = res.report
  } catch (e) { console.warn('최신 리포트 로드 실패:', e) }
}

async function runDemo(type = 'daily') {
  toast('데모 파이프라인 실행 중...', 'info')
  try {
    const res = await API.demo(type)
    if (res.ok) {
      state.currentReport = res.report
      state.reportType = type
      toast(`✅ 완료! 클러스터: ${res.report.topContents?.length}개, 인사이트: ${res.report.insights?.length}개`, 'success')
      navigateTo('dashboard')
    } else {
      toast('❌ 오류: ' + (res.error || '알 수 없는 오류'), 'error')
    }
  } catch (e) {
    toast('❌ 연결 오류: ' + e.message, 'error')
  }
}

async function startCrawl() {
  if (state.crawling) return
  const type = window._crawlType || 'daily'
  const sources = ['reddit','flixpatrol','mydramalist'].filter(s => document.getElementById(`src-${s}`)?.checked)
  if (!sources.length) { toast('최소 1개 소스를 선택하세요', 'error'); return }

  state.crawling = true
  state.crawlLogs = []
  const btn = document.getElementById('crawl-btn')
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> 크롤링 중...' }

  const logArea = document.getElementById('crawl-log-area')
  const addLog = (msg, type = 'info') => {
    state.crawlLogs.push({ msg, type })
    if (logArea) {
      const d = document.createElement('div')
      d.className = `log-line ${type}`
      d.textContent = `[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`
      logArea.appendChild(d)
      logArea.scrollTop = logArea.scrollHeight
    }
  }

  if (logArea) logArea.innerHTML = ''
  addLog(`크롤링 시작: ${sources.join(', ')} (${type})`, 'info')

  try {
    const res = await API.crawl(type, sources)
    if (res.ok) {
      state.currentReport = res.report
      ;(res.logs || []).forEach(l => addLog(l, 'success'))
      addLog(`✅ 완료! 클러스터: ${res.report.topContents?.length}개`, 'success')
      toast('크롤링 완료!', 'success')
    } else {
      ;(res.logs || []).forEach(l => addLog(l, 'info'))
      addLog('❌ 오류: ' + (res.error || ''), 'error')
      toast('크롤링 실패: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    addLog('❌ 연결 오류: ' + e.message, 'error')
    toast('크롤링 서버 오류', 'error')
  } finally {
    state.crawling = false
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-spider"></i> 실제 크롤링 시작' }
  }
}

async function triggerSchedule(type) {
  const btnId = `trigger-${type}-btn`
  const btn = document.getElementById(btnId)
  const statusEl = document.getElementById('trigger-status')
  const logEl = document.getElementById('trigger-log')

  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> 실행 중...' }
  if (statusEl) statusEl.textContent = `${type === 'daily' ? '일간' : '주간'} 크롤링 실행 중...`
  if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = '' }

  const addLog = (msg, cls = 'info') => {
    if (!logEl) return
    const d = document.createElement('div')
    d.className = `log-line ${cls}`
    d.textContent = `[${new Date().toLocaleTimeString('ko-KR')}] ${msg}`
    logEl.appendChild(d)
    logEl.scrollTop = logEl.scrollHeight
  }
  addLog(`스케줄 트리거: ${type}`)

  try {
    const res = await API.scheduleTrigger(type)
    if (res.ok) {
      ;(res.logs || []).forEach(l => addLog(l, 'success'))
      addLog(`✅ 완료 (${res.elapsed}s) - reportId: ${res.reportId}`, 'success')
      if (statusEl) statusEl.textContent = `✅ 완료!`
      toast('스케줄 크롤링 완료!', 'success')
      // 최신 리포트 갱신
      await loadLatestReport()
    } else {
      ;(res.logs || []).forEach(l => addLog(l, 'info'))
      addLog('❌ 실패: ' + (res.error || ''), 'error')
      if (statusEl) statusEl.textContent = '❌ 실패'
      toast('크롤링 실패', 'error')
    }
  } catch (e) {
    addLog('❌ 연결 오류: ' + e.message, 'error')
    toast('서버 오류', 'error')
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = type === 'daily' ? '<i class="fas fa-play"></i> 일간 크롤링 실행' : '<i class="fas fa-calendar"></i> 주간 크롤링 실행' }
  }
}

async function loadLogs() {
  const el = document.getElementById('log-table')
  if (!el) return
  try {
    const res = await API.logs()
    el.innerHTML = res.ok && res.logs?.length ? renderLogTable(res.logs)
      : '<div class="empty-state"><i class="fas fa-history"></i><p>크롤링 이력 없음</p></div>'
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>로딩 실패</p></div>`
  }
}

async function loadHistory() {
  const el = document.getElementById('history-table')
  if (!el) return
  try {
    const res = await API.reports(state.reportType)
    if (res.ok && res.reports?.length) {
      el.innerHTML = `
        <table class="data-table">
          <thead><tr><th>타입</th><th>생성 일시</th><th>기간</th><th>액션</th></tr></thead>
          <tbody>
            ${res.reports.map(r => `
              <tr>
                <td><span class="badge ${r.report_type === 'daily' ? 'badge-drama' : 'badge-new'}">${r.report_type === 'daily' ? '일간' : '주간'}</span></td>
                <td>${fmtDate(r.generated_at)}</td>
                <td style="font-size:11px;color:var(--text-muted)">${fmtDate(r.period_from)} ~ ${fmtDate(r.period_to)}</td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="loadAndShowReport('${r.id}')">
                      <i class="fas fa-eye"></i> 보기
                    </button>
                    <button class="btn btn-outline" style="padding:4px 10px;font-size:11px" onclick="openNewsletter('${r.id}')">
                      <i class="fas fa-newspaper"></i> 뉴스레터
                    </button>
                    <button class="btn btn-danger" style="padding:4px 10px;font-size:11px" onclick="deleteReport('${r.id}')">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`
    } else {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><p>저장된 리포트 없음</p></div>'
    }
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>로딩 실패</p></div>`
  }
}

async function loadSchedule() {
  try {
    const res = await API.schedule()
    if (res.ok) { state.schedule = res; renderPage() }
  } catch (e) { console.warn('스케줄 로드 실패:', e) }

  // 통계도 로드
  try {
    const statsEl = document.getElementById('stats-card')?.querySelector('.card-body')
    const res = await API.stats()
    if (res.ok && statsEl) {
      const st = res.stats
      statsEl.innerHTML = `
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-label">📋 총 리포트</div>
            <div class="stat-value" style="color:var(--accent-blue)">${st.totalReports}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">🎬 총 스냅샷</div>
            <div class="stat-value" style="color:var(--accent-green)">${st.totalSnapshots}</div>
            <div class="stat-change">K-콘텐츠 ${st.kRatio}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">🔄 크롤링 횟수</div>
            <div class="stat-value" style="color:var(--accent-orange)">${st.totalCrawls}</div>
            <div class="stat-change">성공률 ${st.successRate}%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">🇰🇷 K-스냅샷</div>
            <div class="stat-value" style="color:var(--accent-pink)">${st.kSnapshots}</div>
          </div>
        </div>`
    }
  } catch (e) { console.warn('통계 로드 실패:', e) }
}

async function loadAndShowReport(id) {
  try {
    const res = await API.report(id)
    if (res.ok) {
      state.currentReport = res.report
      navigateTo('dashboard')
      toast('리포트를 불러왔습니다', 'success')
    }
  } catch (e) { toast('리포트 로딩 실패', 'error') }
}

async function deleteReport(id) {
  if (!confirm('이 리포트를 삭제하시겠습니까?')) return
  try {
    const res = await API.deleteReport(id)
    if (res.ok) {
      toast('삭제 완료', 'success')
      loadHistory()
    } else toast('삭제 실패', 'error')
  } catch (e) { toast('삭제 실패', 'error') }
}

function openNewsletter(id) {
  window.open(API.newsletterUrl(id), '_blank')
}

async function doSearch() {
  const q = document.getElementById('search-input')?.value?.trim()
  if (!q) return
  const kOnly = document.getElementById('konly-check')?.checked
  const el = document.getElementById('search-results')
  if (!el) return
  el.innerHTML = '<div class="loading-overlay"><div class="spinner"></div> 검색 중...</div>'
  try {
    const res = await API.search(q, kOnly)
    if (res.ok && res.results?.length) {
      el.innerHTML = `
        <div class="card-body">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">"${escHtml(q)}" 검색 결과: ${res.results.length}건</div>
          ${res.results.map((r, i) => `
            <div class="rank-item">
              <div class="rank-num ${rankColor(i)}">${i+1}</div>
              <div class="rank-info">
                <div class="rank-title">${escHtml(r.title)}</div>
                <div class="rank-meta">
                  ${r.is_k_content ? '<span class="badge badge-k">K</span>' : ''}
                  ${contentTypeBadge(r.content_type)}
                  <span>소스: ${JSON.parse(r.sources||'[]').join(', ')}</span>
                  <span>${timeAgo(r.created_at)}</span>
                </div>
              </div>
              <div class="rank-score">${fmtScore(r.final_score)}pts</div>
            </div>`).join('')}
        </div>`
    } else {
      el.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>"${escHtml(q)}" 검색 결과 없음</p></div>`
    }
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>검색 실패</p></div>`
  }
}

function clearSearch() {
  const el = document.getElementById('search-results')
  if (el) el.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>검색어를 입력하세요</p></div>'
}

// ============================================================
// Sidebar
// ============================================================
function renderSidebar() {
  const redditCount = state.currentReport?.redditSummary?.hotPosts?.length || 0
  const nav = [
    ['dashboard', 'fas fa-chart-pie',    '대시보드'],
    ['ranking',   'fas fa-trophy',        '콘텐츠 랭킹'],
    ['reddit',    'fab fa-reddit',        `Reddit 포스트${redditCount ? ` <span style="background:#ff653422;color:#ff6534;border-radius:10px;padding:1px 6px;font-size:10px">${redditCount}</span>` : ''}`],
    ['crawl',     'fas fa-spider',        '크롤링'],
    ['schedule',  'fas fa-clock',         '스케줄'],
    ['history',   'fas fa-folder-open',   '아카이브'],
    ['search',    'fas fa-search',        '검색'],
  ]
  return `
    <div class="sidebar" id="sidebar">
      <div class="logo">
        <div class="logo-title">K-Content Intel</div>
        <div class="logo-sub">글로벌 팬 인텔리전스</div>
      </div>
      <div class="nav-section">
        <div class="nav-label">메뉴</div>
        ${nav.map(([page, icon, label]) => `
          <div class="nav-item ${state.page === page ? 'active' : ''}" onclick="navigateTo('${page}')">
            <i class="${icon}"></i>
            <span>${label}</span>
          </div>`).join('')}
      </div>
      <div style="flex:1"></div>
      <div style="padding:12px 16px;border-top:1px solid var(--border)">
        <div style="font-size:10px;color:var(--text-muted)">K-Content Intelligence v1.0</div>
        ${state.currentReport ? `
          <div style="font-size:10px;color:var(--accent-green);margin-top:4px">
            ● 데이터 로드됨 · ${state.currentReport.topContents?.length}개 콘텐츠
          </div>` : `
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px">● 데이터 없음</div>`}
      </div>
    </div>`
}

// ============================================================
// Main render
// ============================================================
function renderPage() {
  const pages = {
    dashboard: renderDashboard,
    ranking:   renderRanking,
    reddit:    renderReddit,
    crawl:     renderCrawl,
    history:   renderHistory,
    search:    renderSearch,
    schedule:  renderSchedule,
  }
  const fn = pages[state.page] || renderDashboard
  document.getElementById('page-content').innerHTML = fn()
}

function render() {
  document.getElementById('sidebar-wrap').innerHTML = renderSidebar()
  renderPage()
}

// ============================================================
// Init
// ============================================================
async function init() {
  document.getElementById('app').innerHTML = `
    <div id="toast-container" class="toast-container"></div>
    <div id="sidebar-wrap"></div>
    <div class="main-content" id="page-content"></div>`

  render()

  await loadLatestReport()
  if (state.currentReport) {
    toast('최신 리포트 로드 완료', 'success')
    render()
  } else {
    await runDemo('daily')
  }
}

window._crawlType = 'daily'
window._rankTab   = 'all'

document.addEventListener('DOMContentLoaded', init)
