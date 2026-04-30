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
