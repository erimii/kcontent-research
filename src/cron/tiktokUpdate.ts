// ============================================================
// Cron #2: Update — 30분마다 DB 영상의 댓글·stats 갱신
// 영상 URL 기반 GetVideoComments 호출 — Search보다 안정적
// ============================================================

import fs from 'fs'
import os from 'os'
import path from 'path'
import { getStaleTiktokVideos, updateTiktokVideoStats, setCronLog } from '../db/tiktokVideos.js'
import type { TikTokComment } from '../types/index.js'

let isRunning = false
const COOKIE_PATH = path.join(os.homedir(), 'Desktop/secret/001/tiktok-cookies.json')

function loadCookies(): { name: string; value: string }[] | null {
  try {
    if (!fs.existsSync(COOKIE_PATH)) return null
    const arr = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    return arr.filter((c: any) => c.name && c.value)
  } catch {
    return null
  }
}

const PER_REQUEST_TIMEOUT_MS = 12000
const CONCURRENCY = 3
const COMMENT_LIMIT = 20
const MAX_VIDEOS_PER_RUN = 30  // 한 번에 갱신할 영상 수 (30분 내 마무리 목표)

export async function runTiktokUpdate(): Promise<{ ok: boolean; refreshed: number; failed: number; durationSec: number; error?: string }> {
  if (isRunning) {
    console.log('[TikTok cron] Update 이미 실행 중 — skip')
    return { ok: false, refreshed: 0, failed: 0, durationSec: 0, error: 'already-running' }
  }
  isRunning = true
  const t0 = Date.now()

  try {
    const cookies = loadCookies()
    if (!cookies) {
      console.warn('[TikTok cron] Update — 쿠키 없음, skip')
      setCronLog('update', 'failed', { error: 'no-cookies' })
      return { ok: false, refreshed: 0, failed: 0, durationSec: 0, error: 'no-cookies' }
    }

    // 가장 오래된 last_updated_at 순으로 N개 선택 (round-robin 효과)
    const stale = getStaleTiktokVideos(MAX_VIDEOS_PER_RUN)
    if (stale.length === 0) {
      console.log('[TikTok cron] Update — DB 비어있어 skip')
      setCronLog('update', 'success', { refreshed: 0, total: 0 })
      return { ok: true, refreshed: 0, failed: 0, durationSec: 0 }
    }
    console.log(`[TikTok cron] Update 시작 — ${stale.length}개 영상 댓글·stats 갱신`)

    const ttPkg: any = await import('@tobyg74/tiktok-api-dl')
    const TT = ttPkg.default || ttPkg
    const GetVideoComments = TT.GetVideoComments

    const now = Math.floor(Date.now() / 1000)
    let refreshed = 0
    let failed = 0

    for (let i = 0; i < stale.length; i += CONCURRENCY) {
      const slice = stale.slice(i, i + CONCURRENCY)
      const settled = await Promise.allSettled(
        slice.map(async (v) => {
          try {
            const p = GetVideoComments(v.url, { cookie: cookies, commentLimit: COMMENT_LIMIT })
            const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), PER_REQUEST_TIMEOUT_MS))
            const r: any = await Promise.race([p, t])
            const list: any[] = r?.result || r?.comments || []
            const comments: TikTokComment[] = []
            for (const c of list) {
              const text = c.text || c.content || c.comment_text || ''
              if (!text || text.length < 4) continue
              comments.push({
                text: String(text).slice(0, 800),
                author: c.user?.uniqueId || c.user?.nickname || c.author?.uniqueId || c.author?.nickname || 'anon',
                likes: c.diggCount || c.digg_count || c.likes || 0,
              })
              if (comments.length >= COMMENT_LIMIT) break
            }
            // GetVideoComments에는 영상 메타 stats가 보통 없음 — 댓글만 갱신
            updateTiktokVideoStats(v.id, { comments }, now)
            return true
          } catch {
            // 실패해도 last_updated_at 업데이트해서 다음 차례로 밀림 방지
            updateTiktokVideoStats(v.id, {}, now)
            return false
          }
        })
      )
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value) refreshed++
        else failed++
      }
      // batch 간 짧은 sleep
      if (i + CONCURRENCY < stale.length) await new Promise((r) => setTimeout(r, 600))
    }

    const durationSec = (Date.now() - t0) / 1000
    console.log(`[TikTok cron] Update 완료 — 댓글 갱신 성공 ${refreshed}, 실패 ${failed} (${durationSec.toFixed(1)}s)`)
    setCronLog('update', 'success', { refreshed, failed, durationSec })
    return { ok: true, refreshed, failed, durationSec }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[TikTok cron] Update 실패: ${msg}`)
    setCronLog('update', 'failed', { error: msg })
    return { ok: false, refreshed: 0, failed: 0, durationSec: (Date.now() - t0) / 1000, error: msg }
  } finally {
    isRunning = false
  }
}
