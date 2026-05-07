// ============================================================
// YouTube 댓글 한국어 번역 후처리
// buildYoutubeSummary 완료 후 server.ts에서 호출 (cache 저장 전)
// ============================================================

import type { YoutubeSummary } from '../types/index.js'
import { translateBatch } from '../lib/translate.js'

export async function translateYoutubeSummaryInPlace(summary: YoutubeSummary): Promise<void> {
  // 번역 대상: contentGroups[*].topComments[] + contentGroups[*].discussionHotspot
  //           + contentGroups[*].quotedPhrases + topComments[]
  // 동일 텍스트는 dedup (cache로 자동 처리되긴 하지만 입력 줄여 비용·지연 절감)
  const texts: string[] = []
  const slots: {
    kind: 'group-top' | 'top' | 'group-hotspot' | 'group-phrase';
    gIdx?: number;
    cIdx?: number;
    pIdx?: number;
  }[] = []

  // 1) 작품별 화제도 카드 안의 댓글 (좋아요 TOP)
  for (let g = 0; g < (summary.contentGroups || []).length; g++) {
    const group = summary.contentGroups[g]
    for (let c = 0; c < (group.topComments || []).length; c++) {
      const cm = group.topComments[c]
      if (cm.text) {
        texts.push(cm.text)
        slots.push({ kind: 'group-top', gIdx: g, cIdx: c })
      }
    }
    // 토론 핫스팟
    if (group.discussionHotspot?.text) {
      texts.push(group.discussionHotspot.text)
      slots.push({ kind: 'group-hotspot', gIdx: g })
    }
    // 자주 인용·반복 phrase
    for (let p = 0; p < (group.quotedPhrases || []).length; p++) {
      const qp = group.quotedPhrases[p]
      if (qp.phrase) {
        texts.push(qp.phrase)
        slots.push({ kind: 'group-phrase', gIdx: g, pIdx: p })
      }
    }
  }
  // 2) 댓글 TOP 10
  for (let c = 0; c < (summary.topComments || []).length; c++) {
    const cm = summary.topComments[c]
    if (cm.text) {
      texts.push(cm.text)
      slots.push({ kind: 'top', cIdx: c })
    }
  }

  if (texts.length === 0) return
  console.log(`  [translate] YouTube ${texts.length}개 텍스트 번역 시작 (댓글 + 핫스팟 + 명대사)...`)
  const start = Date.now()
  const translations = await translateBatch(texts)
  const successCount = translations.filter((t) => t).length
  console.log(`  [translate] ${successCount}/${texts.length}개 번역 완료 (${((Date.now() - start) / 1000).toFixed(1)}s)`)

  for (let i = 0; i < slots.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const slot = slots[i]
    if (slot.kind === 'group-top' && typeof slot.gIdx === 'number' && typeof slot.cIdx === 'number') {
      const cm = summary.contentGroups[slot.gIdx]?.topComments?.[slot.cIdx]
      if (cm) cm.textKo = ko
    } else if (slot.kind === 'group-hotspot' && typeof slot.gIdx === 'number') {
      const h = summary.contentGroups[slot.gIdx]?.discussionHotspot
      if (h) h.textKo = ko
    } else if (slot.kind === 'group-phrase' && typeof slot.gIdx === 'number' && typeof slot.pIdx === 'number') {
      const qp = summary.contentGroups[slot.gIdx]?.quotedPhrases?.[slot.pIdx]
      if (qp) qp.phraseKo = ko
    } else if (slot.kind === 'top' && typeof slot.cIdx === 'number') {
      const cm = summary.topComments[slot.cIdx]
      if (cm) cm.textKo = ko
    }
  }
}
