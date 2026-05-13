// ============================================================
// 뉴스레터 HTML 빌더 v2 (2026-05-12)
//   - 브랜드 컬러 #FFC857 기반 sunset 그라데이션
//   - 9블록: 헤더·헤드라인·매트릭스·화제도·한국어 인사이트·Reddit deep·MDL·글로벌 반응·footer
//   - 빈 데이터 graceful degrade (섹션 자동 hide)
// ============================================================

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { MdlSummary, YoutubeSummary, GTrendsSummary, InstagramSummary } from '../types/index.js'

// ── 정적 한국어 사전 (public/static/korean-titles.js와 동일 데이터, 서버 측 사용용) ──
// 파일을 한 번 읽어 정규식으로 'key': 'value' 라인 파싱 — 모듈 로드 시 1회만 실행
let STATIC_KOREAN_TITLE_MAP: Map<string, string> | null = null
function loadStaticKoreanTitleMap(): Map<string, string> {
  if (STATIC_KOREAN_TITLE_MAP) return STATIC_KOREAN_TITLE_MAP
  const map = new Map<string, string>()
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const filePath = path.join(__dirname, '..', '..', 'public', 'static', 'korean-titles.js')
    const src = fs.readFileSync(filePath, 'utf-8')
    // window.K_DRAMA_TITLE_MAP = { ... } 블록만 추출 (배우 사전은 제외)
    const dramaBlock = src.match(/window\.K_DRAMA_TITLE_MAP\s*=\s*\{([\s\S]*?)\n\}/)?.[1]
    if (dramaBlock) {
      // 'key': 'value' 또는 "key": 'value' 형식 파싱
      const re = /["']([^"']+?)["']\s*:\s*["']([^"']+?)["']/g
      let m
      while ((m = re.exec(dramaBlock)) !== null) {
        map.set(m[1].toLowerCase().trim().replace(/\s+/g, ' '), m[2])
      }
    }
  } catch (e) {
    console.warn('[newsletter] korean-titles.js 파싱 실패:', (e as Error).message)
  }
  STATIC_KOREAN_TITLE_MAP = map
  return map
}

// 브랜드 컬러 팔레트
const C = {
  brand: '#FFC857',
  brandLight: '#FFE9B6',
  brandLighter: '#FFF3D1',
  brandBg: '#FFF8E7',
  brandDark: '#FF8C42',
  accent: '#F59E0B',
  accentDark: '#B45309',
  posGreen: '#10B981',
  negRed: '#EF4444',
  textPrimary: '#1F2937',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  bgCard: '#FAFAFA',
  border: '#F1F5F9',
  sourceReddit: '#FF4500',
  sourceMdl: '#5B7CFE',
  sourceYoutube: '#EF4444',
  sourceInstagram: '#E1306C',
  sourceGtrends: '#4285F4',
}

// 한국어 인사이트 카테고리 메타
const KR_INSIGHT_META: Record<string, { icon: string; label: string; color: string }> = {
  trend_summary:       { icon: '📈', label: '트렌드 요약',      color: '#3B82F6' },
  fan_reaction:        { icon: '💬', label: '팬 반응 특징',     color: C.accent },
  consumption_pattern: { icon: '🎬', label: '콘텐츠 소비 패턴',  color: '#8B5CF6' },
  expansion:           { icon: '🌏', label: '확장 흐름',         color: C.posGreen },
  subreddit:           { icon: '👥', label: '커뮤니티 특성',     color: '#EC4899' },
}

const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const pct = (n: number) => Math.round((n || 0) * 100)
const fmtViews = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)

// ── Korean title lookup — 정적 사전(korean-titles.js) + MDL nativeTitle + 동적 매핑 머지 ──
// dynamicMaps: server.ts에서 캐시(native-titles / upcoming-titles 등)에서 가져온 매핑들
function buildKoreanTitleLookup(mdl?: MdlSummary | null, dynamicMaps?: Record<string, string>[]): Map<string, string> {
  // 정적 사전을 base로 시작 (300+ 작품)
  const map = new Map(loadStaticKoreanTitleMap())
  // 동적 매핑 머지 (popular / upcoming) — 정적 사전 우선
  for (const dyn of (dynamicMaps || [])) {
    for (const [enTitle, koTitle] of Object.entries(dyn || {})) {
      const key = String(enTitle).toLowerCase().trim().replace(/\s+/g, ' ')
      if (!map.has(key)) map.set(key, koTitle)
    }
  }
  // MDL Top Airing nativeTitle (실시간 캐시) — 마지막 보충
  if (mdl?.dramas) {
    for (const d of mdl.dramas) {
      const t = d.drama?.title
      const nt = d.drama?.nativeTitle
      if (t && nt && nt !== t) {
        const key = t.toLowerCase().trim().replace(/\s+/g, ' ')
        if (!map.has(key)) map.set(key, nt)
      }
    }
  }
  return map
}
function lookupKoreanTitle(englishTitle: string, lookup: Map<string, string>): string | undefined {
  const key = englishTitle.toLowerCase().trim().replace(/\s+/g, ' ')
  return lookup.get(key)
}


