// ============================================================
// K-Content Intelligence Dashboard - Frontend App
// ============================================================

// 안전한 JSON 파싱 - HTML이 응답되거나 서버 재시작 중일 때 에러 방지
async function safeJsonFetch(input, init) {
  let res
  try {
    res = await fetch(input, init)
  } catch (e) {
    // 네트워크 오류 (서버 다운 등)
    throw new Error(`연결 오류: 서버에 접근할 수 없습니다. (${e.message})`)
  }
  const text = await res.text()
  // 서버가 HTML을 반환한 경우 (재시작 중, 라우트 미스 등)
  if (text.trimStart().startsWith('<')) {
    if (!res.ok) {
      throw new Error(`서버 오류 (${res.status}): 서버가 재시작 중이거나 일시적으로 응답할 수 없습니다.`)
    }
    throw new Error(`응답 오류: JSON 대신 HTML 페이지가 반환되었습니다. 잠시 후 다시 시도해주세요.`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`JSON 파싱 실패: ${text.slice(0, 80)}...`)
  }
}

const API = {
  health:       () => safeJsonFetch('/api/health'),
  demo:  (type = 'daily') => safeJsonFetch('/api/crawl/demo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  }),
  crawl: (type = 'daily') => safeJsonFetch('/api/crawl', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sources: ['reddit'] })
  }),
  scheduleTrigger: (type = 'daily') => safeJsonFetch('/api/schedule/trigger', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sources: ['reddit'] })
  }),
  reports:      (type = 'daily') => safeJsonFetch(`/api/reports?type=${type}&limit=20`),
  latestReport: (type = 'daily') => safeJsonFetch(`/api/reports/latest/${type}`),
  report:       (id) => safeJsonFetch(`/api/reports/${id}`),
  deleteReport: (id) => safeJsonFetch(`/api/reports/${id}`, { method: 'DELETE' }),
  logs:         () => safeJsonFetch('/api/logs'),
  search:       (q, kOnly = false) => safeJsonFetch(`/api/search?q=${encodeURIComponent(q)}&konly=${kOnly}`),
  schedule:     () => safeJsonFetch('/api/schedule'),
  stats:        () => safeJsonFetch('/api/stats'),
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
  mdlSummary: null,
  mdlLoading: false,
  gtrendsSummary: null,
  gtrendsLoading: false,
  youtubeSummary: null,
  youtubeLoading: false,
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
  const map = { reddit: '#ff6534' }
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
// 접기/펼치기 헬퍼 — 상단 N개만 노출, "더보기" 토글로 전체 표시
// ============================================================
function collapsibleSection(id, items, initialCount, renderFn) {
  if (!items || items.length === 0) return ''
  const safeId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_')
  const visible = items.slice(0, initialCount).map(renderFn).join('')
  const hidden = items.slice(initialCount)
  if (hidden.length === 0) return visible
  return `
    <div data-collapse-id="${safeId}">
      ${visible}
      <div data-collapse-extra style="display:none">
        ${hidden.map(renderFn).join('')}
      </div>
      <button onclick="toggleCollapse('${safeId}', this)" data-collapse-label="더보기 (+${hidden.length}) ▼"
        style="display:block;width:100%;margin-top:8px;padding:7px 10px;background:rgba(255,255,255,0.03);border:1px dashed rgba(255,255,255,0.12);border-radius:6px;font-size:11px;color:var(--text-muted);cursor:pointer;transition:background 0.15s,color 0.15s"
        onmouseover="this.style.background='rgba(255,255,255,0.06)';this.style.color='var(--text-primary)'"
        onmouseout="this.style.background='rgba(255,255,255,0.03)';this.style.color='var(--text-muted)'">
        더보기 (+${hidden.length}) ▼
      </button>
    </div>`
}

function toggleCollapse(id, btn) {
  const root = document.querySelector(`[data-collapse-id="${id}"]`)
  if (!root) return
  const extra = root.querySelector('[data-collapse-extra]')
  if (!extra) return
  const isHidden = extra.style.display === 'none'
  extra.style.display = isHidden ? '' : 'none'
  if (btn) btn.innerHTML = isHidden ? '접기 ▲' : (btn.dataset.collapseLabel || '더보기 ▼')
}

// ============================================================
// 6단계 파이프라인 결과 카드 — 한국어 인사이트 / 트렌드 / 서브레딧
// ============================================================

const KR_INSIGHT_META = {
  trend_summary:       { icon: '📈', label: '트렌드 요약',     color: '#3b82f6' },
  fan_reaction:        { icon: '💬', label: '팬 반응 특징',    color: '#f59e0b' },
  consumption_pattern: { icon: '🎬', label: '콘텐츠 소비 패턴', color: '#8b5cf6' },
  expansion:           { icon: '🌏', label: '확장 흐름',        color: '#10b981' },
  subreddit:           { icon: '👥', label: '커뮤니티 특성',    color: '#ec4899' },
}

const BEHAVIOR_LABEL_KO = {
  recommendation: '추천 요청',
  review:         '리뷰/후기',
  question:       '질문',
  discussion:     '의견/토론',
}

function pctText(x) {
  return `${Math.round((x || 0) * 100)}%`
}

// 통합: K-콘텐츠 트렌드 분석 (작품·배우 빈도 + 핵심 인사이트)
function renderContentInsights(r) {
  const t = r.trends
  const c = t?.content
  const list = r.koreanInsights || []
  if (!c && list.length === 0) return ''

  const fs = r.filterStats
  const meta = r.redditCrawlMeta
  const subList = (r.subredditInsights || []).map(s => `r/${s.subreddit}`).join(' · ')
    || 'r/kdramas · r/kdrama · r/kdramarecommends · r/korean'
  const cutoffLabel = meta ? meta.cutoffLabel : '7d'
  const cutoffWarn = meta && meta.fallbackUsed
    ? `<span style="color:#f59e0b;margin-left:4px">⚠ 표본 부족으로 ${escHtml(meta.cutoffLabel)} fallback</span>`
    : ''
  const deepCount = (r.deepAnalysis || []).length
  const deepCommentSum = (r.deepAnalysis || []).reduce((s, d) => s + (d.commentCount || 0), 0)

  // ── 작품·배우 빈도 표 ──
  const freqGrid = c ? `
    <div style="padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:18px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:6px">📺 작품 TOP</div>
        ${(c.topContents || []).slice(0,8).map(it => {
          const key = String(it.title).toLowerCase().trim().replace(/\s+/g, ' ')
          let ko = (window.K_DRAMA_TITLE_MAP || {})[key]
          if (!ko && state.mdlSummary?.dramas) {
            const m = state.mdlSummary.dramas.find(d => (d.drama?.title || '').toLowerCase().trim().replace(/\s+/g, ' ') === key)
            if (m?.drama?.nativeTitle) ko = m.drama.nativeTitle
          }
          return `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${escHtml(it.title)}${ko ? ` <span style="color:var(--text-muted);font-size:11px">(${escHtml(ko)})</span>` : ''}</span>
            <span style="color:var(--text-muted);flex-shrink:0">${it.count}</span>
          </div>`
        }).join('') || '<div style="font-size:11px;color:var(--text-muted)">없음</div>'}
      </div>
      <div>
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:6px">🌟 배우 TOP</div>
        ${(c.topActors || []).length ? c.topActors.slice(0,8).map(a => {
          const ko = (window.K_ACTOR_NAME_MAP || {})[String(a.name).toLowerCase().trim().replace(/\s+/g, ' ')]
          return `
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${escHtml(a.name)}${ko ? ` <span style="color:var(--text-muted);font-size:11px">(${escHtml(ko)})</span>` : ''}</span>
            <span style="color:var(--text-muted);flex-shrink:0">${a.count}</span>
          </div>`
        }).join('') : '<div style="font-size:11px;color:var(--text-muted)">없음</div>'}
      </div>
    </div>` : ''

  // ── 핵심 인사이트 (Claude 해석) ──
  const insightSection = list.length > 0 ? `
    <div style="padding:0 14px 0;background:rgba(236,72,153,0.025)">
      <div style="padding:14px 4px 10px;font-size:12px;color:#ec4899;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;display:flex;align-items:center;gap:6px">
        <i class="fas fa-brain"></i> 핵심 인사이트 (Claude 해석)
      </div>
      ${collapsibleSection('kr-insights', list, 1, ins => {
        const m = KR_INSIGHT_META[ins.category] || { icon: '✨', label: '인사이트', color: '#888' }
        const hasStructured = !!(ins.observation && ins.interpretation && ins.action)
        const sections = hasStructured
          ? `
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:${m.color};font-weight:700;margin-bottom:4px;letter-spacing:0.2px">📌 핵심 인사이트</div>
              <div style="font-size:13.5px;line-height:1.6;color:var(--text-primary)">${escHtml(ins.observation)}</div>
            </div>
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:var(--text-muted);font-weight:700;margin-bottom:4px;letter-spacing:0.2px">🔍 해석</div>
              <div style="font-size:13.5px;line-height:1.6;color:var(--text-secondary,#d4d6e0)">${escHtml(ins.interpretation)}</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-left:2px solid ${m.color};border-radius:5px;padding:10px 12px">
              <div style="font-size:11px;color:${m.color};font-weight:700;margin-bottom:4px;letter-spacing:0.2px">💡 액션 제안 (Claude의 의견)</div>
              <div style="font-size:13.5px;line-height:1.65;color:var(--text-primary)">${escHtml(ins.action)}</div>
            </div>
          `
          : `<div style="font-size:14px;line-height:1.55;color:var(--text-primary)">${escHtml(ins.text)}</div>`
        return `
          <div style="padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid ${m.color};margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06)">
              <span style="font-size:18px">${m.icon}</span>
              <span style="font-size:12px;color:${m.color};text-transform:uppercase;font-weight:700;letter-spacing:0.4px">${m.label}</span>
            </div>
            ${sections}
            ${(ins.evidence && ins.evidence.length) ? `
              <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">
                ${ins.evidence.slice(0,4).map(e => `<span class="insight-chip" style="font-size:10px">${escHtml(e)}</span>`).join('')}
              </div>` : ''}
          </div>`
      })}
    </div>` : ''

  return `
    <div class="card" style="border-left:3px solid #ec4899">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-fire" style="color:#ec4899"></i> K-콘텐츠 트렌드 분석</div>
        <span style="font-size:11px;color:var(--text-muted)">빈도 + Claude 해석</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.55;padding:0 14px 12px">
        📡 출처: Reddit ${escHtml(subList)} · hot+new+top+controversial RSS · 최근 <strong style="color:var(--text-primary)">${escHtml(cutoffLabel)}</strong>${cutoffWarn} ·
        포스트 <strong style="color:var(--text-primary)">${fs?.after || 0}개</strong> 분석${fs ? ` (수집 ${fs.before} → 필터 후 ${fs.after})` : ''} · title+selftext+댓글 통합 추출${
          deepCount > 0
            ? ` · 그중 댓글 많은 TOP ${deepCount}개 (댓글 ${deepCommentSum}개)도 함께 분석`
            : ''
        }
      </div>
      ${freqGrid}
      ${insightSection}
    </div>`
}

