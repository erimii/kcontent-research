// ============================================================
// Known K-drama Title Pattern Builder
// - 정적 사전(KNOWN_DRAMAS_STATIC) + extraKnownTitles(MDL Top Airing 등 동적) 합집합
// - 캡처 그룹 1번이 매칭 텍스트 — trends.ts가 m[1] 사용
// - 둘 다 비면 null 반환 → 사전 매칭 분기 skip
// ============================================================

import { KNOWN_DRAMAS_STATIC } from './known-dramas-static.js'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildKnownDramaPattern(extraKnownTitles: string[] = []): RegExp | null {
  // 정적 사전 + 동적 사전 합집합 (lowercase dedup)
  const seen = new Set<string>()
  const titles: string[] = []
  for (const t of [...KNOWN_DRAMAS_STATIC, ...extraKnownTitles]) {
    const trimmed = t.trim()
    if (trimmed.length < 2) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    titles.push(trimmed)
  }
  if (titles.length === 0) return null
  // 긴 제목 우선 매칭 (예: "all of us are dead 2" 가 "all of us are dead" 보다 먼저)
  titles.sort((a, b) => b.length - a.length)
  const alt = titles.map(escapeRegex).join('|')
  return new RegExp(`\\b(${alt})\\b`, 'gi')
}
