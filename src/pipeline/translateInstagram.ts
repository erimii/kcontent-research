// ============================================================
// Instagram 댓글 한국어 번역 후처리
//   * content group의 topComments
//   * summary.topComments
//   * 각 reel의 comments (fallback 휴리스틱)
//   * Top 3 reel의 deepComments + representativeComments (2026-05-08 #4)
//   * fallback 댓글(이미 한국어 안내문)은 skip
// ============================================================

import type { InstagramSummary } from '../types/index.js'
import { translateBatch } from '../lib/translate.js'

const FALLBACK_AUTHOR = 'instagram_reel'

export async function translateInstagramSummaryInPlace(summary: InstagramSummary): Promise<void> {
  const texts: string[] = []
  type Slot =
    | { kind: 'group'; gIdx: number; cIdx: number }
    | { kind: 'top'; tIdx: number }
    | { kind: 'reel'; rIdx: number; cIdx: number }
    | { kind: 'deep'; rIdx: number; cIdx: number }
    | { kind: 'rep';  rIdx: number; cIdx: number }
  const slots: Slot[] = []

  // group topComments
  for (let g = 0; g < (summary.contentGroups || []).length; g++) {
    const grp = summary.contentGroups[g]
    for (let c = 0; c < (grp.topComments || []).length; c++) {
      const cm = grp.topComments[c]
      if (cm.author === FALLBACK_AUTHOR || !cm.text) continue
      texts.push(cm.text)
      slots.push({ kind: 'group', gIdx: g, cIdx: c })
    }
  }
  // summary.topComments
  for (let t = 0; t < (summary.topComments || []).length; t++) {
    const cm = summary.topComments[t]
    if (cm.author === FALLBACK_AUTHOR || !cm.text) continue
    texts.push(cm.text)
    slots.push({ kind: 'top', tIdx: t })
  }
  // 각 reel의 휴리스틱 comments + deep + representative
  for (let r = 0; r < (summary.topReels || []).length; r++) {
    const reel = summary.topReels[r]
    for (let c = 0; c < (reel.comments || []).length; c++) {
      const cm = reel.comments[c]
      if (cm.author === FALLBACK_AUTHOR || !cm.text) continue
      texts.push(cm.text)
      slots.push({ kind: 'reel', rIdx: r, cIdx: c })
    }
    for (let c = 0; c < (reel.deepComments || []).length; c++) {
      const cm = reel.deepComments![c]
      if (cm.author === FALLBACK_AUTHOR || !cm.text) continue
      texts.push(cm.text)
      slots.push({ kind: 'deep', rIdx: r, cIdx: c })
    }
    for (let c = 0; c < (reel.representativeComments || []).length; c++) {
      const cm = reel.representativeComments![c]
      if (cm.author === FALLBACK_AUTHOR || !cm.text) continue
      texts.push(cm.text)
      slots.push({ kind: 'rep', rIdx: r, cIdx: c })
    }
  }

  if (texts.length === 0) return
  console.log(`  [translate] Instagram ${texts.length}개 댓글 번역 시작…`)
  const start = Date.now()
  const translations = await translateBatch(texts)
  const ok = translations.filter((t) => t).length
  console.log(`  [translate] ${ok}/${texts.length}개 번역 완료 (${((Date.now() - start) / 1000).toFixed(1)}s)`)

  for (let i = 0; i < slots.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const slot = slots[i]
    if (slot.kind === 'group') {
      const cm = summary.contentGroups[slot.gIdx]?.topComments?.[slot.cIdx]
      if (cm) cm.textKo = ko
    } else if (slot.kind === 'top') {
      const cm = summary.topComments[slot.tIdx]
      if (cm) cm.textKo = ko
    } else if (slot.kind === 'reel') {
      const cm = summary.topReels[slot.rIdx]?.comments?.[slot.cIdx]
      if (cm) cm.textKo = ko
    } else if (slot.kind === 'deep') {
      const cm = summary.topReels[slot.rIdx]?.deepComments?.[slot.cIdx]
      if (cm) cm.textKo = ko
    } else if (slot.kind === 'rep') {
      const cm = summary.topReels[slot.rIdx]?.representativeComments?.[slot.cIdx]
      if (cm) cm.textKo = ko
    }
  }
}
