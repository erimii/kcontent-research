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
  topRanking: null,
  topRankingLoading: false,
  topRankingExpanded: {},   // { slug: { loading, analysis, error } }
  gtrendsSummary: null,
  gtrendsLoading: false,
  youtubeSummary: null,
  youtubeLoading: false,
  tiktokSummary: null,
  tiktokLoading: false,
  instagramSummary: null,
  instagramLoading: false,
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

  // ── 작품·배우 빈도 가로 막대 차트 ──
  // 막대 길이 = count / maxCount * 100%, 순위별 색상 (gold/silver/bronze/pink)
  const renderFreqBar = (items, kind /* 'drama' | 'actor' */) => {
    if (!items || items.length === 0) return '<div style="font-size:12px;color:var(--text-muted)">없음</div>'
    const top8 = items.slice(0, 8)
    const maxCount = Math.max(...top8.map(it => it.count))
    return top8.map((it, i) => {
      const rank = i + 1
      const name = kind === 'drama' ? it.title : it.name
      let ko = null
      if (kind === 'drama') {
        const key = String(name).toLowerCase().trim().replace(/\s+/g, ' ')
        ko = (window.K_DRAMA_TITLE_MAP || {})[key]
        if (!ko && state.mdlSummary?.dramas) {
          const m = state.mdlSummary.dramas.find(d => (d.drama?.title || '').toLowerCase().trim().replace(/\s+/g, ' ') === key)
          if (m?.drama?.nativeTitle) ko = m.drama.nativeTitle
        }
      } else {
        ko = (window.K_ACTOR_NAME_MAP || {})[String(name).toLowerCase().trim().replace(/\s+/g, ' ')]
      }
      const rankColor = rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#f97316' : '#ec489966'
      const barColor = rank === 1 ? 'rgba(251,191,36,0.22)' : rank === 2 ? 'rgba(203,213,225,0.18)' : rank === 3 ? 'rgba(249,115,22,0.18)' : 'rgba(236,72,153,0.12)'
      const widthPct = Math.max(8, Math.round((it.count / maxCount) * 100))
      return `
        <div style="position:relative;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          <div style="position:absolute;top:6px;bottom:6px;left:32px;width:calc((100% - 60px) * ${widthPct} / 100);background:${barColor};border-radius:3px;transition:width 0.4s"></div>
          <div style="position:relative;display:flex;align-items:center;font-size:13px;gap:10px;z-index:1">
            <span style="flex-shrink:0;width:22px;font-weight:800;color:${rankColor};font-size:13px;text-align:center">${rank}</span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;padding:0 6px">${escHtml(name)}${ko ? ` <span style="color:var(--text-muted);font-size:12px">(${escHtml(ko)})</span>` : ''}</span>
            <span style="color:var(--text-muted);flex-shrink:0;font-weight:600;font-variant-numeric:tabular-nums">${it.count}</span>
          </div>
        </div>`
    }).join('')
  }
  const freqGrid = c ? `
    <div style="padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:18px;border-bottom:1px solid rgba(255,255,255,0.06)">
      <div style="min-width:0;overflow:hidden">
        <div style="font-size:15px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:8px;letter-spacing:0.3px">📺 작품 TOP</div>
        ${renderFreqBar(c.topContents, 'drama')}
      </div>
      <div style="min-width:0;overflow:hidden">
        <div style="font-size:15px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:8px;letter-spacing:0.3px">🌟 배우 TOP</div>
        ${renderFreqBar(c.topActors, 'actor')}
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

        // 헤드라인: observation 그대로 (이미 1줄로 짧음). 잘림 방지.
        const extractHeadline = (text) => (text || '').replace(/\.$/, '')

        // action을 문장 단위로 쪼개 bullets로 변환 (최대 3개)
        const splitActions = (text) => {
          if (!text) return []
          return text
            .split(/(?<=[.!?])\s+(?=[가-힣A-Z"„])/g)
            .map(s => s.trim().replace(/\.$/, ''))
            .filter(s => s.length > 0)
            .slice(0, 3)
        }

        const sections = hasStructured
          ? (() => {
              const headline = extractHeadline(ins.observation)
              return `
                <div style="margin-bottom:10px">
                  <div style="font-size:17px;line-height:1.35;color:var(--text-primary);font-weight:700;letter-spacing:-0.2px">
                    ${m.icon} ${escHtml(headline)}
                  </div>
                </div>
                ${(ins.evidence && ins.evidence.length) ? `
                  <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">
                    ${ins.evidence.slice(0,3).map(e => `<span style="font-size:10.5px;padding:3px 8px;background:rgba(255,255,255,0.06);border-radius:10px;color:var(--text-muted);font-weight:500">${escHtml(e)}</span>`).join('')}
                  </div>` : ''}
                <div style="font-size:12.5px;line-height:1.55;color:var(--text-muted);padding-left:10px;border-left:2px solid ${m.color}33">
                  → ${escHtml(ins.interpretation)}
                </div>
              `
            })()
          : `<div style="font-size:14px;line-height:1.55;color:var(--text-primary)">${escHtml(ins.text)}</div>`
        return `
          <div style="padding:14px 16px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid ${m.color};margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span style="font-size:11px;color:${m.color};text-transform:uppercase;font-weight:700;letter-spacing:0.4px">${m.label}</span>
            </div>
            ${sections}
          </div>`
      })}
    </div>` : ''

  return `
    <div class="card" style="border-left:3px solid #ec4899">
      <div class="card-header">
        <div class="card-title"><i class="fas fa-fire" style="color:#ec4899"></i> K-콘텐츠 트렌드 분석 <span style="font-size:13px;color:var(--text-muted);font-weight:500">(Reddit)</span></div>
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
         <div style="font-size:13px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:5px">오늘 활성 이벤트 (검색 트리거 후보)</div>
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
         <div style="font-size:13px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:7px">K-콘텐츠 / 한국어 학습 활용 시사점</div>
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
          <div style="font-size:14px;color:#ef4444;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">① K-콘텐츠 트렌드 (북미 내)</div>
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
          <div style="font-size:14px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">② 트렌드 비교 인사이트</div>
          ${activeEventsLine}
          ${kImpactCard}
          <div style="font-size:13px;line-height:1.65;color:var(--text-primary)">${escHtml(s.comparison)}</div>
        </div>

        <!-- ── ③ 북미 거시 트렌드 (보조 컨텍스트, 기본 접힘) ─────── -->
        <div data-collapse-id="gt-macro" style="padding:14px 18px">
          <div style="font-size:14px;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">③ 북미 거시 트렌드 <span style="color:var(--text-muted);font-weight:400;text-transform:none">— 보조 컨텍스트</span></div>
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
        <div class="card-header"><div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> YouTube 파헤치기</div></div>
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          YouTube 6개 해시태그 검색 + 영상 30개 + 댓글 ~900개 수집 중... (~10초)
        </div>
      </div>`
  }
  if (mode === 'error') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> YouTube 파헤치기</div></div>
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

