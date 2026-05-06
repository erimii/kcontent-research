// ============================================================
// MDL 리뷰 본문 한국어 번역 후처리
// crawlMdlTopAiring + analyzeMdlDramas 후 server.ts에서 호출
// ============================================================

import type { MdlSummary, MdlDramaAnalysis, MdlDrama } from '../types/index.js'
import { translateBatch } from '../lib/translate.js'

// ── analyze 후 summary.dramas[].representativeReviews 번역 ──
export async function translateMdlSummaryInPlace(summary: MdlSummary): Promise<void> {
  if (!summary?.dramas?.length) return

  const items: { dramaIdx: number; reviewIdx: number; text: string }[] = []
  for (let di = 0; di < summary.dramas.length; di++) {
    const reps = summary.dramas[di].representativeReviews || []
    for (let ri = 0; ri < reps.length; ri++) {
      if (reps[ri]?.body) items.push({ dramaIdx: di, reviewIdx: ri, text: reps[ri].body })
    }
  }

  if (items.length === 0) return
  console.log(`  [translate] MDL representativeReviews ${items.length}개 번역 시작...`)
  const t0 = Date.now()
  const translations = await translateBatch(items.map((i) => i.text))
  const success = translations.filter((t) => t).length
  console.log(`  [translate] ${success}/${items.length}개 번역 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

  for (let i = 0; i < items.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const it = items[i]
    const rev = summary.dramas[it.dramaIdx]?.representativeReviews?.[it.reviewIdx]
    if (rev) rev.bodyKo = ko
  }

  // ── commentInsights.topLiked도 번역 ──
  const cItems: { dramaIdx: number; cmtIdx: number; text: string }[] = []
  for (let di = 0; di < summary.dramas.length; di++) {
    const top = summary.dramas[di].commentInsights?.topLiked || []
    for (let ci = 0; ci < top.length; ci++) {
      if (top[ci]?.body) cItems.push({ dramaIdx: di, cmtIdx: ci, text: top[ci].body })
    }
  }
  if (cItems.length === 0) return
  console.log(`  [translate] MDL topLiked comments ${cItems.length}개 번역 시작...`)
  const t1 = Date.now()
  const cTrans = await translateBatch(cItems.map((i) => i.text))
  const cSuccess = cTrans.filter((t) => t).length
  console.log(`  [translate] ${cSuccess}/${cItems.length}개 코멘트 번역 완료 (${((Date.now() - t1) / 1000).toFixed(1)}s)`)
  for (let i = 0; i < cItems.length; i++) {
    const ko = cTrans[i]
    if (!ko) continue
    const it = cItems[i]
    const cmt = summary.dramas[it.dramaIdx]?.commentInsights?.topLiked?.[it.cmtIdx]
    if (cmt) cmt.bodyKo = ko
  }
}

// ── 크롤 후 raw dramas[].reviews[]도 번역 (analyze 전) ──
export async function translateMdlRawReviewsInPlace(dramas: MdlDrama[]): Promise<void> {
  if (!dramas?.length) return
  const items: { dramaIdx: number; reviewIdx: number; text: string }[] = []
  for (let di = 0; di < dramas.length; di++) {
    const reviews = dramas[di].reviews || []
    for (let ri = 0; ri < reviews.length; ri++) {
      if (reviews[ri]?.body) items.push({ dramaIdx: di, reviewIdx: ri, text: reviews[ri].body })
    }
  }
  if (items.length === 0) return
  console.log(`  [translate] MDL raw reviews ${items.length}개 번역 시작...`)
  const t0 = Date.now()
  const translations = await translateBatch(items.map((i) => i.text))
  const success = translations.filter((t) => t).length
  console.log(`  [translate] ${success}/${items.length}개 번역 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

  for (let i = 0; i < items.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const it = items[i]
    const rev = dramas[it.dramaIdx]?.reviews?.[it.reviewIdx]
    if (rev) rev.bodyKo = ko
  }
}