// ── 메인 빌더 ──
export function buildNewsletterV2(opts: {
  report: any                    // Reddit report (필수)
  mdl?: MdlSummary | null
  youtube?: YoutubeSummary | null
  instagram?: InstagramSummary | null
  gtrends?: GTrendsSummary | null
  nativeTitleMap?: Record<string, string> | null   // /api/mdl/native-titles 캐시 (Popular TOP 50)
  upcomingTitleMap?: Record<string, string> | null // /api/mdl/upcoming-titles 캐시 (미방영 K-드라마)
  publicHost?: string            // 대시보드 link host (default localhost:3306)
}): string {
  const { report, mdl, youtube, instagram, gtrends, nativeTitleMap, upcomingTitleMap, publicHost = 'http://localhost:3306' } = opts
  const r = report
  const now = new Date(r.generatedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const koreanLookup = buildKoreanTitleLookup(mdl, [nativeTitleMap || {}, upcomingTitleMap || {}])

  // ── 데이터 추출 ──
  const topContents = (r.trends?.content?.topContents || []) as { title: string; count: number }[]
  const topActors = (r.trends?.content?.topActors || []) as { name: string; count: number }[]
  const koreanInsights = (r.koreanInsights || []) as { category: string; observation?: string; interpretation?: string; text?: string; evidence?: string[] }[]
  const deepAnalysis = (r.deepAnalysis || []) as any[]
  // K-콘텐츠 비율: report.topContents의 isKContent 비율 (대시보드 헤더와 동일)
  const allClusters = (r.topContents || []) as { isKContent?: boolean }[]
  const kCount = allClusters.filter((c) => c.isKContent).length
  const kRatio = allClusters.length > 0 ? kCount / allClusters.length : 0
  const sampleReddit = r.filterStats?.after || 0

  // ── 헤드라인용 소스별 TOP 1 (매트릭스 + 새 hero에서 사용) ──
  const redditTop1 = topContents[0]?.title || null
  const mdlTop1 = mdl?.dramas?.[0]?.drama?.title || null
  const igTop1 = instagram?.contentGroups?.find((g) => g.matchSource !== 'unknown')?.title || null
  const ytTop1 = (youtube as any)?.contentGroups?.[0]?.title || null

  // Instagram top reel (다른 섹션 참조)
  const igTopReel = instagram?.topReels?.[0]

  // ── 섹션별 HTML 빌더 ──

  // ① HEADER
  const headerHtml = `
  <tr>
    <td style="padding:28px 30px 22px;background:linear-gradient(135deg,${C.brand} 0%,${C.brandDark} 100%);color:${C.textPrimary}">
      <div style="font-size:13px;letter-spacing:2px;font-weight:700;color:#78350F">📊 K-CONTENT DAILY</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px;margin-top:6px;color:${C.textPrimary}">${esc(now)}</div>
      <div style="margin-top:14px;font-size:12.5px;color:#78350F;line-height:1.55;font-weight:500">
        표본: <strong>Reddit ${sampleReddit}</strong>
        ${mdl ? ` · <strong>MDL ${mdl.dramas?.length || 0}</strong>` : ''}
        ${youtube ? ` · <strong>YouTube ${youtube.totalVideos || 0}</strong>` : ''}
        ${instagram ? ` · <strong>Instagram ${instagram.totalReels || 0}</strong>` : ''}
        ${gtrends ? ` · <strong>GTrends ${gtrends.totalItems || 0}</strong>` : ''}
      </div>
    </td>
  </tr>`

  // 섹션 제목 (소제목) 공통 함수 — 이모지 제거 (2026-05-13)
  const sectionHeader = (_emoji: string, label: string, subtitle?: string) => `
    <div style="font-size:21px;font-weight:800;color:${C.accent};border-left:5px solid ${C.brand};padding-left:12px;margin-bottom:6px;line-height:1.25">${esc(label)}</div>
    <div style="height:3px;background:${C.brandLight};margin-bottom:${subtitle ? '10px' : '16px'}"></div>
    ${subtitle ? `<div style="font-size:12px;color:${C.textFaint};margin-bottom:14px">${esc(subtitle)}</div>` : ''}
  `

  // ② 소스별 TOP 1 — 한 줄 영문 작품명 (한국 원제는 아래 디테일 섹션에서 노출)
  const matrixRow = (color: string, source: string, value: string, _valueKo: string | null, meta: string, isMissing?: boolean) => `
    <tr ${isMissing ? '' : 'style="background:#FAFAFA"'}>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.border};width:88px;font-size:12px;line-height:1.4;white-space:nowrap">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle"></span>
        <strong style="color:${C.textMuted}">${esc(source)}</strong>
      </td>
      <td style="padding:9px 8px;border-bottom:1px solid ${C.border};font-size:12px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${isMissing ? `<span style="color:${C.textFaint};font-style:italic">${esc(value)}</span>` : `<strong>${esc(value)}</strong>`}</td>
      <td style="padding:9px 10px;border-bottom:1px solid ${C.border};text-align:right;color:${isMissing ? C.textFaint : C.textMuted};font-size:10.5px;line-height:1.4;white-space:nowrap">${esc(meta)}</td>
    </tr>`

  const matrixInner = `
    ${sectionHeader('📡', '소스별 TOP 1')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-size:13px;border:1px solid ${C.border};border-radius:6px;overflow:hidden">
      ${redditTop1 ? matrixRow(C.sourceReddit, 'Reddit', redditTop1, lookupKoreanTitle(redditTop1, koreanLookup) || null, `${topContents[0].count} mention`) : matrixRow(C.sourceReddit, 'Reddit', '데이터 없음', null, '-', true)}
      ${mdlTop1 && mdl ? matrixRow(C.sourceMdl, 'MDL', mdlTop1, lookupKoreanTitle(mdlTop1, koreanLookup) || null, `${mdl.dramas[0].drama.rating}/10 · 리뷰 ${mdl.dramas[0].drama.reviewCount || 0}`) : matrixRow(C.sourceMdl, 'MDL', '데이터 없음', null, '-', true)}
      ${ytTop1 && youtube ? matrixRow(C.sourceYoutube, 'YouTube', ytTop1, lookupKoreanTitle(ytTop1, koreanLookup) || null, `${fmtViews((youtube as any).contentGroups[0]?.totalViews || 0)} views`) : matrixRow(C.sourceYoutube, 'YouTube', '데이터 없음', null, '-', true)}
      ${igTop1 && instagram ? matrixRow(C.sourceInstagram, 'Instagram', igTop1, lookupKoreanTitle(igTop1, koreanLookup) || null, `Reel ${instagram.contentGroups[0]?.reelCount || 0} · ${instagram.contentGroups[0]?.dominantReaction?.label?.replace(/형$/, '') || ''} ${instagram.contentGroups[0]?.dominantReaction?.pct || ''}%`) : matrixRow(C.sourceInstagram, 'Instagram', '데이터 없음', null, '-', true)}
      ${gtrends && (gtrends as any).kItems?.length > 0 ? matrixRow(C.sourceGtrends, 'GTrends', (gtrends as any).kItems[0].title, null, '북미 진입') : matrixRow(C.sourceGtrends, 'GTrends', 'K-콘텐츠 매칭 0건', null, '오늘 비-K 주도', true)}
    </table>
  `

  // ④ 작품별 화제도 TOP 5
  const top5 = topContents.slice(0, 5)
  const maxCount = top5[0]?.count || 1
  const trendingInner = top5.length > 0 ? `
    ${sectionHeader('🏆', '작품별 화제도 TOP 5 (Reddit 기반)')}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:13px">
      ${top5.map((c, i) => {
        const rank = i + 1
        const widthPct = Math.max(8, Math.round((c.count / maxCount) * 100))
        const barColor = rank === 1 ? C.brand : rank === 2 ? C.brandLight : C.brandLighter
        return `
          <tr><td style="padding:9px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="180" style="font-weight:${rank === 1 ? '700' : rank <= 2 ? '600' : '500'};color:${rank === 1 ? C.textPrimary : '#374151'};font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">
                  <span style="color:${rank === 1 ? C.accent : C.textFaint};font-size:13px">${rank}</span>
                  &nbsp;${esc(c.title)}
                </td>
                <td>
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr><td style="background:${barColor};height:14px;border-radius:3px" width="${widthPct}%"></td><td></td></tr>
                  </table>
                </td>
                <td width="30" align="right" style="font-weight:${rank === 1 ? '800' : '600'};color:${rank === 1 ? C.accent : C.textMuted};font-size:12px;padding-left:6px">${c.count}</td>
              </tr>
            </table>
          </td></tr>`
      }).join('')}
    </table>
  ` : ''

  // ② + ③ 좌우 배치: 매트릭스 (왼쪽) | 작품별 화제도 (오른쪽)
  const matrixAndTrendingHtml = `
  <tr>
    <td style="padding:24px 30px 8px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td valign="top" width="48%" style="padding-right:14px">${matrixInner}</td>
          <td valign="top" width="52%" style="padding-left:14px">${trendingInner}</td>
        </tr>
      </table>
    </td>
  </tr>`

  // ⑤ Reddit TOP 3 토론 딥분석 — 댓글·토론 주제·한국어 번역 포함
  const deepTop3 = deepAnalysis.slice(0, 3)
  const redditDeepHtml = deepTop3.length > 0 ? `
  <tr>
    <td style="padding:24px 30px 8px">
      ${sectionHeader('🔍', 'Reddit TOP 3 토론 딥분석', '핵심 포스트 + 토론 주제 + 대표 댓글 (한국어 번역)')}
      ${deepTop3.map((d: any, i: number) => {
        const sent = d.sentiment || { positiveRatio: 0, negativeRatio: 0 }
        const debates = (d.commentDebates || []) as any[]
        const titleDisplay = d.titleKo || d.title || ''
        const titleOriginal = d.titleKo && d.titleKo !== d.title ? d.title : null
        const postUrl = d.url || `https://www.reddit.com/r/${d.subreddit || 'kdramas'}/comments/${d.postId || ''}`
        // 포스트 이미지 추출 (1) d.imageUrl 우선, (2) 없으면 topComments 본문에서 i.redd.it/preview.redd.it/imgur URL 추출
        let imageUrl: string | undefined = d.imageUrl
        if (!imageUrl) {
          for (const c of (d.topComments || [])) {
            const body = c?.body || ''
            const m = body.match(/https?:\/\/(?:i\.redd\.it|preview\.redd\.it|i\.imgur\.com)\/[^\s)\]]+/)
            if (m) { imageUrl = m[0].replace(/&amp;/g, '&'); break }
          }
        }
        // preview.redd.it URL은 너비 강제 (모바일 친화) — 600 미만 유지
        if (imageUrl && imageUrl.includes('preview.redd.it')) {
          imageUrl = imageUrl.replace(/width=\d+/, 'width=540')
        }
        // 가장 의미 있는 대표 댓글 2개: commentDebates의 representatives 중 한국어 번역 있는 것 우선
        type Rep = { body: string; bodyKo?: string; score?: number; topic?: string; sentiment?: string }
        const allReps: Rep[] = []
        for (const cd of debates) {
          for (const r of (cd.representatives || [])) {
            if (r.body && r.bodyKo) allReps.push({ ...r, topic: cd.topic })
          }
        }
        // score 내림차순, 중복 body 제거
        const seenBody = new Set<string>()
        const uniqReps = allReps
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .filter((r) => {
            const k = (r.body || '').slice(0, 60)
            if (seenBody.has(k)) return false
            seenBody.add(k)
            return true
          })
          .slice(0, 2)
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;background:${C.bgCard};border-radius:6px;border-left:3px solid ${C.brand}">
            <tr><td style="padding:13px 15px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${imageUrl ? `
                  <td width="112" valign="middle" style="padding-right:12px">
                    <a href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer">
                      <img src="${esc(imageUrl)}" alt="${esc((titleDisplay || '').slice(0, 80))}" width="100" style="display:block;width:100px;height:100px;object-fit:cover;border-radius:4px;border:1px solid ${C.border}">
                    </a>
                  </td>` : `
                  <td width="32" valign="middle" style="padding-right:8px">
                    <span style="font-weight:800;color:${i === 0 ? C.accent : C.textFaint};font-size:22px">${i + 1}</span>
                  </td>`}
                  <td valign="middle">
                    <div style="margin-bottom:4px">
                      <a href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:14px;font-weight:800;color:${C.textPrimary};line-height:1.4;text-decoration:none;border-bottom:1px dashed ${C.brandLight}">"${esc(titleDisplay)}" <span style="font-size:10.5px;color:${C.sourceReddit};font-weight:500">↗</span></a>
                    </div>
                    ${titleOriginal ? `<div style="font-size:11px;color:${C.textFaint};margin-bottom:5px;font-style:italic">↳ ${esc(titleOriginal)}</div>` : ''}
                    <div style="font-size:11px;color:${C.textMuted}">
                      r/${esc(d.subreddit || 'kdramas')} · ▲ ${(d.score || 0).toLocaleString()} · 댓글 ${d.commentCount || 0}
                      ${sent.positiveRatio > 0 ? ` · <span style="color:${C.posGreen};font-weight:600">긍정 ${pct(sent.positiveRatio)}%</span>` : ''}
                      ${sent.negativeRatio > 0.15 ? ` · <span style="color:${C.negRed};font-weight:600">부정 ${pct(sent.negativeRatio)}%</span>` : ''}
                    </div>
                  </td>
                </tr>
              </table>
              ${debates.length > 0 ? `
                <div style="margin-top:10px;margin-bottom:8px">
                  <div style="font-size:10.5px;color:${C.textMuted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:5px">🗣 토론 주제</div>
                  ${debates.slice(0, 3).map((cd: any) => `
                    <span style="display:inline-block;padding:3px 8px;background:rgba(255,69,0,0.10);color:${C.sourceReddit};font-size:10.5px;font-weight:600;border-radius:10px;margin-right:4px;margin-bottom:4px">
                      ${esc(cd.topic || '')} <span style="color:${C.textMuted};font-weight:500">· ${esc(cd.opinionDistribution?.mixedLabel || '')}</span>
                    </span>`).join('')}
                </div>` : ''}
              ${uniqReps.length > 0 ? `
                <div style="margin-top:8px">
                  <div style="font-size:10.5px;color:${C.textMuted};text-transform:uppercase;font-weight:700;letter-spacing:0.5px;margin-bottom:6px">💬 주요 의견</div>
                  ${uniqReps.map((r) => {
                    const sentEmoji = r.sentiment === 'positive' ? '👍' : r.sentiment === 'negative' ? '👎' : '·'
                    const sentColor = r.sentiment === 'positive' ? C.posGreen : r.sentiment === 'negative' ? C.negRed : C.textMuted
                    return `
                      <div style="font-size:12.5px;line-height:1.55;color:#374151;padding:8px 10px;background:rgba(255,69,0,0.04);border-left:2px solid ${sentColor};border-radius:4px;margin-bottom:5px">
                        <span style="margin-right:5px">${sentEmoji}</span>
                        "${esc(r.bodyKo || '')}"
                        ${r.score ? `<span style="float:right;color:${C.textFaint};font-size:10.5px">▲${r.score}</span>` : ''}
                        ${r.body && r.body !== r.bodyKo ? `<div style="font-size:10.5px;color:${C.textFaint};margin-top:3px;font-style:italic">↳ ${esc(r.body.slice(0, 130))}${r.body.length > 130 ? '...' : ''}</div>` : ''}
                      </div>`
                  }).join('')}
                </div>` : ''}
            </td></tr>
          </table>`
      }).join('')}
    </td>
  </tr>` : ''

  // ⑦ MDL 시청자 즉각 반응 (TOP 3)
  const mdlTop3 = mdl?.dramas?.slice(0, 3) || []
  const mdlHtml = mdlTop3.length > 0 ? `
  <tr>
    <td style="padding:24px 30px 8px">
      ${sectionHeader('📺', 'MDL 시청자 즉각 반응', 'Top Airing K-드라마 · 평점 + 리뷰 핫 코멘트')}
      ${mdlTop3.map((dr) => {
        const dd = dr.drama
        const reviewCount = dd.reviewCount || 0
        const reviewPosRatio = dr.reviewSentiment?.positiveRatio || 0
        const commentPosRatio = dr.commentInsights?.sentiment?.positiveRatio || 0
        const posRatio = commentPosRatio || reviewPosRatio
        // 시청자 즉각 반응 우선 — topLiked 첫 코멘트, 없으면 representativeReviews 첫 리뷰
        const topVisitor = dr.commentInsights?.topLiked?.[0]
        const topReview = dr.representativeReviews?.[0]
        const isPolarized = dr.polarized
        const topPraised = dr.reviewDebates?.find((d) => d.opinionDirection === 'positive')?.topic
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;background:${C.bgCard};border-radius:6px;border-left:3px solid ${C.brand}">
            <tr><td style="padding:13px 15px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${dd.posterUrl ? `
                  <td width="112" valign="middle" style="padding-right:12px">
                    <a href="${esc(dd.url)}" target="_blank" rel="noopener noreferrer">
                      <img src="${esc(dd.posterUrl)}" alt="${esc(dd.title)}" width="100" style="display:block;width:100px;height:auto;max-height:150px;object-fit:cover;border-radius:4px;border:1px solid ${C.border}">
                    </a>
                  </td>` : ''}
                  <td valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td>
                          <a href="${esc(dd.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;border-bottom:1px dashed ${C.brandLight}">
                            <span style="font-size:15.5px;font-weight:800;color:${C.textPrimary}">${esc(dd.title)}</span>
                            <span style="font-size:10.5px;color:${C.sourceMdl};font-weight:500;margin-left:3px">↗</span>
                          </a>
                          ${dd.nativeTitle && dd.nativeTitle !== dd.title ? `<span style="font-size:11.5px;color:${C.textFaint}"> (${esc(dd.nativeTitle)})</span>` : ''}
                          ${isPolarized ? `<span style="display:inline-block;padding:1px 6px;background:rgba(245,158,11,0.18);color:${C.accentDark};font-size:9.5px;font-weight:700;border-radius:8px;margin-left:5px">⚡ 평가 분열</span>` : ''}
                        </td>
                        <td align="right" style="font-size:12px;color:${C.brand};font-weight:800;white-space:nowrap;vertical-align:top">★ ${dd.rating}</td>
                      </tr>
                    </table>
                    <div style="font-size:11.5px;color:${C.textMuted};margin:5px 0 8px">
                      리뷰 ${reviewCount}건${posRatio > 0 ? ` · 긍정 ${pct(posRatio)}%` : ''}
                      ${topPraised ? ` · 가장 칭찬: <strong style="color:${C.posGreen}">${esc(topPraised)}</strong>` : ''}
                    </div>
              ${(() => {
                // topLiked 우선 2개, 없으면 representativeReviews 2개 (한국어 번역 있으면 우선 노출)
                const visitors = (dr.commentInsights?.topLiked || []).slice(0, 2)
                const reviews = (dr.representativeReviews || []).slice(0, 2)
                const candidates = visitors.length > 0 ? visitors : reviews
                if (candidates.length === 0) return ''
                return candidates.map((c: any) => {
                  const text = (c.bodyKo || c.body || '').slice(0, 150)
                  const more = (c.body || '').length > 150
                  const score = c.likes ?? c.helpful ?? 0
                  return `
                  <div style="font-size:12.5px;line-height:1.5;color:#374151;padding:7px 10px;background:rgba(91,124,254,0.06);border-radius:4px;margin-bottom:5px">
                    <span style="margin-right:5px">👍</span>
                    <span style="font-style:italic">"${esc(text)}${more ? '...' : ''}"</span>
                    ${score > 0 ? `<span style="float:right;color:${C.textFaint};font-size:10.5px">▲${score}</span>` : ''}
                  </div>`
                }).join('')
              })()}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>`
      }).join('')}
    </td>
  </tr>` : ''

  // ⑦ YouTube 작품별 화제도 TOP 3
  const ytGroups = ((youtube as any)?.contentGroups || []).slice(0, 3)
  const youtubeHtml = ytGroups.length > 0 ? `
  <tr>
    <td style="padding:24px 30px 8px">
      ${sectionHeader('▶️', 'YouTube 작품별 화제도 TOP 3', '대표 영상 + 좋아요 TOP 2 댓글 (한국어 번역)')}
      ${ytGroups.map((g: any) => {
        const ko = lookupKoreanTitle(g.title, koreanLookup)
        const topVideoUrl = g.topVideoId ? `https://www.youtube.com/watch?v=${g.topVideoId}` : '#'
        const topComments = (g.topComments || []).slice(0, 2)
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;background:${C.bgCard};border-radius:6px;border-left:3px solid ${C.brand}">
            <tr><td style="padding:13px 15px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${g.topVideoThumbnail ? `
                  <td width="112" valign="middle" style="padding-right:12px">
                    <a href="${esc(topVideoUrl)}" target="_blank" rel="noopener noreferrer">
                      <img src="${esc(g.topVideoThumbnail)}" alt="${esc(g.title)}" width="100" style="display:block;width:100px;height:56px;object-fit:cover;border-radius:4px;border:1px solid ${C.border}">
                    </a>
                  </td>` : ''}
                  <td valign="middle">
                    <div style="margin-bottom:3px">
                      <a href="${esc(topVideoUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;border-bottom:1px dashed ${C.brandLight}">
                        <span style="font-size:14px;font-weight:800;color:${C.textPrimary}">${esc(g.title)}</span>
                        <span style="font-size:10.5px;color:${C.sourceYoutube};font-weight:500;margin-left:3px">↗</span>
                      </a>
                      ${ko ? `<span style="font-size:11px;color:${C.textFaint}"> (${esc(ko)})</span>` : ''}
                    </div>
                    <div style="font-size:11px;color:${C.textMuted};margin-bottom:5px">
                      영상 ${g.videoCount || 0}개 · 👁 ${fmtViews(g.totalViews || 0)} · 👍 ${fmtViews(g.totalLikes || 0)} · 💬 ${fmtViews(g.totalComments || 0)}
                    </div>
                    ${g.topVideoTitle ? `
                      <div style="font-size:11px;color:${C.textMuted};margin-bottom:6px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">
                        ▸ <a href="${esc(topVideoUrl)}" target="_blank" rel="noopener noreferrer" style="color:${C.sourceYoutube};text-decoration:none;font-weight:600">${esc((g.topVideoTitle || '').slice(0, 80))}</a>
                      </div>` : ''}
                    ${topComments.length > 0 ? topComments.map((c: any) => {
                      const text = (c.textKo || c.text || '').slice(0, 120)
                      const more = (c.text || '').length > 120
                      return `
                        <div style="font-size:11.5px;line-height:1.5;color:#374151;padding:6px 9px;background:rgba(239,68,68,0.05);border-radius:4px;margin-bottom:4px">
                          <span style="margin-right:4px">💬</span>
                          <span style="font-style:italic">"${esc(text)}${more ? '...' : ''}"</span>
                          ${c.likes ? `<span style="float:right;color:${C.textFaint};font-size:10px">▲${c.likes}</span>` : ''}
                        </div>`
                    }).join('') : ''}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>`
      }).join('')}
    </td>
  </tr>` : ''

  // ⑧ Instagram Top 3 Reels 딥 분석
  const igTop3 = (instagram?.topReels || [])
    .filter((r) => (r.deepCommentTotalFetched || 0) > 0 || (r.reactionSummary || []).length > 0)
    .slice(0, 3)
  const instagramHtml = igTop3.length > 0 ? `
  <tr>
    <td style="padding:24px 30px 8px">
      ${sectionHeader('🎬', 'Instagram Top 3 Reels 딥 분석', '핵심·미세·특정 반응 + 대표 댓글 (한국어 번역)')}
      ${igTop3.map((r) => {
        const title = r.extractedTitle || '미확인 작품'
        const ko = lookupKoreanTitle(title, koreanLookup)
        const lines = (r.reactionSummary || []).slice(0, 3)
        const reps = ((r as any).representativeComments || []).slice(0, 2)
        // capturePath가 절대 URL이 아니면 publicHost prefix
        const captureUrl = r.capturePath
          ? (r.capturePath.startsWith('http') ? r.capturePath : `${publicHost}${r.capturePath}`)
          : null
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:10px;background:${C.bgCard};border-radius:6px;border-left:3px solid ${C.brand}">
            <tr><td style="padding:13px 15px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  ${captureUrl ? `
                  <td width="112" valign="middle" style="padding-right:12px">
                    <a href="${esc(r.url || '#')}" target="_blank" rel="noopener noreferrer">
                      <img src="${esc(captureUrl)}" alt="${esc(title)}" width="100" style="display:block;width:100px;height:150px;object-fit:cover;border-radius:4px;border:1px solid ${C.border}">
                    </a>
                  </td>` : ''}
                  <td valign="middle">
                    <div style="margin-bottom:3px">
                      <a href="${esc(r.url || '#')}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:inherit;border-bottom:1px dashed ${C.brandLight}">
                        <span style="font-size:14px;font-weight:800;color:${C.textPrimary}">${esc(title)}</span>
                        <span style="font-size:10.5px;color:${C.sourceInstagram};font-weight:500;margin-left:3px">↗</span>
                      </a>
                      ${ko ? `<span style="font-size:11px;color:${C.textFaint}"> (${esc(ko)})</span>` : ''}
                    </div>
                    <div style="font-size:11px;color:${C.textMuted};margin-bottom:7px">
                      ❤ ${fmtViews(r.likeCount || 0)} · 💬 ${fmtViews(r.commentCount || 0)} · 딥 분석 ${r.deepCommentTotalFetched || 0}건
                    </div>
              ${lines.length > 0 ? `
                <div style="margin-bottom:7px">
                  ${lines.map((line) => {
                    const m = /^(핵심 반응|미세 신호|특정 표현)\s*—\s*(.+)$/.exec(line)
                    if (m) {
                      return `<div style="font-size:11.5px;line-height:1.5;color:#374151;padding-left:9px;border-left:2px solid rgba(225,48,108,0.35);margin-bottom:4px"><strong style="color:${C.textPrimary}">${esc(m[1])} —</strong> ${esc(m[2])}</div>`
                    }
                    return `<div style="font-size:11.5px;line-height:1.5;color:${C.textMuted};padding-left:9px;border-left:2px solid #E5E7EB;margin-bottom:4px">${esc(line)}</div>`
                  }).join('')}
                </div>` : ''}
              ${reps.length > 0 ? reps.map((c: any) => {
                const text = (c.textKo || c.text || '').slice(0, 120)
                const more = (c.text || '').length > 120
                return `
                  <div style="font-size:11.5px;line-height:1.5;color:#374151;padding:6px 9px;background:rgba(225,48,108,0.05);border-radius:4px;margin-bottom:4px">
                    <span style="margin-right:4px">💬</span>
                    <span style="font-style:italic">"${esc(text)}${more ? '...' : ''}"</span>
                    ${c.approxLikes ? `<span style="float:right;color:${C.textFaint};font-size:10px">♥${c.approxLikes}</span>` : ''}
                  </div>`
              }).join('') : ''}
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>`
      }).join('')}
    </td>
  </tr>` : ''

  // ⑨ FOOTER
  const footerHtml = `
  <tr>
    <td style="padding:24px 30px 28px;background:${C.brandBg};border-top:2px solid ${C.brandLight}">
      <div style="font-size:11.5px;color:#92400E;line-height:1.65">
        <strong>데이터 출처</strong>: Reddit r/kdramas·r/kdrama·r/kdramarecommends·r/korean · MyDramaList Top Airing · YouTube Innertube · Instagram Reels · Google Trends US/CA
        <br>
        <strong>수집 정책</strong>: K-콘텐츠 마커 자동 필터 (비-K 드라마/지역 분점 차단) · 60일 이내 영상 · 댓글 합산 분석
      </div>
      <div style="margin-top:18px;text-align:center">
        <a href="${esc(publicHost)}" style="display:inline-block;padding:11px 22px;background:${C.brand};color:${C.textPrimary};text-decoration:none;font-size:13px;font-weight:800;border-radius:6px;box-shadow:0 2px 4px rgba(255,200,87,0.4)">→ 전체 대시보드 보기</a>
      </div>
      <div style="margin-top:14px;text-align:center;font-size:11px;color:${C.textFaint}">
        <a href="#" style="color:${C.textFaint};text-decoration:underline">구독 해지</a> · <a href="#" style="color:${C.textFaint};text-decoration:underline">설정 변경</a>
      </div>
    </td>
  </tr>`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>K-Content Daily · ${esc(now)}</title>
</head>
<body style="margin:0;padding:24px 0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:${C.textPrimary}">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" width="800" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.07)">
    ${headerHtml}
    ${matrixAndTrendingHtml}
    ${redditDeepHtml}
    ${mdlHtml}
    ${youtubeHtml}
    ${instagramHtml}
    ${footerHtml}
  </table>
  <div style="text-align:center;font-size:11px;color:${C.textFaint};margin-top:20px">© 2026 K-Content Intelligence · 매일 09:30 KST 자동 발송</div>
</body>
</html>`
}