// (구버전 호환 — 다른 호출처에서 참조 시 빈 문자열 반환)
function renderKoreanInsights(_r) { return '' }

// (구버전 호환 — renderContentInsights에 통합되어 빈 문자열 반환)
function renderTrends(_r) { return '' }

// ============================================================
// Google Trends — 북미 거시 트렌드 + K-콘텐츠 비교 (3단계 통합 섹션)
// ============================================================
async function loadGTrendsSummary(force = false) {
  const slot = document.getElementById('gtrends-section')
  if (!slot) return
  if (state.gtrendsLoading) return
  state.gtrendsLoading = true

  if (!force) {
    try {
      const r = await fetch('/api/gtrends').then(x => x.json())
      if (r.ok && r.summary) {
        state.gtrendsSummary = r.summary
        slot.innerHTML = renderGTrendsCard(r.summary)
        state.gtrendsLoading = false
        return
      }
    } catch {}
  }

  slot.innerHTML = renderGTrendsPlaceholder('loading')
  try {
    const r = await fetch('/api/gtrends/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.summary) {
      state.gtrendsSummary = r.summary
      slot.innerHTML = renderGTrendsCard(r.summary)
    } else {
      slot.innerHTML = renderGTrendsPlaceholder('error', r.error)
    }
  } catch (e) {
    slot.innerHTML = renderGTrendsPlaceholder('error', String(e))
  }
  state.gtrendsLoading = false
}