function ytTruncate(t, n) {
  t = (t || '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trim() + '…'
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
        <div class="card-title"><i class="fab fa-youtube" style="color:#ef4444"></i> YouTube 파헤치기</div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-muted)">${s.totalVideos}개 영상 · 댓글 ${s.totalComments}개</span>
          ${cacheLabel}
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadYoutubeSummary(true)">
            <i class="fas fa-sync-alt"></i> 새로고침
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">

        <!-- 🏆 작품별 화제도 -->
        ${(s.contentGroups || []).length > 0 ? `
        <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:12px;color:#fbbf24;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">
            🏆 작품별 화제도
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px">
            ${(s.contentGroups || []).map(g => {
              const ytKey = String(g.title || '').toLowerCase().trim().replace(/\s+/g, ' ')
              let ytKo = (window.K_DRAMA_TITLE_MAP || {})[ytKey]
              if (!ytKo && state.mdlSummary?.dramas) {
                const m = state.mdlSummary.dramas.find(d => (d.drama?.title || '').toLowerCase().trim().replace(/\s+/g, ' ') === ytKey)
                if (m?.drama?.nativeTitle) ytKo = m.drama.nativeTitle
              }
              return `
              <a href="https://www.youtube.com/watch?v=${escHtml(g.topVideoId)}" target="_blank" rel="noopener noreferrer"
                 style="display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:rgba(251,191,36,0.05);border-radius:8px;border-left:3px solid #fbbf24;text-decoration:none;color:inherit;transition:background 0.15s"
                 onmouseover="this.style.background='rgba(251,191,36,0.10)'"
                 onmouseout="this.style.background='rgba(251,191,36,0.05)'">
                <div style="display:flex;gap:10px;align-items:flex-start">
                  ${g.topVideoThumbnail ? `<img src="${escHtml(g.topVideoThumbnail)}" style="width:80px;height:45px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;line-height:1.3;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(g.title)}${ytKo ? ` <span style="color:var(--text-muted);font-size:12px;font-weight:500">(${escHtml(ytKo)})</span>` : ''}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                      영상 ${g.videoCount} · 👁 ${fmtViews(g.totalViews)} · 👍 ${fmtViews(g.totalLikes)} · 💬 ${fmtViews(g.totalComments)}
                    </div>
                    ${(g.languageDistribution || []).length > 0 ? `
                      <div style="font-size:10px;color:var(--text-muted);margin-top:3px;line-height:1.5">
                        🌍 ${(g.languageDistribution || []).map(L => `<span title="${escHtml(L.label)}: ${L.count} 댓글" style="margin-right:7px">${L.flag} ${L.percent}%</span>`).join('')}
                      </div>` : ''}
                  </div>
                </div>
                ${(g.quotedPhrases || []).length > 0 ? `
                  <div style="margin-top:4px;padding:6px 8px;background:rgba(251,191,36,0.06);border-left:2px solid #fbbf24;border-radius:3px">
                    <div style="font-size:10px;color:#fbbf24;font-weight:700;margin-bottom:3px">💎 자주 반복되는 댓글 표현</div>
                    ${(g.quotedPhrases || []).slice(0, 5).map(qp => {
                      const display = qp.phraseKo || qp.phrase
                      return `
                      <div style="font-size:11px;line-height:1.5;color:var(--text-primary)" title="${escHtml(qp.phrase)}">
                        "${escHtml(ytTruncate(display, 80))}" <span style="color:var(--text-muted);font-size:10px">— ${qp.count}회</span>
                      </div>`
                    }).join('')}
                  </div>` : ''}
                ${(g.topComments || []).length > 0 ? `
                  <div style="margin-top:4px">
                    <div style="font-size:10px;color:#10b981;font-weight:700;margin-bottom:3px">💬 좋아요 많은 댓글 TOP ${(g.topComments || []).length}</div>
                    <div style="display:flex;flex-direction:column;gap:4px">
                    ${(g.topComments || []).slice(0, 2).map(c => {
                      const display = c.textKo || c.text
                      return `
                      <div style="font-size:11.5px;line-height:1.5;color:var(--text-primary);padding:6px 8px;background:rgba(255,255,255,0.025);border-radius:4px" title="${escHtml(c.text)}">
                        "${escHtml(ytTruncate(display, 100))}" <span style="color:var(--text-muted);font-size:10px">— 👍 ${fmtViews(c.likes)}</span>
                      </div>`
                    }).join('')}
                    </div>
                  </div>` : ''}
                ${g.discussionHotspot ? `
                  <div style="margin-top:4px;padding:6px 8px;background:rgba(167,139,250,0.06);border-left:2px solid #a78bfa;border-radius:3px;font-size:11px;line-height:1.5" title="${escHtml(g.discussionHotspot.text)}">
                    <div style="color:#a78bfa;font-weight:700;font-size:10px">🔥 답글 가장 많은 댓글</div>
                    <div style="color:var(--text-primary);margin-top:2px">"${escHtml(ytTruncate(g.discussionHotspot.textKo || g.discussionHotspot.text, 100))}"</div>
                    <div style="color:var(--text-muted);font-size:10px;margin-top:2px">💬 답글 ${g.discussionHotspot.replyCount}개 · 👍 ${fmtViews(g.discussionHotspot.likes)}</div>
                  </div>` : ''}
              </a>`
            }).join('')}
          </div>
        </div>` : ''}

        <!-- 📊 근거 데이터 (펼친 상태로 직접 노출) -->
        <div style="padding:12px 18px">

            <!-- 인기 콘텐츠 TOP (UI cap 10) -->
            <div style="margin-bottom:14px">
              <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">인기 콘텐츠 TOP 10 <span style="text-transform:none;font-weight:500;opacity:0.7">(engagement score: 댓글·좋아요·조회수 가중 합산)</span></div>
              ${collapsibleSection('yt-top', (s.topVideos || []).slice(0, 10), 3, (v) => `
                <a href="https://www.youtube.com/watch?v=${escHtml(v.id)}" target="_blank" rel="noopener noreferrer"
                   style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${YT_CHANNEL_COLOR[v.channelType] || '#6b7280'};margin-bottom:5px;text-decoration:none;color:inherit">
                  ${v.thumbnail ? `<img src="${escHtml(v.thumbnail)}" style="width:80px;height:45px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(v.title)}${YT_CHANNEL_BADGE[v.channelType] || ''}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                      <span style="color:${YT_CONTENT_COLOR[v.contentType] || '#6b7280'}">${v.contentType}</span>
                      · ${escHtml(v.channel)}
                      · 👁 ${fmtViews(v.views || 0)}${v.likes ? ' · 👍 ' + fmtViews(v.likes) : ''}${(v.commentCount || v.comments?.length) ? ' · 💬 ' + fmtViews(v.commentCount || v.comments.length) : ''}
                      ${v.publishedText ? ' · ' + escHtml(v.publishedText) : ''}
                    </div>
                  </div>
                </a>`)}
            </div>

            <!-- 채널 + 콘텐츠 분포 -->
            ${(s.channelTypeStats || []).length > 0 ? `
              <div style="margin-bottom:10px">
                <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">채널 타입</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                  ${(s.channelTypeStats || []).map(c => `
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.03);border-radius:14px;font-size:11px;border-left:3px solid ${YT_CHANNEL_COLOR[c.channelType] || '#6b7280'}">
                      ${escHtml(c.label)} <strong>${c.count}</strong> <span style="color:var(--text-muted);font-size:10px">(${fmtViews(c.totalViews)} views)</span>
                    </span>`).join('')}
                </div>
              </div>` : ''}
        </div>

      </div>
    </div>`
}

// ============================================================
// TikTok SNS 버즈 카드
// 2026-05-12: TikTok이 /api/challenge/item_list/ + /api/search/item/full/ 엔드포인트를
//   봇 트래픽 전체에 silent reject (HTTP 200 + 빈 body) — Playwright/X-Bogus/IP변경/
//   계정 무관. 사용자 IP/계정 보호 위해 자동 크롤 비활성화. 차단 풀릴 때까지
//   캐시 있으면 표시, 없으면 안내 카드. 수동 새로고침은 confirm 후에만.
// ============================================================
// 자동 트리거 전용 — 캐시만 표시, 없으면 안내 (자동 크롤 안 함)
async function loadTiktokSummaryFromCacheOnly() {
  const slot = document.getElementById('tiktok-section')
  if (!slot) return
  try {
    const r = await fetch('/api/tiktok').then(x => x.json())
    if (r.ok && r.summary && (r.summary.totalVideos || 0) > 0) {
      state.tiktokSummary = r.summary
      slot.innerHTML = renderTiktokCard(r.summary)
      return
    }
  } catch {}
  slot.innerHTML = renderTiktokPlaceholder('blocked')
}

async function loadTiktokSummary(force = false) {
  const slot = document.getElementById('tiktok-section')
  if (!slot) return
  if (state.tiktokLoading) return

  if (!force) {
    // 자동 호출 경로는 캐시만 조회
    return loadTiktokSummaryFromCacheOnly()
  }

  // force=true (사용자가 명시적 새로고침 클릭) — 차단 상황 안내 후 confirm
  const proceed = window.confirm(
    'TikTok이 현재 영상 리스트 API를 봇 트래픽 전체에 차단 중입니다 (2026-05-12 진단 결과).\n\n' +
    '그래도 크롤을 시도하시겠습니까? (~4분 소요, 거의 0건 예상)\n\n' +
    '※ 너무 자주 시도하면 사용자 IP/계정이 추가로 봇 마킹될 수 있습니다.'
  )
  if (!proceed) return

  state.tiktokLoading = true
  slot.innerHTML = renderTiktokPlaceholder('loading')
  try {
    const r = await fetch('/api/tiktok/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.summary && (r.summary.totalVideos || 0) > 0) {
      state.tiktokSummary = r.summary
      slot.innerHTML = renderTiktokCard(r.summary)
    } else {
      // 빈 결과 또는 503 — 차단 안내로 fallback (이전 캐시 있으면 그것도 표시)
      try {
        const cached = await fetch('/api/tiktok').then(x => x.json())
        if (cached.ok && cached.summary && (cached.summary.totalVideos || 0) > 0) {
          state.tiktokSummary = cached.summary
          slot.innerHTML = renderTiktokCard(cached.summary)
        } else {
          slot.innerHTML = renderTiktokPlaceholder('blocked', r.error)
        }
      } catch {
        slot.innerHTML = renderTiktokPlaceholder('blocked', r.error)
      }
    }
  } catch (e) {
    slot.innerHTML = renderTiktokPlaceholder('blocked', String(e))
  }
  state.tiktokLoading = false
}

function renderTiktokPlaceholder(mode, errMsg) {
  if (mode === 'loading') {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">🎵 TikTok 파헤치기</div></div>
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          TikTok 키워드 검색 + 영상 30개 + 댓글 수집 중... (~30초~2분)
        </div>
      </div>`
  }
  if (mode === 'blocked') {
    return `
      <div class="card" style="border-left:3px solid #ec4899;opacity:0.85">
        <div class="card-header">
          <div style="min-width:0">
            <div class="card-title">🎵 TikTok 파헤치기 <span style="font-size:11px;color:#fbbf24;font-weight:600;margin-left:6px">⚠ 일시 차단</span></div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">TikTok API anti-bot 차단 중 — 자동 크롤 일시 정지</div>
          </div>
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadTiktokSummary(true)" title="차단 풀렸는지 수동 확인 — 너무 자주 시도하면 IP/계정 마킹 가속 가능">
            <i class="fas fa-flask"></i> 수동 시도
          </button>
        </div>
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px;line-height:1.6">
          <div style="margin-bottom:8px"><strong style="color:var(--text-primary)">현재 상태:</strong> TikTok이 <code>/api/challenge/item_list/</code> 및 <code>/api/search/item/full/</code>
          엔드포인트를 봇 트래픽 전체에 silent reject (HTTP 200 + 빈 body). 쿠키·IP·계정·X-Bogus 서명 모두 정상이지만 검색 데이터를 받지 못합니다.</div>
          <div style="margin-bottom:8px"><strong style="color:var(--text-primary)">대기 전략:</strong> 자동 크롤을 일시 정지하고 차단 풀릴 때까지 대기. 풀리면 자동으로 표시 복원.</div>
          <div style="font-size:11px;opacity:0.7">최근 정상 수집: 2026-05-11 09:45 (14개 영상). 마지막 확인: 방금 (여전히 차단).</div>
          ${errMsg ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;opacity:0.5">${escHtml(String(errMsg).slice(0, 200))}</div>` : ''}
        </div>
      </div>`
  }
  // legacy 'error' mode — fallback to blocked (네트워크 예외 등)
  if (mode === 'error') return renderTiktokPlaceholder('blocked', errMsg)
  return ''
}

const TT_CHANNEL_COLOR = {
  official: '#10b981', creator: '#f59e0b', community: '#6b7280',
}
const TT_CHANNEL_BADGE = {
  official: '<span style="display:inline-block;padding:1px 6px;background:rgba(16,185,129,0.15);color:#10b981;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">✓ 공식</span>',
  creator: '<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">🎤 크리에이터</span>',
  community: '',
}

function renderTiktokCard(s) {
  if (!s || s.totalVideos === 0) return ''
  const fetchedDate = new Date(s.fetchedAt)
  const ago = Math.round((Date.now() - fetchedDate.getTime()) / 60000)
  const cacheLabel = s.cached
    ? `<span style="font-size:10px;color:var(--text-muted)">캐시 · ${ago}분 전</span>`
    : `<span style="font-size:10px;color:#10b981">방금 가져옴</span>`

  return `
    <div class="card" style="border-left:3px solid #ec4899">
      <div class="card-header">
        <div class="card-title">🎵 TikTok 파헤치기</div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:10px;color:var(--text-muted)">${s.totalVideos}개 영상 · 댓글 ${s.totalComments}개</span>
          ${cacheLabel}
          <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadTiktokSummary(true)">
            <i class="fas fa-sync-alt"></i> 새로고침
          </button>
        </div>
      </div>
      <div class="card-body" style="padding:0">

        <!-- 🏆 작품별 화제도 -->
        ${(s.contentGroups || []).length > 0 ? `
        <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:12px;color:#fbbf24;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">
            🏆 작품별 화제도
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px">
            ${(s.contentGroups || []).map(g => `
              <a href="${escHtml(g.topVideoUrl)}" target="_blank" rel="noopener noreferrer"
                 style="display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:rgba(251,191,36,0.05);border-radius:8px;border-left:3px solid #fbbf24;text-decoration:none;color:inherit;transition:background 0.15s"
                 onmouseover="this.style.background='rgba(251,191,36,0.10)'"
                 onmouseout="this.style.background='rgba(251,191,36,0.05)'">
                <div style="display:flex;gap:10px;align-items:flex-start">
                  ${g.topVideoCover ? `<img src="${escHtml(g.topVideoCover)}" style="width:60px;height:75px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:700;line-height:1.3;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(g.title)}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:3px;line-height:1.4">
                      영상 ${g.videoCount} · 👁 ${fmtViews(g.totalViews)} · 👍 ${fmtViews(g.totalLikes)} · 💬 ${fmtViews(g.totalComments)} · ↗ ${fmtViews(g.totalShares)}
                    </div>
                  </div>
                </div>
                ${(g.topComments || []).length > 0 ? `
                  <div style="display:flex;flex-direction:column;gap:4px;margin-top:2px">
                    ${(g.topComments || []).slice(0, 2).map(c => {
                      const display = c.textKo || c.text
                      return `
                      <div style="font-size:11.5px;line-height:1.5;color:var(--text-primary);padding:6px 8px;background:rgba(255,255,255,0.025);border-radius:4px" title="${escHtml(c.text)}">
                        💬 "${escHtml(ytTruncate(display, 100))}" <span style="color:var(--text-muted);font-size:10px">— 👍 ${fmtViews(c.likes)}</span>
                      </div>`
                    }).join('')}
                  </div>` : ''}
              </a>`).join('')}
          </div>
        </div>` : ''}

        <!-- 🎵 트렌딩 사운드 -->
        ${(s.trendingSounds || []).length > 0 ? `
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(236,72,153,0.04)">
          <div style="font-size:12px;color:#ec4899;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">
            🎵 트렌딩 사운드 <span style="font-weight:400;color:var(--text-muted);text-transform:none">(데이터셋 내 재사용)</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(s.trendingSounds || []).map(snd => `
              <a href="${escHtml(snd.sampleVideoUrl)}" target="_blank" rel="noopener noreferrer"
                 title="${escHtml(snd.title)} by ${escHtml(snd.authorName)} · ${snd.videoCount}회 재사용 · ${fmtViews(snd.totalViews)} 누적 조회"
                 style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:rgba(236,72,153,0.10);border:1px solid rgba(236,72,153,0.25);border-radius:14px;font-size:12px;color:#fbcfe8;text-decoration:none">
                <span style="font-weight:600">${escHtml(ytTruncate(snd.title, 28))}</span>
                <span style="font-size:10px;color:var(--text-muted)">· ${snd.videoCount}회</span>
              </a>`).join('')}
          </div>
        </div>` : ''}

        <!-- 👤 K-드라마 크리에이터 랭킹 -->
        ${(s.topCreators || []).length > 0 ? `
        <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:8px">
            👤 크리에이터 랭킹
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px">
            ${(s.topCreators || []).slice(0, 8).map(c => `
              <a href="https://www.tiktok.com/@${escHtml(c.author.uniqueId)}" target="_blank" rel="noopener noreferrer"
                 style="display:flex;gap:8px;align-items:center;padding:6px 8px;background:rgba(255,255,255,0.025);border-radius:5px;text-decoration:none;color:inherit;transition:background 0.15s"
                 onmouseover="this.style.background='rgba(255,255,255,0.05)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.025)'">
                ${c.author.avatar ? `<img src="${escHtml(c.author.avatar)}" style="width:32px;height:32px;border-radius:50%;flex-shrink:0">` : '<div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.1);flex-shrink:0"></div>'}
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;line-height:1.3;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.author.nickname || c.author.uniqueId)}${c.author.verified ? ' ✓' : ''}${TT_CHANNEL_BADGE[c.author.channelType] || ''}</div>
                  <div style="font-size:10px;color:var(--text-muted)">@${escHtml(c.author.uniqueId)} · ${c.videoCount}영상 · ${fmtViews(c.totalViews)}</div>
                </div>
              </a>`).join('')}
          </div>
        </div>` : ''}

        <!-- 인기 클립 TOP -->
        <div style="padding:12px 18px">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">인기 클립 TOP</div>
          ${collapsibleSection('tt-top', s.topVideos, 3, (v) => `
            <a href="${escHtml(v.url)}" target="_blank" rel="noopener noreferrer"
               style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${TT_CHANNEL_COLOR[v.channelType] || '#6b7280'};margin-bottom:5px;text-decoration:none;color:inherit">
              ${v.cover ? `<img src="${escHtml(v.cover)}" style="width:60px;height:80px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(v.description)}${TT_CHANNEL_BADGE[v.channelType] || ''}</div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                  @${escHtml(v.author.uniqueId)}
                  · 👁 ${fmtViews(v.views)} · 👍 ${fmtViews(v.likes)} · 💬 ${fmtViews(v.commentCount)} · ↗ ${fmtViews(v.shares)}
                  ${v.sound?.title ? ` · 🎵 ${escHtml(ytTruncate(v.sound.title, 30))}` : ''}
                </div>
              </div>
            </a>`)}
        </div>

      </div>
    </div>`
}

// ============================================================
// Instagram SNS 버즈 카드 (Tier 1 — top Reels + 작품별 화제도 + top comments)
// ============================================================
// 자동 트리거 전용 — 캐시 hit이면 표시, miss이면 가벼운 안내 placeholder 표시 (자동 크롤 X)
async function loadInstagramSummaryFromCacheOnly() {
  const slot = document.getElementById('instagram-section')
  if (!slot) return
  try {
    const r = await fetch('/api/instagram').then(x => x.json())
    if (r.ok && r.summary && (r.summary.totalReels || 0) > 0) {
      state.instagramSummary = r.summary
      slot.innerHTML = renderInstagramCard(r.summary)
      return
    }
  } catch {}
  // 캐시 없음 → 사용자에게 안내만 표시
  slot.innerHTML = `
    <div class="card" style="border-left:3px solid #E1306C">
      <div class="card-header">
        <div style="min-width:0">
          <div class="card-title"><i class="fab fa-instagram" style="color:#E1306C"></i> ${IG_TITLE}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${IG_SUBTITLE}</div>
        </div>
        <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadInstagramSummary(true)">
          <i class="fas fa-sync-alt"></i> 새로고침
        </button>
      </div>
      <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px;line-height:1.6">
        Instagram 크롤은 <strong>수동 트리거</strong>입니다 (사용자 IP 부담 ↓).
        새로고침 버튼을 누르면 ~10분 소요됩니다.
      </div>
    </div>`
}

async function loadInstagramSummary(force = false) {
  const slot = document.getElementById('instagram-section')
  if (!slot) return
  if (state.instagramLoading) return
  state.instagramLoading = true

  if (!force) {
    try {
      const r = await fetch('/api/instagram').then(x => x.json())
      if (r.ok && r.summary) {
        state.instagramSummary = r.summary
        slot.innerHTML = renderInstagramCard(r.summary)
        state.instagramLoading = false
        return
      }
    } catch {}
  }

  slot.innerHTML = renderInstagramPlaceholder('loading')
  try {
    const r = await fetch('/api/instagram/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.summary && (r.summary.totalReels || 0) > 0) {
      state.instagramSummary = r.summary
      slot.innerHTML = renderInstagramCard(r.summary)
    } else {
      // 새 시도가 0건이거나 503 — 이전 cache로 fallback (서버는 빈 summary면 cache 안 덮어씀)
      try {
        const cached = await fetch('/api/instagram').then(x => x.json())
        if (cached.ok && cached.summary && (cached.summary.totalReels || 0) > 0) {
          state.instagramSummary = cached.summary
          slot.innerHTML = renderInstagramCard(cached.summary)
          // 카드 위에 작은 안내 띠 추가
          const banner = document.createElement('div')
          banner.style.cssText = 'padding:8px 18px;background:rgba(245,158,11,0.08);border-bottom:1px solid rgba(245,158,11,0.2);font-size:11px;color:#fbbf24;line-height:1.4'
          banner.innerHTML = `⚠ 방금 시도가 0건 또는 차단 — 캐시(${cached.summary.totalReels}개 Reel) 표시 중. ${escHtml((r.error || '').slice(0, 120))}`
          const card = slot.querySelector('.card')
          const header = card?.querySelector('.card-header')
          if (header && header.parentElement === card) header.after(banner)
        } else if (r.summary && (r.summary.warnings || []).length > 0) {
          slot.innerHTML = renderInstagramPlaceholder('error', (r.summary.warnings || []).join(' / '))
        } else {
          slot.innerHTML = renderInstagramPlaceholder('error', r.error)
        }
      } catch {
        slot.innerHTML = renderInstagramPlaceholder('error', r.error || 'unknown')
      }
    }
  } catch (e) {
    slot.innerHTML = renderInstagramPlaceholder('error', String(e))
  }
  state.instagramLoading = false
}

const IG_BORDER = 'linear-gradient(135deg,#833AB4,#E1306C,#FCAF45)'
const IG_CHANNEL_COLOR = { official: '#10b981', creator: '#f59e0b', community: '#9ca3af' }
const IG_CHANNEL_BADGE = {
  official: '<span style="display:inline-block;padding:1px 6px;background:rgba(16,185,129,0.15);color:#10b981;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">✓ 공식</span>',
  creator: '<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.15);color:#f59e0b;font-size:9px;font-weight:700;border-radius:8px;margin-left:4px">🎤 크리에이터</span>',
  community: '',
}

const IG_TITLE = 'Instagram 파헤치기'
const IG_SUBTITLE = 'Instagram Reel·댓글 기반 K콘텐츠 비주얼 반응 분석'

function renderInstagramPlaceholder(mode, errMsg) {
  const header = `
    <div class="card-header"><div class="card-title"><i class="fab fa-instagram" style="color:#E1306C"></i> ${IG_TITLE}</div></div>
    <div style="padding:0 18px 8px;font-size:11px;color:var(--text-muted)">${IG_SUBTITLE}</div>`
  if (mode === 'loading') {
    return `
      <div class="card">
        ${header}
        <div class="card-body" style="padding:30px;text-align:center;color:var(--text-muted)">
          <div class="spinner" style="margin:0 auto 12px"></div>
          Instagram 카테고리 hashtag · Reel 후보 추출 중... (~5분~8분)
        </div>
      </div>`
  }
  if (mode === 'error') {
    return `
      <div class="card">
        ${header}
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px">
          크롤링 실패. <button class="btn btn-outline" style="padding:3px 10px;font-size:11px;margin-left:6px" onclick="loadInstagramSummary(true)">재시도</button>
          ${errMsg ? `<div style="margin-top:8px;font-family:monospace;font-size:10px;opacity:0.6">${escHtml(String(errMsg).slice(0, 240))}</div>` : ''}
          <div style="margin-top:8px;font-size:11px;line-height:1.5">
            • 쿠키 파일(<code>~/Desktop/secret/001/instagram-cookies.json</code>) 만료 가능성<br/>
            • 첫 차단 감지 시 <strong>30분 자동 lockout</strong> — 그 동안 재시도해도 빈 결과 반환됩니다.
          </div>
        </div>
      </div>`
  }
  return ''
}

// reactionType 라벨 → "형" 떼고 chip에 사용
function igStripHyung(label) {
  return String(label || '').replace(/형$/, '')
}

// Instagram URL 그대로 사용 — 변환 X
//   2026-05-08 재진단: hashtag grid에서 발견되는 게시물 URL은 모두 /p/<code>/ 형태로 옴.
//   /p/는 reel·사진·캐러셀 모두 처리하는 통합 게시물 URL이라 그대로가 가장 안전.
//   /reel/<code>/로 강제 변환했더니 사진/캐러셀 게시물에서 "이 페이지가 작동하지 않습니다" 발생.
//   이 헬퍼는 호환성용으로만 남김 (variable URL 가능성 대비, 변환 안 함).
function igReelUrl(urlOrReel) {
  const url = typeof urlOrReel === 'string' ? urlOrReel : (urlOrReel?.url || '')
  return url || ''
}

// Reel 메타 라인 헬퍼 — 조회수/좋아요/댓글 (없는 값은 생략)
//   reel.viewCount: best-effort, undefined이면 비노출
//   reel.likeCount: og:description에서 항상 받음 (구버전 캐시면 reel.views fallback)
//   reel.commentCount: 실제 총 댓글 수 (구버전 캐시면 comments.length fallback — 다만 ≤3로 부정확)
function igMetaLine(reel) {
  const parts = []
  const v = reel.viewCount
  if (typeof v === 'number' && v > 0) parts.push(`👁 ${fmtViews(v)}`)
  const l = (reel.likeCount != null) ? reel.likeCount : reel.views
  if (typeof l === 'number' && l > 0) parts.push(`❤ ${fmtViews(l)}`)
  const c = (reel.commentCount != null) ? reel.commentCount : (reel.comments?.length ?? 0)
  if (typeof c === 'number' && c >= 0) parts.push(`💬 ${fmtViews(c)}`)
  return parts.join(' · ')
}

// 작품 그룹 메타 라인 — Reel수 + 누적 좋아요 + 누적 댓글
function igGroupMetaLine(g) {
  return `Reel ${g.reelCount} · ❤ ${fmtViews(g.totalViews)} · 💬 ${fmtViews(g.totalComments)}`
}

// chip helper (count 표시)
function igChip(label, count, color) {
  const c = color || 'rgba(225,48,108,0.18)'
  const fc = color ? '#fff' : '#fbcfe8'
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:${c};border:1px solid rgba(225,48,108,0.25);border-radius:14px;font-size:11.5px;color:${fc};white-space:nowrap">
    <span style="font-weight:600">${escHtml(label)}</span>${count != null ? `<span style="font-size:10px;color:var(--text-muted)">· ${count}</span>` : ''}
  </span>`
}

