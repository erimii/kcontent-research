// ============================================================
// Cron #1: Discovery — 6시간마다 키워드 검색 + 새 영상 DB INSERT
// ============================================================

import { crawlTiktokBuzz } from '../crawlers/tiktok.js'
import { upsertTiktokVideo, setCronLog, countTiktokVideos } from '../db/tiktokVideos.js'

let isRunning = false  // 동시 실행 방지

export async function runTiktokDiscovery(): Promise<{ ok: boolean; inserted: number; updated: number; total: number; durationSec: number; error?: string }> {
  if (isRunning) {
    console.log('[TikTok cron] Discovery 이미 실행 중 — skip')
    return { ok: false, inserted: 0, updated: 0, total: 0, durationSec: 0, error: 'already-running' }
  }
  isRunning = true
  const t0 = Date.now()
  console.log('[TikTok cron] Discovery 시작')
  try {
    const { videos } = await crawlTiktokBuzz({ topN: 30, commentsPerVideo: 20 })
    let inserted = 0
    let updated = 0
    const now = Math.floor(Date.now() / 1000)
    for (const v of videos) {
      try {
        const r = upsertTiktokVideo(v, now)
        if (r === 'inserted') inserted++; else updated++
      } catch (e) {
        console.warn(`[TikTok cron] upsert 실패 ${v.id}: ${(e as Error).message}`)
      }
    }
    const total = countTiktokVideos(30)
    const durationSec = (Date.now() - t0) / 1000
    console.log(`[TikTok cron] Discovery 완료 — INSERT ${inserted}, UPDATE ${updated}, DB 총 ${total}개 (${durationSec.toFixed(1)}s)`)
    setCronLog('discovery', 'success', { inserted, updated, total, durationSec })
    return { ok: true, inserted, updated, total, durationSec }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[TikTok cron] Discovery 실패: ${msg}`)
    setCronLog('discovery', 'failed', { error: msg })
    return { ok: false, inserted: 0, updated: 0, total: 0, durationSec: (Date.now() - t0) / 1000, error: msg }
  } finally {
    isRunning = false
  }
}