function renderGTrendsPlaceholder(mode, errMsg) {
  if (mode === 'loading') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-globe-americas" style="color:#22d3ee"></i> 북미 트렌드 분석 (Google Trends)</div></div>
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          Google Trends RSS 가져오는 중... (~2초)
        </div>
      </div>`
  }
  if (mode === 'error') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-globe-americas" style="color:#22d3ee"></i> 북미 트렌드 분석</div></div>
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px">
          가져오기 실패. <button class="btn btn-outline" style="padding:3px 10px;font-size:11px;margin-left:6px" onclick="loadGTrendsSummary(true)">재시도</button>
          ${errMsg ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;opacity:0.6">${escHtml(errMsg.slice(0, 200))}</div>` : ''}
        </div>
      </div>`
  }
  return ''
}

const GT_CAT_COLOR = {
  sports: '#f59e0b', entertainment: '#ec4899', tech: '#3b82f6', politics: '#8b5cf6',
  finance: '#10b981', kcontent: '#ef4444', lifestyle: '#22d3ee', news: '#6b7280', other: '#9ca3af',
}

// 트렌드 항목 우측 — 이벤트 칩 (인라인, 작게)
function renderEventChipInline(ev) {
  if (!ev) return ''
  return ` <span title="${escHtml(ev.reason)}" style="display:inline-block;font-size:9.5px;padding:1px 6px;background:rgba(34,211,238,0.18);border-radius:8px;color:#22d3ee;margin-left:4px;vertical-align:middle">${ev.emoji} ${escHtml(ev.labelKo)}</span>`
}

// 트렌드 항목 아래 — 이벤트 연결 자연어 설명 (작은 한 줄)
function renderEventReason(ev) {
  if (!ev) return ''
  return `<div style="font-size:10px;color:#22d3ee;margin-top:3px;line-height:1.4;opacity:0.85">↳ ${escHtml(ev.reason)}</div>`
}

// K-콘텐츠 트렌드 카드용 — 칩 + 사유를 한 블록으로
function renderEventChipBlock(ev) {
  if (!ev) return ''
  return `<div style="margin-top:4px;display:flex;align-items:flex-start;gap:5px;font-size:10px;line-height:1.45">
    <span style="flex-shrink:0;padding:1px 6px;background:rgba(34,211,238,0.18);border-radius:8px;color:#22d3ee;white-space:nowrap">${ev.emoji} ${escHtml(ev.labelKo)}</span>
    <span style="color:#22d3ee;opacity:0.85">${escHtml(ev.reason)}</span>
  </div>`
}

function renderGTrendsCard(s) {
  if (!s) return ''
  const fetchedDate = new Date(s.fetchedAt)
  const ago = Math.round((Date.now() - fetchedDate.getTime()) / 60000)
  const cacheLabel = s.cached
    ? `<span style="font-size:10px;color:var(--text-muted)">캐시 · ${ago}분 전</span>`
    : `<span style="font-size:10px;color:#10b981">방금 가져옴</span>`

  // 카테고리 분포 막대 (other 제외하고 표시)
  const totalForBar = s.categoryStats.reduce((acc, c) => acc + c.count, 0) || 1
  const catBar = s.categoryStats.map((c) => {
    const pct = ((c.count / totalForBar) * 100).toFixed(1)
    return `<div title="${escHtml(c.label)} ${c.count}개" style="flex:${c.count};background:${GT_CAT_COLOR[c.category] || '#9ca3af'};height:100%"></div>`
  }).join('')

  // 오늘 활성 이벤트 라인 (구버전 캐시는 activeEvents 없을 수 있음 → 안전 처리)
  const activeEvents = Array.isArray(s.activeEvents) ? s.activeEvents : []
  const activeEventsLine = activeEvents.length > 0
    ? `<div style="margin-bottom:10px;padding:8px 10px;background:rgba(34,211,238,0.05);border-radius:5px;border-left:2px solid #22d3ee">
         <div style="font-size:10px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">오늘 활성 이벤트 (검색 트리거 후보)</div>
         <div style="display:flex;flex-wrap:wrap;gap:5px">
           ${activeEvents.map((ev) => {
             const phase = ev.status === 'leadup'
               ? (ev.daysUntil === 0 ? '오늘 시작' : ev.daysUntil === 1 ? 'D-1' : `D-${ev.daysUntil}`)
               : ev.status === 'active' ? '진행 중' : '직후'
             return `<span title="${escHtml(ev.contextHint)}" style="font-size:10.5px;padding:3px 8px;background:rgba(34,211,238,0.12);border-radius:10px;color:var(--text-primary);white-space:nowrap">
               ${ev.emoji} ${escHtml(ev.labelKo)} <span style="opacity:0.6;font-size:9.5px">· ${phase}</span>
             </span>`
           }).join('')}
         </div>
       </div>`
    : ''

  // K-콘텐츠/한국어 학습 활용 시사점 — kContentImpact가 있는 이벤트만
  const eventsWithImpact = activeEvents.filter((ev) => ev.kContentImpact)
  const kImpactCard = eventsWithImpact.length > 0
    ? `<div style="margin-bottom:10px;padding:10px 12px;background:rgba(239,68,68,0.04);border-radius:5px;border-left:2px solid #ef4444">
         <div style="font-size:10px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:7px">K-콘텐츠 / 한국어 학습 활용 시사점</div>
         <div style="display:flex;flex-direction:column;gap:9px">
           ${eventsWithImpact.map((ev) => `
             <div style="font-size:11.5px;line-height:1.55">
               <div style="font-weight:600;color:var(--text-primary);margin-bottom:3px">${ev.emoji} ${escHtml(ev.labelKo)}</div>
               <div style="color:var(--text-muted);margin-left:2px">📊 ${escHtml(ev.kContentImpact.observation)}</div>
               <div style="color:#ef4444;margin-left:2px;margin-top:2px">💡 ${escHtml(ev.kContentImpact.application)}</div>
             </div>
           `).join('')}
         </div>
       </div>`
    : ''

  return `
    <div class="card" style="border-left:3px solid #22d3ee">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-globe-americas" style="color:#22d3ee"></i> 북미 트렌드 분석 (Google Trends · ${escHtml(s.geo)})</div>
        <div style="display:flex;align-items:center;gap:10px">
          ${cacheLabel}
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadGTrendsSummary(true)">
            <i class="fas fa-sync-alt"></i> 새로고침
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">

        <!-- ── ① K-콘텐츠 트렌드 (북미 내) — 사용자 목적 우선 노출 ─────── -->
        <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(239,68,68,0.03)">
          <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">① K-콘텐츠 트렌드 (북미 내)</div>
          <div style="font-size:13px;line-height:1.6;color:var(--text-primary);margin-bottom:10px">${escHtml(s.kInsight)}</div>
          ${s.kItems.length > 0 ? `
            <div style="display:flex;flex-direction:column;gap:5px">
              ${s.kItems.slice(0, 6).map((it) => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(239,68,68,0.06);border-radius:4px;border-left:2px solid #ef4444">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600">${escHtml(it.title)}</div>
                    ${it.kKeywords?.length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">매칭: ${it.kKeywords.slice(0,3).map(escHtml).join(', ')}</div>` : ''}
                    ${renderEventChipBlock(it.eventContext)}
                  </div>
                  <span style="font-size:10px;color:#ef4444;white-space:nowrap">${escHtml(it.traffic)}</span>
                </div>`).join('')}
            </div>` : `<div style="font-size:11px;color:var(--text-muted);font-style:italic">— 일간 TOP 진입 K-콘텐츠 키워드 없음</div>`}
        </div>

        <!-- ── ② 비교 인사이트 ──────────────────── -->
        <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(34,211,238,0.04)">
          <div style="font-size:11px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">② 트렌드 비교 인사이트</div>
          ${activeEventsLine}
          ${kImpactCard}
          <div style="font-size:13px;line-height:1.65;color:var(--text-primary)">${escHtml(s.comparison)}</div>
        </div>

        <!-- ── ③ 북미 거시 트렌드 (보조 컨텍스트, 기본 접힘) ─────── -->
        <div data-collapse-id="gt-macro" style="padding:14px 18px">
          <div style="font-size:11px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">③ 북미 거시 트렌드 <span style="color:var(--text-muted);font-weight:400;text-transform:none">— 보조 컨텍스트</span></div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${escHtml(s.oneLineSummary)}</div>
          <div data-collapse-extra style="display:none">
            <!-- 카테고리 분포 막대 -->
            <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.05);margin-bottom:6px;margin-top:8px">${catBar}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px;margin-bottom:12px">
              ${s.categoryStats.map((c) => `
                <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;background:rgba(255,255,255,0.04);border-radius:10px;color:var(--text-muted)">
                  <span style="width:7px;height:7px;border-radius:50%;background:${GT_CAT_COLOR[c.category] || '#9ca3af'}"></span>
                  ${escHtml(c.label)} ${c.count}
                </span>`).join('')}
            </div>
            <!-- TOP 검색어 (5개만 표시, 클릭하면 모두 펼침은 별도 토글로) -->
            <div>
              ${s.topItems.slice(0, 10).map((it, i) => `
                <div style="display:flex;align-items:center;gap:8px;padding:5px 9px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${GT_CAT_COLOR[it.category] || '#9ca3af'};margin-bottom:4px">
                  <span style="font-size:10px;color:var(--text-muted);min-width:14px">${i+1}</span>
                  <div style="flex:1;min-width:0;font-size:11.5px;line-height:1.4">
                    <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(it.title)}${it.isKContent ? ' <span style="color:#ef4444;font-size:10px">🇰🇷</span>' : ''}${renderEventChipInline(it.eventContext)}</div>
                    ${renderEventReason(it.eventContext)}
                  </div>
                  <span style="font-size:10px;color:${GT_CAT_COLOR[it.category] || '#9ca3af'};white-space:nowrap">${escHtml(it.traffic)}</span>
                </div>`).join('')}
              <div style="font-size:10px;color:var(--text-muted);text-align:center;padding:6px">전체 ${s.topItems.length}개 중 상위 10개 표시</div>
            </div>
          </div>
          <button onclick="toggleCollapse('gt-macro', this)" data-collapse-label="펼쳐서 거시 트렌드 보기 (${s.topItems.length}개) ▼"
            style="display:block;width:100%;margin-top:6px;padding:6px 10px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:5px;font-size:10px;color:var(--text-muted);cursor:pointer">
            펼쳐서 거시 트렌드 보기 (${s.topItems.length}개) ▼
          </button>
        </div>

      </div>
    </div>`
}

// ============================================================
// YouTube SNS 버즈 카드
// ============================================================
async function loadYoutubeSummary(force = false) {
  const slot = document.getElementById('youtube-section')
  if (!slot) return
  if (state.youtubeLoading) return
  state.youtubeLoading = true

  if (!force) {
    try {
      const r = await fetch('/api/youtube').then(x => x.json())
      if (r.ok && r.summary) {
        state.youtubeSummary = r.summary
        slot.innerHTML = renderYoutubeCard(r.summary)
        state.youtubeLoading = false
        return
      }
    } catch {}
  }

  slot.innerHTML = renderYoutubePlaceholder('loading')
  try {
    const r = await fetch('/api/youtube/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.summary) {
      state.youtubeSummary = r.summary
      slot.innerHTML = renderYoutubeCard(r.summary)
    } else {
      slot.innerHTML = renderYoutubePlaceholder('error', r.error)
    }
  } catch (e) {
    slot.innerHTML = renderYoutubePlaceholder('error', String(e))
  }
  state.youtubeLoading = false
}

function renderYoutubePlaceholder(mode, errMsg) {
  if (mode === 'loading') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> SNS 버즈 분석 (YouTube)</div></div>
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          YouTube 6개 해시태그 검색 + 영상 30개 + 댓글 ~900개 수집 중... (~10초)
        </div>
      </div>`
  }
  if (mode === 'error') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> SNS 버즈 분석 (YouTube)</div></div>
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px">
          크롤링 실패. <button class="btn btn-outline" style="padding:3px 10px;font-size:11px;margin-left:6px" onclick="loadYoutubeSummary(true)">재시도</button>
          ${errMsg ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;opacity:0.6">${escHtml(errMsg.slice(0, 200))}</div>` : ''}
        </div>
      </div>`
  }
  return ''
}

const YT_CONTENT_COLOR = {
  scene: '#ef4444', meme: '#f59e0b', edit: '#8b5cf6', reaction: '#ec4899',
  review: '#3b82f6', actor: '#10b981', other: '#6b7280',
}

const YT_CHANNEL_COLOR = {
  official: '#10b981', influencer: '#f59e0b', community: '#6b7280',
}

const YT_CHANNEL_BADGE = {
  official: '<span style="display:inline-block;padding:1px 6px;background:rgba(16,185,129,0.15);color:#10b981;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">✓ 공식</span>',
  influencer: '<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">🎤 인플루언서</span>',
  community: '',
}

const YT_REACTION_COLOR = {
  emotion: '#ef4444', empathy: '#f59e0b', info_request: '#3b82f6',
  praise: '#10b981', criticism: '#6b7280',
}

function fmtViews(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return String(n)
}

function renderYoutubeCard(s) {
  if (!s || s.totalVideos === 0) return ''
  const fetchedDate = new Date(s.fetchedAt)
  const ago = Math.round((Date.now() - fetchedDate.getTime()) / 60000)
  const cacheLabel = s.cached
    ? `<span style="font-size:10px;color:var(--text-muted)">캐시 · ${ago}분 전</span>`
    : `<span style="font-size:10px;color:#10b981">방금 가져옴</span>`

  return `
    <div class="card" style="border-left:3px solid #ef4444">
      <div class="card-header">
        <div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> SNS 버즈 분석 (YouTube · ${s.totalVideos}개 영상 · 댓글 ${s.totalComments}개)</div>
        <div style="display:flex;align-items:center;gap:10px">
          ${cacheLabel}
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadYoutubeSummary(true)">
            <i class="fas fa-sync-alt"></i> 새로고침
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">

        <!-- 한 줄 요약 + 인사이트 -->
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(239,68,68,0.04)">
          <div style="font-size:12px;line-height:1.6;color:var(--text-primary);margin-bottom:8px">${escHtml(s.oneLineSummary)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px"><strong style="color:#ef4444">🔄 버즈 흐름:</strong> ${escHtml(s.buzzInsight)}</div>
          <div style="font-size:11px;color:var(--text-muted)"><strong style="color:#ef4444">📡 팬덤 → 외부 확산:</strong> ${escHtml(s.fandomFlowInsight)}</div>
        </div>

        <!-- 1. 인기 콘텐츠 TOP -->
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:8px">① 인기 콘텐츠 TOP</div>
          ${collapsibleSection('yt-top', s.topVideos, 2, (v) => `
            <a href="https://www.youtube.com/watch?v=${escHtml(v.id)}" target="_blank" rel="noopener noreferrer"
               style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${YT_CHANNEL_COLOR[v.channelType] || '#6b7280'};margin-bottom:5px;text-decoration:none;color:inherit">
              ${v.thumbnail ? `<img src="${escHtml(v.thumbnail)}" style="width:80px;height:45px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(v.title)}${YT_CHANNEL_BADGE[v.channelType] || ''}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                  <span style="color:${YT_CONTENT_COLOR[v.contentType] || '#6b7280'}">${v.contentType}</span>
                  · ${escHtml(v.channel)}
                  · 👁 ${fmtViews(v.views || 0)}${v.likes ? ' · 👍 ' + fmtViews(v.likes) : ''}
                  ${v.publishedText ? ' · ' + escHtml(v.publishedText) : ''}
                </div>
              </div>
            </a>`)}
        </div>

        <!-- 2. 채널 타입 + 콘텐츠 유형 분포 -->
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          ${(s.channelTypeStats || []).length > 0 ? `
            <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:6px">② 채널 타입 분포</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
              ${(s.channelTypeStats || []).map(c => `
                <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.03);border-radius:14px;font-size:11px;border-left:3px solid ${YT_CHANNEL_COLOR[c.channelType] || '#6b7280'}">
                  ${escHtml(c.label)} <strong>${c.count}</strong> <span style="color:var(--text-muted);font-size:10px">(${fmtViews(c.totalViews)} views)</span>
                </span>`).join('')}
            </div>` : ''}
          <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:6px">③ 콘텐츠 유형 분포</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(s.contentTypeStats || []).map(c => `
              <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.03);border-radius:14px;font-size:11px;border-left:3px solid ${YT_CONTENT_COLOR[c.type] || '#6b7280'}">
                ${escHtml(c.label)} <strong>${c.count}</strong> <span style="color:var(--text-muted);font-size:10px">(${fmtViews(c.totalViews)} views)</span>
              </span>`).join('')}
          </div>
        </div>

        <!-- 3. 발화 phrase TOP -->
        ${(s.topPhrases || []).length > 0 ? `
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:8px">④ 발화 내용 (제목·설명 반복)</div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${s.topPhrases.slice(0, 15).map(p => `<span class="insight-chip" style="font-size:11px">${escHtml(p.phrase)} <strong>${p.count}</strong></span>`).join('')}
          </div>
        </div>` : ''}

        <!-- 4. 댓글 반응 패턴 -->
        ${(s.reactionPatterns || []).length > 0 ? `
        <div style="padding:14px 18px">
          <div style="font-size:11px;color:#ef4444;font-weight:700;text-transform:uppercase;margin-bottom:8px">⑤ 댓글 반응 패턴</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${s.reactionPatterns.map(rp => `
              <div style="padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${YT_REACTION_COLOR[rp.category] || '#6b7280'}">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                  <span style="font-size:12px;font-weight:600">${escHtml(rp.label)}</span>
                  <span style="font-size:10px;color:var(--text-muted)">${rp.count}건</span>
                </div>
                ${(rp.examples || []).slice(0, 1).map(ex => `
                  <div style="font-size:10px;color:var(--text-muted);font-style:italic;line-height:1.4">"${escHtml(ex)}"</div>`).join('')}
              </div>`).join('')}
          </div>
        </div>` : ''}

      </div>
    </div>`
}

// 통합 카드만 재렌더 (MDL 로드 후 nativeTitle 자동 매핑 반영)
function rerenderContentTrend() {
  if (state.page !== 'dashboard' || !state.currentReport) return
  const cards = document.querySelectorAll('.card-title')
  let card = null
  cards.forEach(c => { if (/K-콘텐츠 트렌드 분석/.test(c.textContent)) card = c.closest('.card') })
  if (card) card.outerHTML = renderContentInsights(state.currentReport)
}

// ============================================================
// MDL Top Airing K-드라마 카드
// ============================================================
async function loadMdlSummary(force = false) {
  const slot = document.getElementById('mdl-section')
  if (!slot) return
  if (state.mdlLoading) return
  state.mdlLoading = true

  if (!force) {
    try {
      const r = await fetch('/api/mdl').then(x => x.json())
      if (r.ok && r.summary) {
        state.mdlSummary = r.summary
        slot.innerHTML = renderMdlCard(r.summary)
        // 콘텐츠 트렌드 카드 재렌더 (nativeTitle 자동 매핑 적용)
        rerenderContentTrend()
        state.mdlLoading = false
        return
      }
    } catch {}
  }

  // 캐시 미스 또는 강제 새로고침
  slot.innerHTML = renderMdlPlaceholder('loading')
  try {
    const r = await fetch('/api/mdl/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.summary) {
      state.mdlSummary = r.summary
      slot.innerHTML = renderMdlCard(r.summary)
      rerenderContentTrend()
    } else {
      slot.innerHTML = renderMdlPlaceholder('error', r.error)
    }
  } catch (e) {
    slot.innerHTML = renderMdlPlaceholder('error', String(e))
  }
  state.mdlLoading = false
}

function renderMdlPlaceholder(mode, errMsg) {
  if (mode === 'loading') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-tv" style="color:#a78bfa"></i> MDL Top Airing K-드라마</div></div>
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          MDL에서 한국 드라마 + 리뷰 분석 중... (~7~15초)
        </div>
      </div>`
  }
  if (mode === 'error') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-tv" style="color:#a78bfa"></i> MDL Top Airing K-드라마</div></div>
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px">
          크롤링 실패. <button class="btn btn-outline" style="padding:3px 10px;font-size:11px;margin-left:6px" onclick="loadMdlSummary(true)">재시도</button>
          ${errMsg ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;opacity:0.6">${escHtml(errMsg.slice(0, 200))}</div>` : ''}
        </div>
      </div>`
  }
  return ''
}

function renderMdlCard(s) {
  if (!s || !s.dramas || s.dramas.length === 0) return ''
  const fetchedDate = new Date(s.fetchedAt)
  const ago = Math.round((Date.now() - fetchedDate.getTime()) / 60000)
  const cacheLabel = s.cached
    ? `<span style="font-size:10px;color:var(--text-muted)">캐시 · ${ago}분 전</span>`
    : `<span style="font-size:10px;color:#10b981">방금 새로 가져옴</span>`

  return `
    <div class="card">
      <div class="card-header" style="border-left:3px solid #a78bfa">
        <div class="card-title"><i class="fas fa-tv" style="color:#a78bfa"></i> MDL Top Airing K-드라마 TOP ${s.dramas.length}</div>
        <div style="display:flex;align-items:center;gap:10px">
          ${cacheLabel}
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadMdlSummary(true)">
            <i class="fas fa-sync-alt"></i> 새로고침
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:14px">
        <!-- 집계 -->
        <div style="padding:10px 14px;background:rgba(167,139,250,0.06);border-left:3px solid #a78bfa;border-radius:6px;margin-bottom:14px;font-size:12px;line-height:1.6">
          <div style="font-size:10px;color:#c4b5fd;text-transform:uppercase;font-weight:700;margin-bottom:3px">📊 종합</div>
          평균 MDL 평점 <strong>${s.aggregate.avgRating.toFixed(2)}/10</strong> · ${escHtml(s.aggregate.overallSentimentSummary)}
          ${s.aggregate.topPraisedTopic ? ` · 가장 많이 칭찬받는 주제 <strong style="color:#10b981">${escHtml(s.aggregate.topPraisedTopic)}</strong>` : ''}
          ${s.aggregate.topCriticizedTopic ? ` · 가장 많이 비판받는 주제 <strong style="color:#ef4444">${escHtml(s.aggregate.topCriticizedTopic)}</strong>` : ''}
        </div>
        <!-- 드라마 목록 -->
        ${collapsibleSection('mdl-dramas', s.dramas.map((d, i) => ({ d, i })), 1, ({ d, i }) => renderMdlDrama(d, i))}
      </div>
    </div>`
}

function renderMdlDrama(a, idx) {
  const d = a.drama
  const sent = a.reviewSentiment
  const total = sent.positive + sent.negative || 1
  const pos = Math.round(sent.positiveRatio * 100)
  const neg = Math.round(sent.negativeRatio * 100)
  const br = a.ratingBreakdown
  const distTotal = br.distribution['9-10'] + br.distribution['7-9'] + br.distribution['5-7'] + br.distribution['below5'] || 1
  const distBar = (n, color) => `<div style="flex:${n};background:${color}"></div>`

  return `
    <div style="padding:14px 0;border-top:1px solid rgba(255,255,255,0.05);${idx === 0 ? 'border-top:none;padding-top:0' : ''}">
      <!-- 헤더 -->
      <div style="display:flex;gap:14px;align-items:start">
        ${d.posterUrl ? `<img src="${d.posterUrl}" alt="${escHtml(d.title)}" style="width:80px;height:115px;object-fit:cover;border-radius:6px;flex-shrink:0">` : ''}
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap">
            <div style="font-size:14px;font-weight:700">
              <span style="color:#a78bfa;margin-right:6px">#${idx+1}</span>
              <a href="${d.url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${escHtml(d.title)}</a>
              ${a.polarized ? `
                <span title="${escHtml(a.polarizedReason || '평가 분열')}"
                      style="display:inline-block;margin-left:8px;padding:2px 8px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10px;font-weight:700;border-radius:10px;border:1px solid rgba(245,158,11,0.3)">
                  ⚠ 평가 분열
                </span>` : ''}
            </div>
            <div style="font-size:13px;font-weight:700;color:#a78bfa;white-space:nowrap">⭐ ${d.rating.toFixed(1)}</div>
          </div>
          ${a.polarized && a.polarizedReason ? `
            <div style="font-size:10px;color:#f59e0b;margin-bottom:6px;padding:3px 8px;background:rgba(245,158,11,0.05);border-left:2px solid #f59e0b;border-radius:2px">
              ${escHtml(a.polarizedReason)}
            </div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">
            ${d.year ? d.year + ' · ' : ''}${d.episodes ? d.episodes + '부작 · ' : ''}리뷰 ${d.reviewCount}개
          </div>
          ${d.description ? `<div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:6px">${escHtml(d.description.slice(0, 200))}${d.description.length > 200 ? '...' : ''}</div>` : ''}
          <div style="font-size:12px;line-height:1.6;color:var(--text-primary)">${escHtml(a.popularityReason)}</div>
        </div>
      </div>

      <!-- 평점 분포 + 감정 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
        <div style="padding:8px 10px;background:rgba(167,139,250,0.05);border-radius:4px;border-left:2px solid #a78bfa">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px">⭐ 평점 분포 (${distTotal}개 리뷰)</div>
          <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.04)">
            ${distBar(br.distribution['9-10'], '#10b981')}
            ${distBar(br.distribution['7-9'], '#3b82f6')}
            ${distBar(br.distribution['5-7'], '#f59e0b')}
            ${distBar(br.distribution['below5'], '#ef4444')}
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:3px;color:var(--text-muted)">
            <span style="color:#10b981">9-10: ${br.distribution['9-10']}</span>
            <span style="color:#3b82f6">7-9: ${br.distribution['7-9']}</span>
            <span style="color:#f59e0b">5-7: ${br.distribution['5-7']}</span>
            <span style="color:#ef4444">&lt;5: ${br.distribution['below5']}</span>
          </div>
          ${br.avgStory && br.avgActing ? `
            <div style="display:flex;gap:8px;font-size:10px;margin-top:6px;color:var(--text-muted);flex-wrap:wrap">
              <span>스토리 ${br.avgStory.toFixed(1)}</span>
              <span>연기 ${br.avgActing.toFixed(1)}</span>
              ${br.avgMusic ? `<span>음악 ${br.avgMusic.toFixed(1)}</span>` : ''}
              ${br.avgRewatch ? `<span>재시청 ${br.avgRewatch.toFixed(1)}</span>` : ''}
            </div>` : ''}
        </div>
        <div style="padding:8px 10px;background:rgba(16,185,129,0.05);border-radius:4px;border-left:2px solid #10b981">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px">💬 댓글 감정</div>
          <div style="font-size:11px;line-height:1.5">${escHtml(a.sentimentSummary)}</div>
          ${total > 1 ? `
            <div style="margin-top:5px;display:flex;height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.04)">
              <div style="width:${pos}%;background:#10b981"></div>
              <div style="width:${neg}%;background:#ef4444"></div>
            </div>` : ''}
        </div>
      </div>

      <!-- 쟁점 클러스터 -->
      ${(a.reviewDebates && a.reviewDebates.length) ? `
        <div style="margin-top:10px">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">🗣️ 리뷰 쟁점 클러스터</div>
          ${renderCommentDebatesInline(a.reviewDebates)}
        </div>` : ''}

      <!-- 대표 리뷰 -->
      ${(a.representativeReviews && a.representativeReviews.length) ? `
        <div style="margin-top:10px">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">📝 대표 리뷰</div>
          ${a.representativeReviews.map(r => {
            const display = r.bodyKo || r.body
            const original = r.bodyKo && r.bodyKo !== r.body ? r.body : null
            return `
            <div style="font-size:11px;padding:6px 10px;background:rgba(255,255,255,0.025);border-left:2px solid ${SENT_COLOR[r.sentiment]};margin-bottom:4px;border-radius:3px;line-height:1.5">
              <span style="margin-right:5px">${SENT_ICON[r.sentiment]}</span>
              <strong style="color:#a78bfa">${escHtml(r.username)}</strong>
              <span style="color:var(--text-muted)">⭐${r.rating}</span>
              <span style="color:var(--text-muted);margin-left:6px">👍${r.helpful}</span>
              <div style="margin-top:3px;color:var(--text-primary)">"${escHtml(display)}"</div>
              ${original ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic;opacity:0.7">↳ ${escHtml(original)}</div>` : ''}
            </div>`
          }).join('')}
        </div>` : ''}
    </div>`
}

function renderCommentDebatesInline(debates) {
  return debates.slice(0, 3).map((d, i) => {
    const meta = DEBATE_DIR_META[d.opinionDirection] || DEBATE_DIR_META.discussion
    return `
      <div style="padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${meta.color};margin-bottom:5px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:3px">
          <div style="font-size:12px;font-weight:600">
            <span style="color:${meta.color};margin-right:5px">[${i+1}]</span>${escHtml(d.topic)}
          </div>
          <span style="font-size:10px;color:${meta.color};white-space:nowrap">${meta.icon} ${escHtml(d.opinionDistribution.mixedLabel)}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5">
          ${escHtml(d.description)} <span style="color:#a78bfa">— ${escHtml(d.interpretation)}</span>
        </div>
      </div>`
  }).join('')
}

function renderSentimentTopics(r) {
  const bt = r.trends?.sentiment?.byTopics
  if (!bt) return ''
  const hasAny = (bt.positive?.length || 0) + (bt.negative?.length || 0) + (bt.neutral?.length || 0)
  if (!hasAny) return ''

  const col = (sent, list, color, label, icon) => `
    <div style="border-left:3px solid ${color};padding:10px 14px;background:rgba(255,255,255,0.02);border-radius:8px">
      <div style="font-size:12px;font-weight:700;color:${color};margin-bottom:8px">${icon} ${label} 반응</div>
      ${list.length === 0
        ? '<div style="font-size:11px;color:var(--text-muted)">매칭 토픽 없음</div>'
        : list.map(t => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:600;margin-bottom:3px">
              <span>${escHtml(t.topic)}</span>
              <span style="color:var(--text-muted);font-weight:400">${t.count}건</span>
            </div>
            ${t.representative ? `
              <div style="font-size:11px;color:var(--text-muted);line-height:1.5;padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid ${color}">
                <i class="fas fa-quote-left" style="font-size:8px;opacity:0.4;margin-right:4px"></i>
                ${escHtml(t.representative)}
              </div>` : ''}
          </div>`).join('')}
    </div>`

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-comment-dots" style="color:#10b981"></i> 감정별 주요 논의 주제</div>
        <span style="font-size:11px;color:var(--text-muted)">각 감정 TOP 3 토픽 + 대표 인용</span>
      </div>
      <div class="card-body" style="padding:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        ${col('positive', bt.positive || [], '#10b981', '긍정', '👍')}
        ${col('neutral',  bt.neutral  || [], '#6b7280', '중립', '💭')}
        ${col('negative', bt.negative || [], '#ef4444', '부정', '👎')}
      </div>
    </div>`
}

function renderSubredditInsights(r) {
  const subs = r.subredditInsights || []
  if (subs.length === 0) return ''
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fab fa-reddit" style="color:#ff6534"></i> 서브레딧별 특성</div>
        <span style="font-size:11px;color:var(--text-muted)">${subs.length}개 커뮤니티</span>
      </div>
      <div class="card-body" style="padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
        ${subs.map(s => {
          const total = s.sentiment.positive + s.sentiment.negative + s.sentiment.neutral || 1
          const pos = (s.sentiment.positive / total * 100).toFixed(0)
          const neu = (s.sentiment.neutral / total * 100).toFixed(0)
          const neg = (s.sentiment.negative / total * 100).toFixed(0)
          return `
            <a href="https://www.reddit.com/r/${s.subreddit}/" target="_blank" rel="noopener noreferrer"
               style="display:block;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.05);text-decoration:none;color:inherit">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
                <span style="font-weight:600;color:#ff6534">r/${escHtml(s.subreddit)}</span>
                <span style="font-size:11px;color:var(--text-muted)">${s.postCount}건</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${escHtml(s.characteristic)} · 주 행동: ${BEHAVIOR_LABEL_KO[s.topBehavior] || s.topBehavior}</div>
              <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.05)">
                <div style="width:${pos}%;background:#10b981"></div>
                <div style="width:${neu}%;background:#6b7280"></div>
                <div style="width:${neg}%;background:#ef4444"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:4px;color:var(--text-muted)">
                <span style="color:#10b981">긍 ${pos}%</span>
                <span>중 ${neu}%</span>
                <span style="color:#ef4444">부 ${neg}%</span>
              </div>
            </a>`
        }).join('')}
      </div>
    </div>`
}

const OPINION_LABEL_KO = {
  praise: '칭찬', criticism: '비판', question: '질문', recommendation: '추천',
}

const DEBATE_DIR_META = {
  positive:   { color: '#10b981', icon: '👍', label: '긍정 우세' },
  negative:   { color: '#ef4444', icon: '👎', label: '부정 우세' },
  mixed:      { color: '#f59e0b', icon: '⚖️', label: '의견 갈림' },
  discussion: { color: '#6b7280', icon: '💭', label: '정보·질문' },
}

const SENT_COLOR = { positive: '#10b981', negative: '#ef4444', neutral: '#9ca3af' }
const SENT_ICON  = { positive: '👍', negative: '👎', neutral: '·' }

function renderCommentDebates(debates) {
  if (!debates || debates.length === 0) return ''
  return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">🗣️ 댓글 쟁점 클러스터 TOP ${debates.length}</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${debates.map((d, idx) => {
          const meta = DEBATE_DIR_META[d.opinionDirection] || DEBATE_DIR_META.discussion
          return `
            <div style="padding:10px 12px;background:rgba(255,255,255,0.02);border-radius:6px;border-left:3px solid ${meta.color}">
              <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:6px">
                <div style="font-weight:700;font-size:13px;flex:1;min-width:0">
                  <span style="color:${meta.color};margin-right:6px">[주제 ${idx+1}]</span>
                  ${escHtml(d.topic)}
                </div>
                <span style="font-size:10px;color:${meta.color};white-space:nowrap;font-weight:600">${meta.icon} ${escHtml(d.opinionDistribution.mixedLabel)} · ${d.count}건</span>
              </div>

              <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">
                <span style="color:#a78bfa;font-weight:600">설명 ·</span> ${escHtml(d.description)}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
                <span style="color:#a78bfa;font-weight:600">맥락 ·</span> ${escHtml(d.context)}
              </div>

              ${(d.representatives && d.representatives.length) ? `
                <div style="margin:6px 0">
                  <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:3px">주요 의견</div>
                  ${d.representatives.map(r => {
                    const display = r.bodyKo || r.body
                    const original = r.bodyKo && r.bodyKo !== r.body ? r.body : null
                    return `
                    <div style="font-size:11px;padding:5px 9px;background:rgba(255,255,255,0.025);border-left:2px solid ${SENT_COLOR[r.sentiment]};margin-bottom:3px;border-radius:3px;line-height:1.5">
                      <span style="margin-right:5px">${SENT_ICON[r.sentiment]}</span>
                      "${escHtml(display)}"
                      <span style="float:right;color:var(--text-muted);font-size:10px">▲${r.score}</span>
                      ${original ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic;opacity:0.7">↳ ${escHtml(original)}</div>` : ''}
                    </div>`
                  }).join('')}
                </div>` : ''}

              <div style="font-size:11px;color:#fbbf24;line-height:1.5;padding:6px 9px;background:rgba(251,191,36,0.06);border-radius:3px;margin-top:6px">
                <span style="font-weight:600">해석 ·</span> ${escHtml(d.interpretation)}
              </div>
            </div>`
        }).join('')}
      </div>
    </div>`
}

function renderDeepPostMedia(d) {
  if (!d.imageUrl) return ''
  return `
    <a class="deep-post-media" href="${escHtml(d.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">
      <img src="${escHtml(d.imageUrl)}" alt="" loading="lazy" onerror="this.parentElement.remove()">
    </a>`
}

function renderDeepAnalysis(r) {
  const list = r.deepAnalysis || []
  if (list.length === 0) return ''
  const totalComments = list.reduce((s, d) => s + (d.commentCount || 0), 0)
  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-microscope" style="color:#8b5cf6"></i> Reddit TOP5 포스트 댓글 딥분석</div>
        <span style="font-size:11px;color:var(--text-muted)">감정·의견 유형·쟁점 클러스터</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.55;padding:0 14px 12px">
        📡 출처: Reddit 토론 TOP 5 포스트 · 댓글 합계 <strong style="color:var(--text-primary)">${totalComments}개</strong> 분석 · 포스트당 댓글 RSS에서 본문 길이 ≥20자 댓글 수집 후 감정/의견/쟁점 클러스터링
      </div>
      <div class="card-body deep-analysis-body">
        ${collapsibleSection('deep-analysis', list.map((d, i) => ({ d, i })), 1, ({ d, i }) => {
          const total = d.sentiment.positive + d.sentiment.negative || 1
          const pos = (d.sentiment.positiveRatio * 100).toFixed(0)
          const neg = (d.sentiment.negativeRatio * 100).toFixed(0)
          const opinionRows = Object.entries(d.opinionTypes)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `
              <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0">
                <span>${OPINION_LABEL_KO[k]}</span>
                <span style="color:var(--text-muted)">${v}</span>
              </div>`)
            .join('') || '<div style="font-size:11px;color:var(--text-muted)">없음</div>'
          return `
            <article class="deep-post-card">
              <div class="deep-post-rank">#${i + 1}</div>
              <div class="deep-post-main">
                <div class="deep-post-header">
                  <div class="deep-post-title-wrap">
                    <a class="deep-post-title" href="${escHtml(d.url)}" target="_blank" rel="noopener noreferrer">${escHtml(d.titleKo || d.title)}</a>
                    ${d.titleKo && d.titleKo !== d.title ? `<div class="deep-post-original-title">${escHtml(d.title)}</div>` : ''}
                  </div>
                  <div class="deep-post-meta">
                    <span>r/${escHtml(d.subreddit)}</span>
                    <span><i class="fas fa-comment"></i> ${d.commentCount}</span>
                    <span><i class="fas fa-arrow-up"></i> ${fmtScore(d.score)}</span>
                  </div>
                </div>

                <div class="deep-post-layout">
                  ${renderDeepPostMedia(d)}
                  <div class="deep-post-detail">
                    <div class="deep-post-summary">${escHtml(d.summary)}</div>

                    ${d.sentimentSummary ? `
                      <div class="deep-sentiment-box">
                        <div class="deep-section-label" style="color:#34d399">댓글 감정 분포</div>
                        <div>${escHtml(d.sentimentSummary)}</div>
                        ${total > 1 ? `
                          <div class="deep-sentiment-bar">
                            <div style="width:${pos}%;background:#10b981"></div>
                            <div style="width:${neg}%;background:#ef4444"></div>
                          </div>` : ''}
                      </div>` : ''}

                    <div class="deep-post-grid">
                      <div class="deep-mini-panel">
                        <div class="deep-section-label">의견 유형</div>
                        ${opinionRows}
                      </div>
                      <div class="deep-mini-panel">
                        <div class="deep-section-label">반응 패턴</div>
                        <div style="font-size:11px;line-height:1.5">${escHtml(d.reactionCause)}</div>
                      </div>
                    </div>

                    ${renderCommentDebates(d.commentDebates)}
                  </div>
                </div>
              </div>
            </article>`
        })}
      </div>
    </div>`
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

  const kRatio = allContents.length ? Math.round(topK.length / allContents.length * 100) : 0
  const sourceLine = (r.sourceSummary || []).map(s => `${s.source} ${s.itemCount}`).join(' · ')

  return `
    <div class="page-header">
      <div style="flex:1;min-width:0">
        <div class="page-title">📊 대시보드</div>
        <div class="page-sub" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <span>${r.reportType === 'daily' ? '일간' : '주간'} 리포트</span>
          <span style="opacity:0.4">·</span>
          <span>${fmtDateFull(r.generatedAt)}</span>
          ${allContents.length > 0 ? `
            <span style="opacity:0.4">·</span>
            <span style="color:var(--accent-pink)">🇰🇷 K-콘텐츠 ${kRatio}%</span>
            <span style="opacity:0.4">(${topK.length}/${allContents.length})</span>` : ''}
          ${sourceLine ? `
            <span style="opacity:0.4">·</span>
            <span style="color:var(--text-muted);font-size:11px">📡 ${escHtml(sourceLine)}</span>` : ''}
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

    <div class="dashboard-sections" style="padding:20px 28px;display:flex;flex-direction:column;gap:20px">

      ${renderContentInsights(r)}
      ${renderDeepAnalysis(r)}
      <div id="mdl-section"></div>
      <div id="youtube-section"></div>
      <div id="gtrends-section"></div>

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

      ${renderDeepAnalysis(r)}

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

  const activeTab = window._rankTab || 'reddit'
  const mdlSum = state.mdlSummary
  const ytSum = state.youtubeSummary

  // 탭별 항목 수
  const counts = {
    reddit: (r.topContents || []).length,
    mdl: mdlSum?.dramas?.length || 0,
    youtube: ytSum?.topVideos?.length || 0,
  }
  const totalForActive = counts[activeTab] ?? counts.reddit

  const tabs = [
    ['reddit',  `🔥 Reddit ${counts.reddit}`,    '#ff6534'],
    ['mdl',     `📺 MDL ${counts.mdl}`,          '#a78bfa'],
    ['youtube', `▶️ YouTube ${counts.youtube}`,   '#ef4444'],
  ]

  let body = ''
  if (activeTab === 'mdl')          body = renderMdlRankingTable(mdlSum)
  else if (activeTab === 'youtube') body = renderYoutubeRankingTable(ytSum)
  else                              body = renderRedditRankingTable(r, activeTab)

  return `
    <div class="page-header">
      <div>
        <div class="page-title">🏆 콘텐츠 랭킹</div>
        <div class="page-sub">${fmtDate(r.generatedAt)} · ${totalForActive}개 항목</div>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <div class="tabs" style="width:fit-content">
          ${tabs.map(([tab, label]) =>
            `<button class="tab-btn ${activeTab===tab?'active':''}" onclick="setRankTab('${tab}')">${label}</button>`
          ).join('')}
        </div>
        <div style="flex:1"></div>
        <span style="font-size:12px;color:var(--text-muted)">총 ${totalForActive}개</span>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          ${body}
        </div>
      </div>
    </div>`
}

// ── Reddit 랭킹 테이블 (기존) ────────────────────────────────
function renderRedditRankingTable(r, activeTab) {
  let items = r.topContents || []
  if (activeTab === 'k')          items = items.filter(c => c.isKContent)
  if (activeTab === 'reddit')     items = items.filter(c => c.sources.includes('reddit'))
  const maxScore = items[0]?.finalScore || 1

  if (items.length === 0) return '<div class="empty-state"><i class="fas fa-database"></i><p>데이터 없음</p></div>'

  return `
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
    </table>`
}

// ── MDL 랭킹 테이블 ──────────────────────────────────────────
// MDL 사이트 Top Airing 자체 순위 그대로 (평점·시청자수·신선도 종합).
// 대시보드 카드와 동일한 순서 유지.
function renderMdlRankingTable(s) {
  if (!s || !s.dramas?.length) return '<div class="empty-state"><i class="fas fa-tv"></i><p>MDL 데이터 없음. 크롤링 페이지에서 MDL 새로고침 필요.</p></div>'

  const items = s.dramas
  const maxRating = Math.max(...items.map(a => a.drama.rating || 0)) || 10

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th style="width:60px"></th>
          <th>제목</th>
          <th>연도/부작</th>
          <th>리뷰 수</th>
          <th>댓글 감정</th>
          <th style="text-align:right">평점</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((a, i) => {
          const d = a.drama
          const sent = a.reviewSentiment
          const total = sent.positive + sent.negative || 1
          const pos = Math.round((sent.positiveRatio || 0) * 100)
          return `
            <tr>
              <td><span class="rank-num ${rankColor(i)}" style="font-size:13px">${i+1}</span></td>
              <td>${d.posterUrl ? `<img src="${escHtml(d.posterUrl)}" style="width:42px;height:60px;object-fit:cover;border-radius:3px">` : ''}</td>
              <td>
                <div style="font-size:13px;font-weight:500">
                  <a href="${escHtml(d.url)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${escHtml(d.title)}</a>
                  ${a.polarized ? '<span title="평가 분열" style="display:inline-block;margin-left:6px;padding:1px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:10px;font-weight:700;border-radius:8px">⚠ 분열</span>' : ''}
                </div>
                ${d.description ? `<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;margin-top:2px">${escHtml(d.description)}</div>` : ''}
              </td>
              <td style="font-size:11px;color:var(--text-muted)">${d.year || '-'}${d.episodes ? ` · ${d.episodes}부작` : ''}</td>
              <td style="font-size:12px">${d.reviewCount}</td>
              <td>
                ${total > 1 ? `
                  <div style="display:flex;align-items:center;gap:6px;font-size:11px">
                    <div style="display:flex;height:5px;width:60px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.05)">
                      <div style="width:${pos}%;background:#10b981"></div>
                      <div style="width:${100-pos}%;background:#ef4444"></div>
                    </div>
                    <span style="color:#10b981">긍 ${pos}%</span>
                  </div>` : '<span style="color:var(--text-muted);font-size:11px">데이터 부족</span>'}
              </td>
              <td style="text-align:right">
                <div class="score-bar-wrap">
                  <div class="score-bar"><div class="score-fill" style="width:${Math.round((d.rating || 0)/maxRating*100)}%;background:#a78bfa"></div></div>
                  <span style="font-size:12px;color:#a78bfa;min-width:36px;text-align:right;font-weight:600">⭐ ${(d.rating || 0).toFixed(1)}</span>
                </div>
              </td>
            </tr>`
        }).join('')}
      </tbody>
    </table>`
}

// ── YouTube 랭킹 테이블 ──────────────────────────────────────
function renderYoutubeRankingTable(s) {
  if (!s || !s.topVideos?.length) return '<div class="empty-state"><i class="fab fa-youtube"></i><p>YouTube 데이터 없음. 크롤링 페이지에서 YouTube 새로고침 필요.</p></div>'

  const items = s.topVideos
  const maxViews = items[0]?.views || 1

  const channelBadge = {
    official: '<span style="display:inline-block;padding:1px 6px;background:rgba(16,185,129,0.15);color:#10b981;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">✓공식</span>',
    influencer: '<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">🎤인플루언서</span>',
    community: '',
  }

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:40px">#</th>
          <th style="width:90px"></th>
          <th>제목</th>
          <th>채널</th>
          <th>유형</th>
          <th>업로드</th>
          <th style="text-align:right">조회수</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((v, i) => `
          <tr>
            <td><span class="rank-num ${rankColor(i)}" style="font-size:13px">${i+1}</span></td>
            <td>${v.thumbnail ? `<img src="${escHtml(v.thumbnail)}" style="width:80px;height:45px;object-fit:cover;border-radius:3px">` : ''}</td>
            <td>
              <div style="font-size:13px;font-weight:500">
                <a href="https://www.youtube.com/watch?v=${escHtml(v.id)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none">${escHtml(v.title)}</a>
                ${channelBadge[v.channelType] || ''}
              </div>
            </td>
            <td style="font-size:11px;color:var(--text-muted);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(v.channel)}</td>
            <td><span style="font-size:11px;color:${YT_CONTENT_COLOR[v.contentType] || '#6b7280'}">${v.contentType}</span></td>
            <td style="font-size:11px;color:var(--text-muted)">${escHtml(v.publishedText || '-')}</td>
            <td style="text-align:right">
              <div class="score-bar-wrap">
                <div class="score-bar"><div class="score-fill" style="width:${Math.round((v.views||0)/maxViews*100)}%;background:#ef4444"></div></div>
                <span style="font-size:12px;color:#ef4444;min-width:50px;text-align:right;font-weight:600">${fmtViews(v.views || 0)}</span>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`
}

// ============================================================
// Page: Crawl
// ============================================================
function renderCrawl() {
  if (!window._selectedSources) window._selectedSources = { reddit: true, mdl: true, gtrends: true, youtube: true }
  const sel = window._selectedSources
  if (sel.gtrends === undefined) sel.gtrends = true
  if (sel.youtube === undefined) sel.youtube = true
  const mdlForce = window._mdlForce || false
  const gtrendsForce = window._gtrendsForce || false
  const youtubeForce = window._youtubeForce || false

  // 캐시 hint helper
  const cacheHintFor = (summary, ttlLabel) => {
    if (!summary) return '<span style="color:#f59e0b">캐시 없음</span>'
    const ageMin = Math.round((Date.now() - new Date(summary.fetchedAt).getTime()) / 60000)
    const expired = new Date(summary.expiresAt).getTime() < Date.now()
    return expired
      ? `<span style="color:#f59e0b">캐시 만료 (${ageMin}분 전)</span>`
      : `<span style="color:#10b981">캐시 ${ageMin}분 전 · ${ttlLabel}</span>`
  }
  const mdlCacheHint = cacheHintFor(state.mdlSummary, '캐시 사용')
  const gtrendsCacheHint = cacheHintFor(state.gtrendsSummary, '캐시 사용')
  const youtubeCacheHint = cacheHintFor(state.youtubeSummary, '캐시 사용')

  const sourceCard = (key, color, icon, name, desc, extra) => `
    <label class="card" style="padding:14px;border-color:${sel[key] ? color + '55' : 'rgba(255,255,255,0.06)'};cursor:pointer;opacity:${sel[key] ? '1' : '0.5'};transition:all 0.15s">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <input type="checkbox" ${sel[key] ? 'checked' : ''} onchange="toggleSource('${key}')"
               style="width:16px;height:16px;cursor:pointer;accent-color:${color}">
        <i class="${icon}" style="color:${color};font-size:16px"></i>
        <span style="font-weight:600;font-size:13px">${name}</span>
      </div>
      <div style="font-size:11px;color:var(--text-muted);padding-left:32px">${desc}</div>
      ${extra ? `<div style="padding-left:32px;margin-top:6px">${extra}</div>` : ''}
    </label>`

  const mdlExtra = sel.mdl ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer">
      <input type="checkbox" ${mdlForce ? 'checked' : ''} onchange="toggleMdlForce()"
             style="width:13px;height:13px;cursor:pointer;accent-color:#a78bfa">
      캐시 무시하고 강제 새로고침
    </label>` : ''

  const gtrendsExtra = sel.gtrends ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer">
      <input type="checkbox" ${gtrendsForce ? 'checked' : ''} onchange="toggleGtrendsForce()"
             style="width:13px;height:13px;cursor:pointer;accent-color:#22d3ee">
      캐시 무시하고 강제 새로고침
    </label>` : ''

  const youtubeExtra = sel.youtube ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer">
      <input type="checkbox" ${youtubeForce ? 'checked' : ''} onchange="toggleYoutubeForce()"
             style="width:13px;height:13px;cursor:pointer;accent-color:#ef4444">
      캐시 무시하고 강제 새로고침
    </label>` : ''

  const anySelected = sel.reddit || sel.mdl || sel.gtrends || sel.youtube

  return `
    <div class="page-header">
      <div>
        <div class="page-title">🤖 크롤링 제어</div>
        <div class="page-sub">Reddit + MyDramaList + Google Trends 통합 데이터 수집</div>
      </div>
    </div>
    <div style="padding:20px 28px;display:flex;flex-direction:column;gap:20px">

      <div class="card">
        <div class="card-header">
          <div class="card-title"><i class="fas fa-cog"></i> 크롤링 설정</div>
          <span style="font-size:11px;color:var(--text-muted)">소스 선택 후 실행</span>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
            ${sourceCard(
              'reddit', '#ff6534', 'fab fa-reddit', 'Reddit',
              'r/kdramas, r/kdrama, r/kdramarecommends, r/korean · hot+new · 1주 이내',
              ''
            )}
            ${sourceCard(
              'mdl', '#a78bfa', 'fas fa-tv', 'MyDramaList',
              `top_airing K-드라마 5개 + 리뷰 10개씩 · ${mdlCacheHint}`,
              mdlExtra
            )}
            ${sourceCard(
              'gtrends', '#22d3ee', 'fas fa-globe-americas', 'Google Trends',
              `북미 일간 트렌드 페이지 7개 병합 · ${gtrendsCacheHint}`,
              gtrendsExtra
            )}
            ${sourceCard(
              'youtube', '#ef4444', 'fab fa-youtube', 'YouTube SNS 버즈',
              `해시태그 6개 + 영상 30개 + 댓글 ~900개 · ${youtubeCacheHint}`,
              youtubeExtra
            )}
          </div>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div class="tabs" style="width:fit-content">
              <button class="tab-btn active" id="type-daily"  onclick="setCrawlType('daily')">일간</button>
              <button class="tab-btn"        id="type-weekly" onclick="setCrawlType('weekly')">주간</button>
            </div>
            <button class="btn btn-primary" id="crawl-btn" onclick="startCrawl()" ${anySelected ? '' : 'disabled'}>
              <i class="fas fa-spider"></i> 크롤링 시작
            </button>
            <button class="btn btn-outline" onclick="runDemo(window._crawlType||'daily')">
              <i class="fas fa-vial"></i> 데모 데이터로 실행
            </button>
            ${!anySelected ? '<span style="font-size:11px;color:#f59e0b">⚠ 최소 한 개 소스 선택</span>' : ''}
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
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Reddit (5개 서브레딧)</div>
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
  if (page === 'crawl')    { setTimeout(loadLogs, 100); setTimeout(prefetchMdlCache, 100); setTimeout(prefetchGtrendsCache, 100); setTimeout(prefetchYoutubeCache, 100) }
  if (page === 'ranking')  { setTimeout(prefetchMdlCache, 100); setTimeout(prefetchYoutubeCache, 100) }
  if (page === 'history')  setTimeout(loadHistory, 100)
  if (page === 'schedule') setTimeout(loadSchedule, 100)
  if (page === 'reddit')   { window._redditSub = '전체'; renderPage() }
  if (page === 'dashboard' && typeof loadMdlSummary === 'function') {
    setTimeout(() => loadMdlSummary(false), 100)
    setTimeout(() => loadGTrendsSummary(false), 100)
    setTimeout(() => loadYoutubeSummary(false), 100)
  }
}

async function prefetchMdlCache() {
  if (state.mdlSummary) return
  try {
    const r = await fetch('/api/mdl').then(x => x.json())
    if (r.ok && r.summary) {
      state.mdlSummary = r.summary
      if (state.page === 'crawl' || state.page === 'ranking') renderPage()
    }
  } catch {}
}

async function prefetchGtrendsCache() {
  if (state.gtrendsSummary) return
  try {
    const r = await fetch('/api/gtrends').then(x => x.json())
    if (r.ok && r.summary) {
      state.gtrendsSummary = r.summary
      if (state.page === 'crawl') renderPage()
    }
  } catch {}
}

async function prefetchYoutubeCache() {
  if (state.youtubeSummary) return
  try {
    const r = await fetch('/api/youtube').then(x => x.json())
    if (r.ok && r.summary) {
      state.youtubeSummary = r.summary
      if (state.page === 'crawl' || state.page === 'ranking') renderPage()
    }
  } catch {}
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

function toggleSource(key) {
  if (!window._selectedSources) window._selectedSources = { reddit: true, mdl: true, gtrends: true, youtube: true }
  window._selectedSources[key] = !window._selectedSources[key]
  if (state.page === 'crawl') renderPage()
}

function toggleMdlForce() {
  window._mdlForce = !window._mdlForce
  if (state.page === 'crawl') renderPage()
}

function toggleGtrendsForce() {
  window._gtrendsForce = !window._gtrendsForce
  if (state.page === 'crawl') renderPage()
}

function toggleYoutubeForce() {
  window._youtubeForce = !window._youtubeForce
  if (state.page === 'crawl') renderPage()
}

// ============================================================
// Data Actions
// ============================================================
async function loadLatestReport() {
  try {
    const res = await API.latestReport(state.reportType)
    if (res.ok && res.report) {
      state.currentReport = res.report.data || res.report
    }
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
  const sel = window._selectedSources || { reddit: true, mdl: true, gtrends: true, youtube: true }
  const mdlForce = !!window._mdlForce
  const gtrendsForce = !!window._gtrendsForce
  const youtubeForce = !!window._youtubeForce

  if (!sel.reddit && !sel.mdl && !sel.gtrends && !sel.youtube) {
    toast('최소 한 개 소스를 선택해주세요', 'error')
    return
  }

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
  const labels = []
  if (sel.reddit) labels.push('Reddit')
  if (sel.mdl) labels.push('MDL' + (mdlForce ? ' (강제)' : ''))
  if (sel.gtrends) labels.push('GTrends' + (gtrendsForce ? ' (강제)' : ''))
  if (sel.youtube) labels.push('YouTube' + (youtubeForce ? ' (강제)' : ''))
  addLog(`크롤링 시작: ${labels.join(' + ')} (${type})`, 'info')

  // 두 소스를 병렬 처리
  const tasks = []

  if (sel.reddit) {
    tasks.push((async () => {
      addLog('[Reddit] 시작...', 'info')
      try {
        const res = await API.crawl(type, ['reddit'])
        if (res.ok) {
          state.currentReport = res.report
          ;(res.logs || []).forEach(l => addLog(`[Reddit] ${l}`, 'success'))
          addLog(`[Reddit] ✅ 완료 — 클러스터 ${res.report.topContents?.length || 0}개`, 'success')
          return { source: 'reddit', ok: true }
        }
        addLog(`[Reddit] ❌ ${res.error || '오류'}`, 'error')
        return { source: 'reddit', ok: false, error: res.error }
      } catch (e) {
        addLog(`[Reddit] ❌ 연결 오류: ${e.message}`, 'error')
        return { source: 'reddit', ok: false, error: e.message }
      }
    })())
  }

  if (sel.mdl) {
    tasks.push((async () => {
      addLog(`[MDL] 시작${mdlForce ? ' (캐시 무시)' : ''}...`, 'info')
      try {
        const res = await fetch('/api/mdl/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: mdlForce }),
        }).then(x => x.json())
        if (res.ok && res.summary) {
          state.mdlSummary = res.summary
          const n = res.summary.dramas?.length || 0
          const totalReviews = res.summary.dramas?.reduce((s, d) => s + (d.drama?.reviewCount || 0), 0) || 0
          if (res.cached) {
            addLog(`[MDL] ✅ 캐시 사용 — 드라마 ${n}개, 리뷰 ${totalReviews}개`, 'success')
          } else {
            addLog(`[MDL] ✅ 새 크롤링 완료 — 드라마 ${n}개, 리뷰 ${totalReviews}개`, 'success')
          }
          return { source: 'mdl', ok: true }
        }
        addLog(`[MDL] ❌ ${res.error || '오류'}`, 'error')
        return { source: 'mdl', ok: false, error: res.error }
      } catch (e) {
        addLog(`[MDL] ❌ 연결 오류: ${e.message}`, 'error')
        return { source: 'mdl', ok: false, error: e.message }
      }
    })())
  }

  if (sel.gtrends) {
    tasks.push((async () => {
      addLog(`[GTrends] 시작${gtrendsForce ? ' (캐시 무시)' : ''}...`, 'info')
      try {
        const res = await fetch('/api/gtrends/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: gtrendsForce }),
        }).then(x => x.json())
        if (res.ok && res.summary) {
          state.gtrendsSummary = res.summary
          const total = res.summary.totalItems || 0
          const k = res.summary.kItems?.length || 0
          if (res.cached) {
            addLog(`[GTrends] ✅ 캐시 사용 — 트렌드 ${total}개 (K ${k}개)`, 'success')
          } else {
            addLog(`[GTrends] ✅ 새 RSS 가져옴 — 트렌드 ${total}개 (K ${k}개)`, 'success')
          }
          return { source: 'gtrends', ok: true }
        }
        addLog(`[GTrends] ❌ ${res.error || '오류'}`, 'error')
        return { source: 'gtrends', ok: false, error: res.error }
      } catch (e) {
        addLog(`[GTrends] ❌ 연결 오류: ${e.message}`, 'error')
        return { source: 'gtrends', ok: false, error: e.message }
      }
    })())
  }

  if (sel.youtube) {
    tasks.push((async () => {
      addLog(`[YouTube] 시작${youtubeForce ? ' (캐시 무시)' : ''}...`, 'info')
      try {
        const res = await fetch('/api/youtube/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: youtubeForce }),
        }).then(x => x.json())
        if (res.ok && res.summary) {
          state.youtubeSummary = res.summary
          const v = res.summary.totalVideos || 0
          const c = res.summary.totalComments || 0
          if (res.cached) {
            addLog(`[YouTube] ✅ 캐시 사용 — 영상 ${v}개, 댓글 ${c}개`, 'success')
          } else {
            addLog(`[YouTube] ✅ 새 크롤링 완료 — 영상 ${v}개, 댓글 ${c}개`, 'success')
          }
          return { source: 'youtube', ok: true }
        }
        addLog(`[YouTube] ❌ ${res.error || '오류'}`, 'error')
        return { source: 'youtube', ok: false, error: res.error }
      } catch (e) {
        addLog(`[YouTube] ❌ 연결 오류: ${e.message}`, 'error')
        return { source: 'youtube', ok: false, error: e.message }
      }
    })())
  }

  const results = await Promise.allSettled(tasks)
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
  const failed = results.length - succeeded

  if (failed === 0) {
    toast(`✅ 크롤링 완료 (${succeeded}개 소스)`, 'success')
  } else if (succeeded === 0) {
    toast(`❌ 모든 소스 실패`, 'error')
  } else {
    toast(`⚠ ${succeeded}개 성공, ${failed}개 실패`, 'info')
  }

  state.crawling = false
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-spider"></i> 크롤링 시작' }
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
      state.currentReport = res.report.data || res.report
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
    ['help',      'fas fa-circle-question', '📖 도움말'],
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
    help:      renderHelp,
  }
  const fn = pages[state.page] || renderDashboard
  document.getElementById('page-content').innerHTML = fn()
}

// ============================================================
// 도움말 페이지 (docs/dashboard-guide.md → /api/guide → HTML)
// ============================================================
function renderHelp() {
  setTimeout(loadGuideContent, 50)
  return `
    <div class="page-header">
      <div>
        <div class="page-title">📖 대시보드 가이드</div>
        <div class="page-sub">처음 사용하는 분을 위한 섹션별 설명</div>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div class="card">
        <div class="card-body" id="guide-content" style="padding:28px 36px;font-size:14px;line-height:1.75;color:var(--text-primary)">
          <div class="loading-overlay"><div class="spinner"></div> 가이드 로딩 중...</div>
        </div>
      </div>
    </div>`
}

async function loadGuideContent() {
  const el = document.getElementById('guide-content')
  if (!el) return
  try {
    const r = await fetch('/api/guide').then(x => x.json())
    if (r.ok && r.html) {
      // marked 렌더 결과를 그대로 삽입. 헤더·표·강조·구분선 등 자동 스타일링 적용
      el.innerHTML = `<div class="markdown-body" style="--md-fg:var(--text-primary)">${r.html}</div>`
    } else {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">가이드 로딩 실패</div>'
    }
  } catch (e) {
    el.innerHTML = `<div style="color:var(--text-muted);font-size:13px">로딩 오류: ${escHtml(String(e))}</div>`
  }
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

  // 대시보드 dynamic section auto-load (innerHTML 삽입된 inline <script>는 실행 안 됨)
  if (state.page === 'dashboard') {
    setTimeout(() => { if (typeof loadMdlSummary === 'function') loadMdlSummary(false) }, 100)
    setTimeout(() => { if (typeof loadGTrendsSummary === 'function') loadGTrendsSummary(false) }, 100)
    setTimeout(() => { if (typeof loadYoutubeSummary === 'function') loadYoutubeSummary(false) }, 100)
  }
}

window._crawlType = 'daily'
window._rankTab   = 'all'

document.addEventListener('DOMContentLoaded', init)
