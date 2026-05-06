// ============================================================
// TikTok 댓글 한국어 번역 후처리 (작품별 카드만 — cost 절감)
// ============================================================

import type { TikTokSummary } from '../types/index.js'
import { translateBatch } from '../lib/translate.js'

export async function translateTiktokSummaryInPlace(summary: TikTokSummary): Promise<void> {
  const texts: string[] = []
  const slots: { gIdx: number; cIdx: number }[] = []

  for (let g = 0; g < (summary.contentGroups || []).length; g++) {
    const group = summary.contentGroups[g]
    for (let c = 0; c < (group.topComments || []).length; c++) {
      const cm = group.topComments[c]
      if (cm.text) {
        texts.push(cm.text)
        slots.push({ gIdx: g, cIdx: c })
      }
    }
  }

  if (texts.length === 0) return
  console.log(`  [translate] TikTok ${texts.length}개 댓글 번역 시작...`)
  const start = Date.now()
  const translations = await translateBatch(texts)
  const successCount = translations.filter((t) => t).length
  console.log(`  [translate] ${successCount}/${texts.length}개 번역 완료 (${((Date.now() - start) / 1000).toFixed(1)}s)`)

  for (let i = 0; i < slots.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const cm = summary.contentGroups[slots[i].gIdx]?.topComments?.[slots[i].cIdx]
    if (cm) cm.textKo = ko
  }
}