function renderInstagramCard(s) {
  if (!s) return ''
  const fetchedDate = s.fetchedAt ? new Date(s.fetchedAt) : new Date()
  const ago = Math.round((Date.now() - fetchedDate.getTime()) / 60000)
  const cacheLabel = s.cached
    ? `<span style="font-size:10px;color:var(--text-muted)">캐시 · ${ago}분 전</span>`
    : `<span style="font-size:10px;color:#10b981">방금 가져옴</span>`

  const headerHtml = `
    <div class="card-header" style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px">
      <div style="min-width:0">
        <div class="card-title"><i class="fab fa-instagram" style="color:#E1306C"></i> ${IG_TITLE}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${IG_SUBTITLE}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:10px;color:var(--text-muted)">Reel ${s.totalReels || 0}개 · 댓글 ${s.totalComments || 0}개</span>
        ${cacheLabel}
        <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="loadInstagramSummary(true)">
          <i class="fas fa-sync-alt"></i> 새로고침
        </button>
      </div>
    </div>`

  // 비어있는 케이스 — 헤더 + 안내
  if (!s.totalReels || s.totalReels === 0) {
    const warnSummary = (s.warnings || []).slice(1, 3).map(w => `<li>${escHtml(w)}</li>`).join('')
    return `
      <div class="card" style="border-left:3px solid #E1306C">
        ${headerHtml}
        <div class="card-body" style="padding:18px;color:var(--text-muted);font-size:12px;line-height:1.6">
          수집된 Reel이 없습니다. 쿠키 만료, 30분 lockout, 또는 hashtag 페이지가 비어있는 경우 발생합니다.
          ${warnSummary ? `<details style="margin-top:10px"><summary style="cursor:pointer">📊 수집 상태 보기</summary><ul style="margin:8px 0 0 16px;padding:0;font-size:11px">${warnSummary}</ul></details>` : ''}
        </div>
      </div>`
  }

  const categoryLabel = (cat) => cat === 'kdrama' ? '드라마' : cat === 'kmovie' ? '영화' : cat === 'kvariety' ? '예능' : '미분류'

  // 반응 카테고리 색상 팔레트 (mix stacked bar 및 분포 차트 공용)
  const IG_REACTION_COLOR = {
    '커플 케미형': '#ec4899',
    '배우 비주얼형': '#a855f7',
    '로맨스 설정형': '#f97316',
    '감정 몰입형': '#ef4444',
    'OST 무드형': '#3b82f6',
    '밈/드립형': '#fbbf24',
    '정보 소개형': '#6b7280',
  }
  const igReactionColor = (label) => IG_REACTION_COLOR[label] || '#94a3b8'

  // engagement class 배지
  const IG_ENGAGEMENT_BADGE = {
    active: '<span style="display:inline-block;padding:1px 6px;background:rgba(239,68,68,0.15);color:#fca5a5;font-size:9px;font-weight:700;border-radius:8px;margin-left:5px" title="댓글 비율이 높음 — 활발한 토론">🔥 active</span>',
    passive: '<span style="display:inline-block;padding:1px 6px;background:rgba(99,102,241,0.15);color:#a5b4fc;font-size:9px;font-weight:700;border-radius:8px;margin-left:5px" title="좋아요는 많지만 댓글 적음 — 조용한 호감">👁 passive</span>',
    mid: '',
  }

  // ───── 반응 포인트 설명 (처음 보는 사람용 — collapsible) ─────
  const IG_REACTION_LEGEND = [
    { label: '커플 케미형', cue: 'chemistry · couple · wife/husband · down bad · lovers · soulmate' },
    { label: '배우 비주얼형', cue: 'handsome · beautiful · gorgeous · stunning · visual · face' },
    { label: '로맨스 설정형', cue: 'contract/arranged marriage · royal · chaebol · enemies to lovers · fake dating' },
    { label: '감정 몰입형', cue: "crying · heartbroken · can't move on · tears · sobbing · broke me" },
    { label: 'OST 무드형', cue: 'ost · song · soundtrack · vibe · aesthetic · music' },
    { label: '밈/드립형', cue: 'funny · meme · iconic · savage · lol · 😂 🤣' },
    { label: '정보 소개형', cue: 'plot · title · episodes · streaming on · drama name · starring' },
  ]
  const reactionLegendSection = `
    <div style="padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.015)">
      <details style="font-size:11.5px;color:var(--text-muted)">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;user-select:none;font-weight:600">
          <span style="color:#fbcfe8">ℹ 반응 포인트는 어떻게 분류되나요?</span>
          <span style="opacity:0.6;font-weight:400">(클릭해서 펼치기)</span>
        </summary>
        <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.025);border-radius:6px;line-height:1.65">
          <div style="margin-bottom:8px;color:var(--text-primary)">
            각 Reel의 <strong>caption + 댓글 텍스트</strong>를 7개 카테고리의 영문 키워드와 매칭해 자동 분류합니다.
            매칭된 키워드 수가 많은 카테고리부터 최대 <strong>2개</strong>를 reel에 부여 — 작품 카드의 비율은 그 reel들의 합산입니다.
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:5px;font-size:11px">
            ${IG_REACTION_LEGEND.map(it => `
              <div style="display:flex;gap:8px;align-items:flex-start;padding:4px 6px;background:rgba(255,255,255,0.02);border-radius:4px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${igReactionColor(it.label)};margin-top:4px;flex-shrink:0"></span>
                <div style="min-width:0">
                  <div style="color:var(--text-primary);font-weight:600">${escHtml(igStripHyung(it.label))}</div>
                  <div style="color:var(--text-muted);font-size:10.5px;line-height:1.45">${escHtml(it.cue)}</div>
                </div>
              </div>`).join('')}
          </div>
          <div style="margin-top:8px;font-size:10.5px;color:var(--text-muted);opacity:0.85">
            한계: 영문 키워드 substring 매칭 (word-boundary 아님) — 표본이 작은 카테고리(1-2 reel)는 신뢰도 낮음.
          </div>
        </div>
      </details>
    </div>`

  // ───── Section 1: 🏆 해시태그 기반 작품 언급 순위 (candidatePool 기반) ─────
  const groups = s.contentGroups || []
  const groupsSection = groups.length > 0 ? `
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div style="font-size:12px;color:#fbbf24;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">
        🏆 해시태그 기반 작품 언급 순위
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">여러 Reel에서 겹쳐 등장한 횟수 기준 정렬 — 같은 작품이 여러 hashtag·creator에서 화제일수록 상위</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px">
        ${groups.map((g, idx) => {
          const isUnknown = g.matchSource === 'unknown'
          const accent = isUnknown ? '#9ca3af' : '#fbbf24'
          const bgBase = isUnknown ? 'rgba(156,163,175,0.05)' : 'rgba(251,191,36,0.05)'
          const bgHover = isUnknown ? 'rgba(156,163,175,0.10)' : 'rgba(251,191,36,0.10)'
          const tagsLine = (g.discoveredTags || []).length > 0
            ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;line-height:1.4">발견 태그 ${g.discoveredTags.map(t => `<span style="color:#22d3ee">#${escHtml(t)}</span>`).join(' ')}</div>`
            : ''
          // 🆕 dominant reaction headline
          const dominant = g.dominantReaction
          const dominantLine = (dominant && !isUnknown)
            ? `<div style="font-size:11px;color:${igReactionColor(dominant.label)};margin-top:5px;font-weight:600">
                 주된 반응: ${escHtml(igStripHyung(dominant.label))} <span style="opacity:0.85">${dominant.pct}%</span>
               </div>`
            : ''
          // 🆕 reaction mix stacked bar (label 합계가 100%가 안 될 수 있음 — 분류 안 된 reel 존재)
          const mix = (g.reactionMix || []).slice(0, 5)
          const mixBar = mix.length > 0 ? `
            <div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">
              <div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.05)">
                ${mix.map(m => `<div title="${escHtml(igStripHyung(m.label))} ${m.pct}%" style="width:${m.pct}%;background:${igReactionColor(m.label)};opacity:0.85"></div>`).join('')}
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:9.5px;color:var(--text-muted)">
                ${mix.slice(0, 3).map(m => `<span><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${igReactionColor(m.label)};vertical-align:middle"></span> ${escHtml(igStripHyung(m.label))} ${m.pct}%</span>`).join('')}
              </div>
            </div>` : ''
          // 🆕 engagement class badge
          const engBadge = IG_ENGAGEMENT_BADGE[g.engagementClass] || ''
          return `
            <a href="${escHtml(igReelUrl(g.topReelUrl))}" target="_blank" rel="noopener noreferrer"
               style="display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:${bgBase};border-radius:8px;border-left:3px solid ${accent};text-decoration:none;color:inherit;transition:background 0.15s"
               onmouseover="this.style.background='${bgHover}'"
               onmouseout="this.style.background='${bgBase}'">
              <div style="display:flex;gap:10px;align-items:flex-start">
                ${g.topReelCapturePath ? `<img src="${escHtml(g.topReelCapturePath)}" style="width:60px;height:75px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <div style="font-size:13px;font-weight:700;line-height:1.3;color:${isUnknown ? 'var(--text-muted)' : 'var(--text-primary)'};overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;flex:1;min-width:0">${idx + 1}. ${escHtml(g.title)}</div>
                    <span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:${g.reelCount >= 3 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)'};color:${g.reelCount >= 3 ? '#fbbf24' : 'var(--text-muted)'};font-size:10.5px;font-weight:700;border-radius:8px;flex-shrink:0" title="이 작품이 candidatePool에서 등장한 reel 수">📌 ${g.reelCount}개 Reel</span>
                    ${engBadge}
                  </div>
                  <div style="font-size:10px;color:var(--text-muted);margin-top:3px;line-height:1.4">
                    ${igGroupMetaLine(g)}
                  </div>
                  ${tagsLine}
                  ${dominantLine}
                  ${mixBar}
                </div>
              </div>
            </a>`
        }).join('')}
      </div>
    </div>` : ''

  // 양극화 신호 맵 (reelId → signal)
  const polarMap = new Map((s.polarizationSignals || []).map(p => [p.reelId, p]))
  const POLAR_BADGE = '<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.18);color:#fbbf24;font-size:9.5px;font-weight:700;border-radius:8px;margin-left:5px" title="댓글 좋아요 분산 큼 + 긍·부 의견 양분">⚡ 의견 분열</span>'

  // ───── Section 2: 🔍 Top 3 릴스 딥 댓글 분석 ─────
  const top3 = (s.topReels || []).slice(0, 3).filter(r => (r.deepCommentTotalFetched || 0) > 0 || (r.reactionSummary || []).length > 0)
  const top3Section = top3.length > 0 ? `
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.05);background:rgba(16,185,129,0.04)">
      <div style="font-size:12px;color:#10b981;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">
        🔍 Top 3 릴스 딥 댓글 분석
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        ${top3.map((r, i) => {
          const display = r.shortCaption || (r.caption || '').slice(0, 120)
          const heading = r.keyPhrase ? `"${escHtml(ytTruncate(r.keyPhrase, 110))}"` : escHtml(ytTruncate(display, 110))
          const titleText = r.extractedTitle || '미확인'
          const cat = categoryLabel(r.category)
          const deepN = r.deepCommentTotalFetched || 0
          const summaryBullets = (r.reactionSummary || []).slice(0, 3)
          const repComments = (r.representativeComments || []).slice(0, 3)
          // 🆕 양극화 배지 & 의견 분포 라인
          const polar = polarMap.get(r.id)
          const polarBadge = polar && polar.polarized ? POLAR_BADGE : ''
          const polarLine = polar && polar.polarized ? `
            <div style="font-size:11px;color:#fbbf24;line-height:1.5;padding:6px 8px;background:rgba(245,158,11,0.08);border-radius:4px;border-left:2px solid #fbbf24">
              ⚡ 의견 분열 — 긍정 표현 ${polar.agreementCount}개 vs 부정 표현 ${polar.disagreementCount}개
              ${polar.topDisagreement ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic" title="${escHtml(polar.topDisagreement.text || '')}">"${escHtml(ytTruncate(polar.topDisagreement.textKo || polar.topDisagreement.text, 100))}"</div>` : ''}
            </div>` : ''
          return `
            <div style="display:flex;flex-direction:column;gap:8px;padding:12px 14px;background:rgba(16,185,129,0.06);border-radius:8px;border-left:3px solid #10b981">
              <a href="${escHtml(igReelUrl(r))}" target="_blank" rel="noopener noreferrer"
                 style="display:flex;gap:12px;align-items:flex-start;text-decoration:none;color:inherit;border-radius:6px;padding:6px;margin:-6px;transition:background 0.15s"
                 onmouseover="this.style.background='rgba(16,185,129,0.10)'"
                 onmouseout="this.style.background='transparent'"
                 title="${escHtml(r.caption || '')}">
                ${r.capturePath ? `<img src="${escHtml(r.capturePath)}" style="width:80px;height:100px;object-fit:cover;border-radius:4px;flex-shrink:0">` : ''}
                <div style="flex:1;min-width:0">
                  <div style="font-size:11px;color:#10b981;font-weight:700;margin-bottom:3px">[${i + 1}] ${escHtml(titleText)} ${escHtml(cat)} Reel${polarBadge} <span style="font-size:9px;opacity:0.7">↗ instagram</span></div>
                  <div style="font-size:14px;font-weight:700;line-height:1.4;color:var(--text-primary)">${heading}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
                    @${escHtml(r.author?.username || 'unknown')} · ${igMetaLine(r)}
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                    출처: <span style="color:#22d3ee">#${escHtml(r.tag)}</span> · ${escHtml(cat)}
                    ${deepN > 0 ? ` · <span style="color:#10b981">🔍 깊은 댓글 분석 ${deepN}개</span>` : ''}
                  </div>
                </div>
              </a>
              ${polarLine}
              ${summaryBullets.length > 0 ? `
                <div>
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">댓글 반응 요약</div>
                  <div style="display:flex;flex-direction:column;gap:4px;font-size:12.5px;line-height:1.55;color:var(--text-primary)">
                    ${summaryBullets.map(b => {
                      // 라벨 — 내용 형식 분리. 라벨 일치 시 굵게, 아니면 plain
                      const m = /^(핵심 반응|미세 신호|특정 표현)\s*—\s*(.+)$/.exec(b)
                      if (m) {
                        return `<div style="padding-left:6px;border-left:2px solid rgba(236,72,153,0.35)"><strong style="color:var(--text-primary)">${escHtml(m[1])} —</strong> <span style="color:var(--text-muted)">${escHtml(m[2])}</span></div>`
                      }
                      return `<div style="padding-left:6px;border-left:2px solid rgba(255,255,255,0.08);color:var(--text-muted)">${escHtml(b)}</div>`
                    }).join('')}
                  </div>
                </div>` : ''}
              ${repComments.length > 0 ? `
                <div>
                  <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">대표 댓글</div>
                  <div style="display:flex;flex-direction:column;gap:4px">
                    ${repComments.map(c => {
                      const ko = c.textKo || c.text
                      return `<div style="font-size:12px;line-height:1.5;color:var(--text-primary);padding:6px 8px;background:rgba(255,255,255,0.025);border-radius:4px" title="${escHtml(c.text)}">💬 "${escHtml(ytTruncate(ko, 140))}" <span style="color:var(--text-muted);font-size:10px">— @${escHtml(c.author)}</span></div>`
                    }).join('')}
                  </div>
                </div>` : ''}
            </div>`
        }).join('')}
      </div>
    </div>` : ''

  // ───── Section 3: 🎬 Reel TOP 10 ─────
  const topReelsSection = `
    <div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">
        🎬 Reel TOP ${(s.topReels || []).length}
      </div>
      ${collapsibleSection('ig-top', s.topReels || [], 3, (v, idx) => {
        const isDeep = (v.deepCommentTotalFetched || 0) > 0 || v.isTop3Deep
        const borderColor = isDeep ? '#10b981' : (IG_CHANNEL_COLOR[v.channelType] || '#9ca3af')
        const titleLine = v.extractedTitle
          ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">작품: <strong style="color:var(--text-primary)">${escHtml(v.extractedTitle)}</strong></div>`
          : `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">작품: <span style="font-style:italic">미확인</span></div>`
        const reactionLine = (v.reactionTypes || []).length > 0
          ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">반응 포인트: ${v.reactionTypes.map(t => `<span style="color:#fbcfe8">${escHtml(igStripHyung(t))}</span>`).join(' · ')}</div>`
          : ''
        const deepLine = isDeep
          ? `<div style="font-size:10.5px;color:#10b981;margin-top:2px">🔍 깊은 댓글 분석 ${v.deepCommentTotalFetched || 0}개 · #${escHtml(v.tag)} · ${escHtml(categoryLabel(v.category))}</div>`
          : ''
        const display = v.shortCaption || (v.caption || '').slice(0, 120)
        const heading = v.keyPhrase ? `"${escHtml(ytTruncate(v.keyPhrase, 100))}"` : escHtml(ytTruncate(display, 110))
        return `
          <a href="${escHtml(igReelUrl(v))}" target="_blank" rel="noopener noreferrer"
             style="display:flex;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:${isDeep ? '3px' : '2px'} solid ${borderColor};margin-bottom:5px;text-decoration:none;color:inherit"
             title="${escHtml(v.caption || '')}">
            ${v.capturePath ? `<img src="${escHtml(v.capturePath)}" style="width:60px;height:80px;object-fit:cover;border-radius:3px;flex-shrink:0">` : ''}
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${idx != null ? `${idx + 1}. ` : ''}${heading}${IG_CHANNEL_BADGE[v.channelType] || ''}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:3px">
                @${escHtml(v.author?.username || 'unknown')}
                · ${igMetaLine(v)}
                · #${escHtml(v.tag)}
              </div>
              ${titleLine}
              ${reactionLine}
              ${deepLine}
            </div>
          </a>`
      })}
    </div>`

  // ───── Section 3.5 (신규): 📈 신흥 미시 트렌드 ─────
  // candidatePool에서 top10에 못 든 작품 중 ≥2회 등장
  const emerging = (s.emergingTrends || [])
  const emergingSection = emerging.length > 0 ? `
    <div style="padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.05)">
      <div style="font-size:12px;color:#22d3ee;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">
        📈 신흥 미시 트렌드
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Top ${(s.topReels || []).length}에 못 들었지만 후보 풀에 ≥2회 등장한 작품 — 떠오르는 화제</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">
        ${emerging.map((e, i) => {
          const reelLink = e.sampleReelUrl ? igReelUrl(e.sampleReelUrl) : null
          const wrap = reelLink
            ? (inner) => `<a href="${escHtml(reelLink)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit">${inner}</a>`
            : (inner) => inner
          return wrap(`
            <div style="padding:8px 10px;background:rgba(34,211,238,0.04);border-radius:6px;border-left:2px solid #22d3ee">
              <div style="font-size:12.5px;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${i + 1}. ${escHtml(e.title)}</div>
              <div style="font-size:10.5px;color:#22d3ee;margin-top:2px">${e.candidateCount}회 등장</div>
              ${e.sampleCaption ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escHtml(e.sampleCaption)}</div>` : ''}
            </div>`)
        }).join('')}
      </div>
    </div>` : ''

  // ───── Section 4: 📊 수집 상태 보기 (접기) ─────
  const allWarnings = s.warnings || []
  const summaryLine = allWarnings[0] || '공개 인기 태그 기준'
  const detailLines = allWarnings.slice(1)
  const statusSection = `
    <div style="padding:10px 18px">
      <details style="font-size:11px;color:var(--text-muted)">
        <summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:6px;user-select:none">
          <span>📊 수집 상태 보기</span>
          <span style="opacity:0.7">— ${escHtml(summaryLine)}</span>
        </summary>
        ${detailLines.length > 0 ? `
          <ul style="margin:8px 0 0 18px;padding:0;line-height:1.6">
            ${detailLines.map(w => `<li>${escHtml(w)}</li>`).join('')}
          </ul>` : '<div style="margin-top:6px">추가 경고 없음.</div>'}
      </details>
    </div>`

  return `
    <div class="card" style="border-left:3px solid #E1306C">
      ${headerHtml}
      <div class="card-body" style="padding:0">
        ${reactionLegendSection}
        ${groupsSection}
        ${top3Section}
        ${topReelsSection}
        ${emergingSection}
        ${statusSection}
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
          <div style="font-size:13px;color:#c4b5fd;text-transform:uppercase;font-weight:700;margin-bottom:3px">📊 종합</div>
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
          <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px">⭐ 평점 분포 (${distTotal}개 리뷰)</div>
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
          <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:4px">💬 댓글 감정</div>
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
          <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">🗣️ 리뷰·코멘트 쟁점 클러스터</div>
          ${renderCommentDebatesInline(a.reviewDebates)}
        </div>` : ''}

      <!-- 대표 리뷰 -->
      ${(a.representativeReviews && a.representativeReviews.length) ? (() => {
        const reviewsUrl = (a.drama.url || '').replace(/\/$/, '') + '/reviews'
        return `
        <div style="margin-top:10px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
            <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:700">📝 대표 리뷰</div>
            <a href="${escHtml(reviewsUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#a78bfa;text-decoration:none">MDL에서 모든 리뷰 보기 ↗</a>
          </div>
          ${a.representativeReviews.map(r => {
            const display = r.bodyKo || r.body
            const original = r.bodyKo && r.bodyKo !== r.body ? r.body : null
            return `
            <a href="${escHtml(reviewsUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit">
              <div style="font-size:11px;padding:6px 10px;background:rgba(255,255,255,0.025);border-left:2px solid ${SENT_COLOR[r.sentiment]};margin-bottom:4px;border-radius:3px;line-height:1.5;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='rgba(167,139,250,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.025)'">
                <span style="margin-right:5px">${SENT_ICON[r.sentiment]}</span>
                <strong style="color:#a78bfa">${escHtml(r.username)}</strong>
                <span style="color:var(--text-muted)">⭐${r.rating}</span>
                <span style="color:var(--text-muted);margin-left:6px">👍${r.helpful}</span>
                <span style="color:var(--text-muted);margin-left:6px;font-size:10px">↗</span>
                <div style="margin-top:3px;color:var(--text-primary)">"${escHtml(display)}"</div>
                ${original ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic;opacity:0.7">↳ ${escHtml(original)}</div>` : ''}
              </div>
            </a>`
          }).join('')}
        </div>`
      })() : ''}

      <!-- 시청자 즉각 반응 (코멘트 별도 분석) -->
      ${(() => {
        const ci = a.commentInsights
        if (!ci || !ci.commentCount) return ''
        const cTotal = ci.sentiment.positive + ci.sentiment.negative || 1
        const cPos = Math.round(ci.sentiment.positiveRatio * 100)
        const cNeg = Math.round(ci.sentiment.negativeRatio * 100)
        const dramaUrl = (a.drama.url || '').replace(/\/$/, '')
        return `
        <div style="margin-top:12px;padding:10px 12px;background:rgba(59,130,246,0.04);border-radius:6px;border:1px solid rgba(59,130,246,0.15)">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;flex-wrap:wrap;gap:6px">
            <div style="font-size:13px;color:#60a5fa;text-transform:uppercase;font-weight:700">💬 시청자 즉각 반응 (코멘트 ${ci.commentCount}개)</div>
            <a href="${escHtml(dramaUrl)}#comments" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#60a5fa;text-decoration:none">MDL에서 모든 코멘트 보기 ↗</a>
          </div>
          <div style="font-size:11px;line-height:1.5;color:var(--text-primary);margin-bottom:6px">${escHtml(ci.sentimentSummary)}</div>
          ${cTotal > 1 ? `
            <div style="display:flex;height:5px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.04);margin-bottom:8px">
              <div style="width:${cPos}%;background:#10b981"></div>
              <div style="width:${cNeg}%;background:#ef4444"></div>
            </div>` : ''}
          ${(ci.debates && ci.debates.length) ? `
            <div style="margin-bottom:8px">
              <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">🗣️ 코멘트 쟁점</div>
              ${renderCommentDebatesInline(ci.debates)}
            </div>` : ''}
          ${(ci.topLiked && ci.topLiked.length) ? `
            <div>
              <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:5px">👍 좋아요 TOP 코멘트</div>
              ${ci.topLiked.map(c => {
                const display = c.bodyKo || c.body
                const original = c.bodyKo && c.bodyKo !== c.body ? c.body : null
                return `
                <a href="${escHtml(dramaUrl)}#comments" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;color:inherit">
                  <div style="font-size:11px;padding:6px 10px;background:rgba(255,255,255,0.025);border-left:2px solid ${SENT_COLOR[c.sentiment]};margin-bottom:4px;border-radius:3px;line-height:1.5;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='rgba(96,165,250,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.025)'">
                    <span style="margin-right:5px">${SENT_ICON[c.sentiment]}</span>
                    <strong style="color:#60a5fa">${escHtml(c.username)}</strong>
                    <span style="color:var(--text-muted)">👍${c.likes}</span>
                    ${c.daysAgo ? `<span style="color:var(--text-muted);margin-left:6px;font-size:10px">${escHtml(c.daysAgo)}</span>` : ''}
                    ${c.isReply ? `<span style="color:var(--text-muted);margin-left:6px;font-size:10px;opacity:0.6">↳ 답글</span>` : ''}
                    <span style="color:var(--text-muted);margin-left:6px;font-size:10px">↗</span>
                    <div style="margin-top:3px;color:var(--text-primary)">"${escHtml(display)}"</div>
                    ${original ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic;opacity:0.7">↳ ${escHtml(original)}</div>` : ''}
                  </div>
                </a>`
              }).join('')}
            </div>` : ''}
        </div>`
      })()}
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
      <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">🗣️ 댓글 쟁점 클러스터 TOP ${debates.length}</div>
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
                  <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:3px">주요 의견</div>
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
          // 의견 유형 — 인라인 chip 형식 (이전: deep-mini-panel grid 박스 → 1줄 컴팩트)
          const opinionInline = Object.entries(d.opinionTypes)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;background:rgba(255,255,255,0.04);border-radius:9px;font-size:10.5px"><span>${OPINION_LABEL_KO[k]}</span><span style="color:var(--text-muted);font-weight:600">${v}</span></span>`)
            .join('') || '<span style="opacity:0.6">없음</span>'
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

                    <div style="font-size:10.5px;color:var(--text-muted);margin:6px 0 8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                      <span style="text-transform:uppercase;font-weight:600;opacity:0.7">의견 유형:</span>
                      ${opinionInline}
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
      <div id="tiktok-section"></div>
      <div id="instagram-section"></div>
      <div id="gtrends-section"></div>

    </div>`
}

// ============================================================
// Page: Crawl
// ============================================================
function renderCrawl() {
  if (!window._selectedSources) window._selectedSources = { reddit: true, mdl: true, gtrends: true, youtube: true, tiktok: true }
  const sel = window._selectedSources
  if (sel.gtrends === undefined) sel.gtrends = true
  if (sel.youtube === undefined) sel.youtube = true
  if (sel.tiktok === undefined) sel.tiktok = true
  const mdlForce = window._mdlForce || false
  const gtrendsForce = window._gtrendsForce || false
  const youtubeForce = window._youtubeForce || false
  const tiktokForce = window._tiktokForce || false

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
  const tiktokCacheHint = cacheHintFor(state.tiktokSummary, '캐시 사용')

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

  const tiktokExtra = sel.tiktok ? `
    <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted);cursor:pointer">
      <input type="checkbox" ${tiktokForce ? 'checked' : ''} onchange="toggleTiktokForce()"
             style="width:13px;height:13px;cursor:pointer;accent-color:#ec4899">
      캐시 무시하고 강제 새로고침
    </label>` : ''

  const anySelected = sel.reddit || sel.mdl || sel.gtrends || sel.youtube || sel.tiktok

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
              `해시태그 14개 + 영상 30개 + 댓글 ~900개 · ${youtubeCacheHint}`,
              youtubeExtra
            )}
            ${sourceCard(
              'tiktok', '#ec4899', 'fab fa-tiktok', 'TikTok SNS 버즈',
              `키워드 5개 + 영상 30개 + 댓글 ~450개 · ${tiktokCacheHint}`,
              tiktokExtra
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
  if (page === 'top-ranking') setTimeout(() => loadTopRanking(false), 50)
  if (page === 'history')  setTimeout(loadHistory, 100)
  if (page === 'schedule') setTimeout(loadSchedule, 100)
  if (page === 'dashboard' && typeof loadMdlSummary === 'function') {
    setTimeout(() => loadMdlSummary(false), 100)
    setTimeout(() => loadGTrendsSummary(false), 100)
    setTimeout(() => loadYoutubeSummary(false), 100)
    // TikTok 자동 크롤 비활성 (2026-05-12: API 봇 차단 진단 후)
    setTimeout(() => { if (typeof loadTiktokSummaryFromCacheOnly === 'function') loadTiktokSummaryFromCacheOnly() }, 150)
    // Instagram은 자동 트리거 제거 (2026-05-08: 사용자 IP throttle 회피)
    // 캐시된 데이터만 GET으로 가져옴 (force=false → 캐시 hit이면 즉시, miss면 placeholder)
    setTimeout(() => { if (typeof loadInstagramSummaryFromCacheOnly === 'function') loadInstagramSummaryFromCacheOnly() }, 200)
    // 영문→한국 원제 동적 매핑 — 캐시 hit 시 즉시 머지 (2026-05-12)
    setTimeout(() => { if (typeof loadMdlNativeTitleMap === 'function') loadMdlNativeTitleMap() }, 250)
  }
}

// MDL Popular nativeTitle 자동 매핑 — 부팅 시 1회 fetch해서 K_DRAMA_TITLE_MAP에 머지 (2026-05-12)
// + Upcoming K-드라마 매핑도 함께 통합 (2026-05-13)
// - 정적 사전 우선, 캐시 hit이면 동적 보충
// - 캐시 miss이면 매핑은 비어 있고 정적 사전만 사용 (수동 새로고침으로 채울 수 있음)
async function loadMdlNativeTitleMap() {
  try {
    const [popularRes, upcomingRes] = await Promise.allSettled([
      fetch('/api/mdl/native-titles').then((x) => x.json()),
      fetch('/api/mdl/upcoming-titles').then((x) => x.json()),
    ])
    const staticMap = window.K_DRAMA_TITLE_MAP || {}
    let added = 0
    const mergeOne = (resp, label) => {
      if (resp.status !== 'fulfilled') return
      const r = resp.value
      if (!r?.ok || !r.map) return
      let cnt = 0
      for (const [enTitle, koTitle] of Object.entries(r.map)) {
        const key = String(enTitle).toLowerCase().trim().replace(/\s+/g, ' ')
        if (!staticMap[key]) {
          staticMap[key] = koTitle
          cnt++
        }
      }
      if (cnt > 0) console.log(`[K_DRAMA_TITLE_MAP] ${label} +${cnt}개`)
      added += cnt
    }
    mergeOne(popularRes, 'popular')
    mergeOne(upcomingRes, 'upcoming')
    window.K_DRAMA_TITLE_MAP = staticMap
    if (added > 0) {
      console.log(`[K_DRAMA_TITLE_MAP] 동적 매핑 ${added}개 자동 추가 (총 ${Object.keys(staticMap).length}개)`)
      if (typeof rerenderContentTrend === 'function') rerenderContentTrend()
    }
  } catch {}
}

async function prefetchMdlCache() {
  if (state.mdlSummary) return
  try {
    const r = await fetch('/api/mdl').then(x => x.json())
    if (r.ok && r.summary) {
      state.mdlSummary = r.summary
      if (state.page === 'crawl') renderPage()
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
      if (state.page === 'crawl') renderPage()
    }
  } catch {}
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

function toggleTiktokForce() {
  window._tiktokForce = !window._tiktokForce
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
  const sel = window._selectedSources || { reddit: true, mdl: true, gtrends: true, youtube: true, tiktok: true }
  const mdlForce = !!window._mdlForce
  const gtrendsForce = !!window._gtrendsForce
  const youtubeForce = !!window._youtubeForce
  const tiktokForce = !!window._tiktokForce

  if (!sel.reddit && !sel.mdl && !sel.gtrends && !sel.youtube && !sel.tiktok) {
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
  if (sel.tiktok) labels.push('TikTok' + (tiktokForce ? ' (강제)' : ''))
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

  if (sel.tiktok) {
    tasks.push((async () => {
      addLog(`[TikTok] 시작${tiktokForce ? ' (캐시 무시)' : ''}...`, 'info')
      try {
        const res = await fetch('/api/tiktok/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: tiktokForce }),
        }).then(x => x.json())
        if (res.ok && res.summary) {
          state.tiktokSummary = res.summary
          const v = res.summary.totalVideos || 0
          const c = res.summary.totalComments || 0
          if (res.cached) {
            addLog(`[TikTok] ✅ 캐시 사용 — 영상 ${v}개, 댓글 ${c}개`, 'success')
          } else {
            addLog(`[TikTok] ✅ 새 크롤링 완료 — 영상 ${v}개, 댓글 ${c}개`, 'success')
          }
          return { source: 'tiktok', ok: true }
        }
        addLog(`[TikTok] ❌ ${res.error || '오류'}`, 'error')
        return { source: 'tiktok', ok: false, error: res.error }
      } catch (e) {
        addLog(`[TikTok] ❌ 연결 오류: ${e.message}`, 'error')
        return { source: 'tiktok', ok: false, error: e.message }
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

// ============================================================
// 명작 랭킹 (MDL 역대 글로벌 인기 K드라마)
// ============================================================
async function loadTopRanking(force = false) {
  if (state.topRankingLoading) return
  state.topRankingLoading = true

  try {
    if (!force) {
      const r = await fetch('/api/mdl/top-ranking').then(x => x.json())
      if (r.ok && r.items && r.items.length > 0) {
        state.topRanking = r
        if (state.page === 'top-ranking') renderPage()
        state.topRankingLoading = false
        return
      }
    }

    if (state.page === 'top-ranking') renderPage()  // placeholder("로딩중") 표시

    const r = await fetch('/api/mdl/top-ranking/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.items) {
      state.topRanking = r
    } else {
      state.topRanking = { ok: false, error: r.error || '데이터 없음' }
    }
  } catch (e) {
    state.topRanking = { ok: false, error: String(e) }
  } finally {
    state.topRankingLoading = false
    if (state.page === 'top-ranking') renderPage()
  }
}

function renderTopRanking() {
  const data = state.topRanking
  const loading = state.topRankingLoading

  let body = ''
  if (loading && (!data || !data.items)) {
    body = `
      <div class="empty-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>역대 랭킹 수집 중... (Playwright 크롤, 30초~1분 소요)</p>
      </div>`
  } else if (!data || (data.ok === false)) {
    body = `
      <div class="empty-state">
        <i class="fas fa-medal"></i>
        <p>아직 데이터가 없습니다${data?.error ? ` (${escHtml(data.error)})` : ''}</p>
        <button class="btn btn-primary" style="margin-top:12px" onclick="loadTopRanking(true)">
          <i class="fas fa-spider"></i> 지금 크롤하기
        </button>
      </div>`
  } else if (!data.items || data.items.length === 0) {
    body = `<div class="empty-state"><i class="fas fa-medal"></i><p>데이터 없음</p></div>`
  } else {
    body = renderTopRankingTable(data.items)
  }

  const meta = (data && data.fetchedAt)
    ? (() => {
        const ago = Math.round((Date.now() - new Date(data.fetchedAt).getTime()) / 60000)
        const exp = data.expiresAt ? new Date(data.expiresAt) : null
        const expTxt = exp ? ` · 만료 ${exp.toLocaleDateString('ko-KR')}` : ''
        return `<span style="font-size:11px;color:var(--text-muted)">캐시 · ${ago < 60 ? ago + '분' : Math.round(ago/60) + '시간'} 전${expTxt}</span>`
      })()
    : ''

  const count = data?.items?.length || 0

  return `
    <div class="page-header">
      <div>
        <div class="page-title">
          <a href="https://mydramalist.com/shows/popular" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none" title="MyDramaList Popular 페이지 열기">
            🏆 MDL 글로벌 인기 K드라마 <i class="fas fa-arrow-up-right-from-square" style="font-size:13px;color:var(--text-muted);margin-left:4px"></i>
          </a>
        </div>
        <div class="page-sub" title="MyDramaList 공식 FAQ: 'Our Dramas and Movies are ranked using a complex algorithm that takes into account several factors including how many people added the drama to their list, the ratings given by users, the number of comments and recommendations, and reviews from viewers.'">
          리스트 추가 수 · 시청자 평점 · 댓글 수 · 추천 수 · 리뷰를 종합한 MyDramaList 공식 인기 알고리즘 기준 · 한 달마다 갱신${count ? ` · ${count}개 작품` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        ${meta}
        <button class="btn btn-outline" onclick="loadTopRanking(true)" ${loading ? 'disabled' : ''}>
          <i class="fas fa-sync-alt ${loading ? 'fa-spin' : ''}"></i> 새로고침
        </button>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div class="card">
        <div class="card-body" style="padding:0">
          ${body}
        </div>
      </div>
    </div>`
}

function renderTopRankingTable(items) {
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:50px">#</th>
          <th style="width:80px"></th>
          <th>제목</th>
          <th style="width:90px">연도</th>
          <th style="width:90px">에피소드</th>
          <th style="width:100px;text-align:right">평점</th>
          <th style="width:40px"></th>
        </tr>
      </thead>
      <tbody>
        ${items.map((d, i) => renderTopRankingRow(d, i)).join('')}
      </tbody>
    </table>`
}

function renderTopRankingRow(d, i) {
  const exp = state.topRankingExpanded[d.slug]
  const isOpen = !!exp
  return `
    <tr style="cursor:pointer" onclick="toggleTopRankingRow('${escAttr(d.slug)}')" title="클릭하여 리뷰 분석 보기">
      <td><span class="rank-num ${typeof rankColor === 'function' ? rankColor(i) : ''}" style="font-size:13px">${i+1}</span></td>
      <td>${d.posterUrl ? `<img src="${d.posterUrl}" alt="" style="width:54px;height:78px;object-fit:cover;border-radius:4px;display:block" loading="lazy">` : ''}</td>
      <td>
        <div style="font-size:13px;font-weight:600">
          <a href="${d.url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none" onclick="event.stopPropagation()">${escHtml(d.title)}</a>
          ${exp?.analysis ? '<span style="margin-left:6px;font-size:10px;color:#10b981" title="분석 캐시됨">📊</span>' : ''}
        </div>
        ${d.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escHtml(d.description)}</div>` : ''}
      </td>
      <td style="font-size:12px;color:var(--text-muted)">${d.year || '-'}</td>
      <td style="font-size:12px;color:var(--text-muted)">${d.episodes ? d.episodes + '화' : '-'}</td>
      <td style="text-align:right">
        <span style="font-size:14px;font-weight:700;color:#a78bfa">⭐ ${d.rating ? d.rating.toFixed(2) : '-'}</span>
      </td>
      <td style="text-align:center;color:var(--text-muted)"><i class="fas fa-chevron-${isOpen ? 'up' : 'down'}" style="font-size:11px"></i></td>
    </tr>
    ${isOpen ? `
      <tr class="expanded-analysis-row">
        <td colspan="7" style="padding:0;background:rgba(167,139,250,0.04);border-top:1px solid rgba(167,139,250,0.15)">
          ${renderDramaAnalysisPanel(d, exp)}
        </td>
      </tr>` : ''}
  `
}

function renderDramaAnalysisPanel(d, exp) {
  if (exp.loading) {
    return `
      <div style="padding:18px 22px;display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:12px">
        <i class="fas fa-spinner fa-spin"></i>
        <span>${escHtml(d.title)} 리뷰 10개 + 코멘트 분석 중... (Playwright, 약 17초)</span>
      </div>`
  }
  if (exp.error) {
    return `
      <div style="padding:18px 22px;font-size:12px;color:#ef4444">
        <i class="fas fa-circle-exclamation"></i> 분석 실패: ${escHtml(exp.error)}
        <button class="btn btn-outline" style="margin-left:10px;padding:3px 10px;font-size:11px" onclick="event.stopPropagation();loadDramaAnalysis('${escAttr(d.slug)}', true)">재시도</button>
      </div>`
  }
  const a = exp.analysis
  if (!a) return ''

  const sent = a.reviewSentiment || {}
  const total = (sent.positive || 0) + (sent.negative || 0) || 1
  const pos = Math.round((sent.positiveRatio || 0) * 100)
  const neg = Math.round((sent.negativeRatio || 0) * 100)
  const br = a.ratingBreakdown || { distribution: { '9-10': 0, '7-9': 0, '5-7': 0, 'below5': 0 } }
  const distTotal = (br.distribution['9-10'] + br.distribution['7-9'] + br.distribution['5-7'] + br.distribution['below5']) || 1
  const distBar = (n, color, label) => n > 0 ? `<div style="flex:${n};background:${color}" title="${label}: ${n}개 (${Math.round(n/distTotal*100)}%)"></div>` : ''

  const reps = (a.representativeReviews || []).slice(0, 2)
  const debates = (a.reviewDebates || []).slice(0, 4)

  return `
    <div style="padding:18px 22px" onclick="event.stopPropagation()">
      <!-- 인기 사유 -->
      <div style="font-size:13px;color:#c4b5fd;font-weight:600;margin-bottom:8px">📊 ${escHtml(d.title)} 분석</div>
      <div style="font-size:12px;line-height:1.6;margin-bottom:12px">${escHtml(a.popularityReason || '')}</div>

      <!-- 평점 분포 + 감정 -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:14px">
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:4px">평점 분포 (리뷰 ${a.drama?.reviewCount || 0}개)</div>
          <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.05)">
            ${distBar(br.distribution['9-10'], '#10b981', '9-10')}
            ${distBar(br.distribution['7-9'], '#84cc16', '7-9')}
            ${distBar(br.distribution['5-7'], '#f59e0b', '5-7')}
            ${distBar(br.distribution['below5'], '#ef4444', '<5')}
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px">
            <span style="color:#10b981">9-10: ${br.distribution['9-10']}</span> ·
            <span style="color:#84cc16">7-9: ${br.distribution['7-9']}</span> ·
            <span style="color:#f59e0b">5-7: ${br.distribution['5-7']}</span> ·
            <span style="color:#ef4444">&lt;5: ${br.distribution['below5']}</span>
          </div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:4px">댓글 감정</div>
          <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,0.05)">
            <div style="flex:${pos};background:#10b981"></div>
            <div style="flex:${neg};background:#ef4444"></div>
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:4px">
            <span style="color:#10b981">긍정 ${pos}%</span> · <span style="color:#ef4444">부정 ${neg}%</span>
            ${a.polarized ? `<span style="margin-left:8px;color:#f59e0b" title="${escAttr(a.polarizedReason || '')}">⚡ 평가 분열</span>` : ''}
          </div>
        </div>
      </div>

      <!-- 감정 요약 -->
      ${a.sentimentSummary ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid #a78bfa">${escHtml(a.sentimentSummary)}</div>` : ''}

      <!-- 토픽 클러스터 -->
      ${debates.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">주요 토픽</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${debates.map(t => {
              const color = t.opinionDirection === 'positive' ? '#10b981' : t.opinionDirection === 'negative' ? '#ef4444' : '#a78bfa'
              const dirIcon = t.opinionDirection === 'positive' ? '👍' : t.opinionDirection === 'negative' ? '👎' : '💬'
              return `<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:${color}22;color:${color}">${dirIcon} ${escHtml(t.topic)} ${t.count}</span>`
            }).join('')}
          </div>
        </div>` : ''}

      <!-- 대표 리뷰 -->
      ${reps.length ? `
        <div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-bottom:6px">대표 리뷰 (helpful 순)</div>
          ${reps.map((r, ri) => {
            const sColor = r.sentiment === 'positive' ? '#10b981' : r.sentiment === 'negative' ? '#ef4444' : '#94a3b8'
            const hasKo = !!r.bodyKo
            const revId = `rev-${escAttr(d.slug)}-${ri}`
            return `
              <div style="font-size:11px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:4px;border-left:2px solid ${sColor};margin-bottom:6px;line-height:1.5">
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:3px;font-size:10px;color:var(--text-muted)">
                  <strong style="color:var(--text-primary)">${escHtml(r.username)}</strong>
                  <span>⭐ ${r.rating || '-'}</span>
                  <span>👍 ${r.helpful}</span>
                  ${hasKo ? `<button style="margin-left:auto;padding:1px 8px;font-size:10px;background:transparent;border:1px solid var(--border);border-radius:3px;color:var(--text-muted);cursor:pointer" onclick="event.stopPropagation();toggleReviewLang('${revId}')"><span id="${revId}-label">원문 보기</span></button>` : ''}
                </div>
                ${hasKo ? `
                  <div id="${revId}-ko" style="color:var(--text-secondary)">${escHtml(r.bodyKo)}</div>
                  <div id="${revId}-en" style="color:var(--text-muted);font-style:italic;display:none">${escHtml(r.body)}</div>
                ` : `<div style="color:var(--text-secondary)">${escHtml(r.body)}</div>`}
              </div>`
          }).join('')}
        </div>` : ''}
    </div>`
}

function escAttr(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) }

