// ============================================================
// Cron #3: Cleanup — 매일 새벽 3시 30일 초과 영상 자동 삭제 + VACUUM
// ============================================================

import { db } from '../db.js'
import { deleteOldTiktokVideos, setCronLog } from '../db/tiktokVideos.js'

export async function runTiktokCleanup(): Promise<{ ok: boolean; deleted: number }> {
  const t0 = Date.now()
  console.log('[TikTok cron] Cleanup 시작')
  try {
    const deleted = deleteOldTiktokVideos(30)
    if (deleted > 0) {
      try {
        db.prepare('VACUUM').run()
      } catch (e) {
        console.warn(`[TikTok cron] VACUUM 실패: ${(e as Error).message}`)
      }
    }
    const durationSec = (Date.now() - t0) / 1000
    console.log(`[TikTok cron] Cleanup 완료 — 삭제 ${deleted}개 (${durationSec.toFixed(1)}s)`)
    setCronLog('cleanup', 'success', { deleted, durationSec })
    return { ok: true, deleted }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[TikTok cron] Cleanup 실패: ${msg}`)
    setCronLog('cleanup', 'failed', { error: msg })
    return { ok: false, deleted: 0 }
  }
}
