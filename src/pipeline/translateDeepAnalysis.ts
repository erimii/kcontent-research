// ============================================================
// DeepAnalysis 댓글·제목 한국어 번역 후처리
// runPipeline()이 완료된 후 server.ts에서 호출 (async, fire-and-cache)
// ============================================================

import type { DeepAnalysis } from '../types/index.js'
import { translateBatch } from '../lib/translate.js'

export async function translateDeepAnalysisInPlace(deepAnalysis: DeepAnalysis[]): Promise<void> {
  if (!deepAnalysis || deepAnalysis.length === 0) return

  // 번역 대상 수집: 제목 + 화면에 표시되는 commentDebates representatives
  const items: { kind: 'title' | 'rep'; postIdx: number; idx?: number; debateIdx?: number; text: string }[] = []

  for (let pi = 0; pi < deepAnalysis.length; pi++) {
    const d = deepAnalysis[pi]
    if (d.title) items.push({ kind: 'title', postIdx: pi, text: d.title })

    for (let bi = 0; bi < (d.commentDebates || []).length; bi++) {
      const reps = d.commentDebates[bi].representatives || []
      for (let ri = 0; ri < reps.length; ri++) {
        if (reps[ri]?.body) items.push({ kind: 'rep', postIdx: pi, idx: ri, debateIdx: bi, text: reps[ri].body })
      }
    }
  }

  if (items.length === 0) return
  console.log(`  [translate] DeepAnalysis ${items.length}개 텍스트 번역 시작...`)
  const start = Date.now()
  const translations = await translateBatch(items.map((i) => i.text))
  const successCount = translations.filter((t) => t).length
  console.log(`  [translate] ${successCount}/${items.length}개 번역 완료 (${((Date.now() - start) / 1000).toFixed(1)}s)`)

  // mutate deepAnalysis in place
  for (let i = 0; i < items.length; i++) {
    const ko = translations[i]
    if (!ko) continue
    const it = items[i]
    const d = deepAnalysis[it.postIdx]
    if (it.kind === 'title') {
      d.titleKo = ko
    } else if (it.kind === 'rep' && typeof it.idx === 'number' && typeof it.debateIdx === 'number') {
      const r = d.commentDebates[it.debateIdx]?.representatives?.[it.idx]
      if (r) r.bodyKo = ko
    }
  }
}