function toggleReviewLang(revId) {
  const ko = document.getElementById(`${revId}-ko`)
  const en = document.getElementById(`${revId}-en`)
  const lbl = document.getElementById(`${revId}-label`)
  if (!ko || !en || !lbl) return
  const showingKo = ko.style.display !== 'none'
  ko.style.display = showingKo ? 'none' : ''
  en.style.display = showingKo ? '' : 'none'
  lbl.textContent = showingKo ? '한글 보기' : '원문 보기'
}

function toggleTopRankingRow(slug) {
  const exp = state.topRankingExpanded[slug]
  if (exp) {
    delete state.topRankingExpanded[slug]
    renderPage()
    return
  }
  // 펼치기 → 캐시 시도 후 없으면 분석 호출
  state.topRankingExpanded[slug] = { loading: false, analysis: null, error: null }
  renderPage()
  loadDramaAnalysis(slug, false)
}

async function loadDramaAnalysis(slug, force) {
  state.topRankingExpanded[slug] = { ...(state.topRankingExpanded[slug] || {}), loading: true, error: null }
  if (state.page === 'top-ranking') renderPage()

  try {
    if (!force) {
      const r = await fetch(`/api/mdl/drama/${encodeURIComponent(slug)}`).then(x => x.json())
      if (r.ok && r.analysis) {
        state.topRankingExpanded[slug] = { loading: false, analysis: r.analysis, error: null, cached: true }
        if (state.page === 'top-ranking') renderPage()
        return
      }
    }
    const r = await fetch(`/api/mdl/drama/${encodeURIComponent(slug)}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    }).then(x => x.json())
    if (r.ok && r.analysis) {
      state.topRankingExpanded[slug] = { loading: false, analysis: r.analysis, error: null, cached: r.cached }
    } else {
      state.topRankingExpanded[slug] = { loading: false, analysis: null, error: r.error || '분석 실패' }
    }
  } catch (e) {
    state.topRankingExpanded[slug] = { loading: false, analysis: null, error: String(e) }
  } finally {
    if (state.page === 'top-ranking') renderPage()
  }
}

// ============================================================
// Sidebar
// ============================================================
function renderSidebar() {
  const nav = [
    ['dashboard', 'fas fa-chart-pie',    '대시보드'],
    ['top-ranking', 'fas fa-medal',       '명작 랭킹'],
    ['crawl',     'fas fa-spider',        '크롤링'],
    ['schedule',  'fas fa-clock',         '스케줄'],
    ['history',   'fas fa-folder-open',   '아카이브'],
    ['help',      'fas fa-circle-question', '도움말'],
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
    'top-ranking': renderTopRanking,
    crawl:     renderCrawl,
    history:   renderHistory,
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
        <div class="page-title">대시보드 가이드</div>
        <div class="page-sub">처음 사용하는 분을 위한 섹션별 설명</div>
      </div>
    </div>
    <div style="padding:20px 28px">
      <div class="card">
        <div class="card-body" id="guide-content" style="padding:36px 44px;max-width:880px;margin:0 auto;color:var(--text-primary)">
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
    // TikTok 자동 크롤 비활성 (2026-05-12: API 봇 차단 진단 후) — 캐시만 표시
    setTimeout(() => { if (typeof loadTiktokSummaryFromCacheOnly === 'function') loadTiktokSummaryFromCacheOnly() }, 100)
    // Instagram 자동 트리거 제거 — 캐시만 표시 (사용자가 직접 새로고침 눌러야 크롤)
    setTimeout(() => { if (typeof loadInstagramSummaryFromCacheOnly === 'function') loadInstagramSummaryFromCacheOnly() }, 100)
  }
}

window._crawlType = 'daily'

document.addEventListener('DOMContentLoaded', init)
