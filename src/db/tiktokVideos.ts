// ============================================================
// TikTok 영상 DB CRUD
// cron 백그라운드 누적 + /api/tiktok 라우트 SELECT 용
// ============================================================

import { db } from '../db.js'
import type { TikTokVideo, TikTokAuthor, TikTokSound, TikTokComment, TikTokChannelType } from '../types/index.js'

// DB row → TikTokVideo 변환
function rowToVideo(r: any): TikTokVideo {
  const author: TikTokAuthor = {
    id: r.author_id || '',
    uniqueId: r.author_unique_id || '',
    nickname: r.author_nickname || '',
    avatar: r.author_avatar || undefined,
    verified: r.author_verified === 1,
    followerCount: r.author_follower_count || undefined,
    signature: r.author_signature || '',
  }
  const sound: TikTokSound | undefined = r.sound_id ? {
    id: r.sound_id,
    title: r.sound_title || '',
    authorName: r.sound_author || '',
    duration: r.sound_duration || undefined,
    original: r.sound_original === 1,
    cover: r.sound_cover || undefined,
  } : undefined
  const comments: TikTokComment[] = r.comments_json ? JSON.parse(r.comments_json) : []
  const hashtags: string[] = r.hashtags_json ? JSON.parse(r.hashtags_json) : []
  return {
    id: r.id,
    description: r.description || '',
    url: r.url,
    cover: r.cover || undefined,
    duration: r.duration || 0,
    views: r.views || 0,
    likes: r.likes || 0,
    shares: r.shares || 0,
    commentCount: r.comment_count || 0,
    saved: r.saved || 0,
    publishedAt: r.published_at || '',
    author,
    sound,
    comments,
    hashtags,
    channelType: (r.channel_type || 'community') as TikTokChannelType,
  }
}

const UPSERT_SQL = `
  INSERT INTO tiktok_videos (
    id, description, url, cover, duration,
    views, likes, shares, comment_count, saved,
    published_at, create_time,
    author_id, author_unique_id, author_nickname, author_avatar,
    author_verified, author_signature, author_follower_count,
    sound_id, sound_title, sound_author, sound_cover, sound_duration, sound_original,
    comments_json, hashtags_json, channel_type,
    first_seen_at, last_updated_at
  ) VALUES (
    @id, @description, @url, @cover, @duration,
    @views, @likes, @shares, @comment_count, @saved,
    @published_at, @create_time,
    @author_id, @author_unique_id, @author_nickname, @author_avatar,
    @author_verified, @author_signature, @author_follower_count,
    @sound_id, @sound_title, @sound_author, @sound_cover, @sound_duration, @sound_original,
    @comments_json, @hashtags_json, @channel_type,
    @first_seen_at, @last_updated_at
  )
  ON CONFLICT(id) DO UPDATE SET
    description = excluded.description,
    cover = excluded.cover,
    duration = excluded.duration,
    views = excluded.views,
    likes = excluded.likes,
    shares = excluded.shares,
    comment_count = excluded.comment_count,
    saved = excluded.saved,
    author_nickname = excluded.author_nickname,
    author_avatar = excluded.author_avatar,
    author_verified = excluded.author_verified,
    author_signature = excluded.author_signature,
    author_follower_count = excluded.author_follower_count,
    sound_id = excluded.sound_id,
    sound_title = excluded.sound_title,
    sound_author = excluded.sound_author,
    sound_cover = excluded.sound_cover,
    sound_duration = excluded.sound_duration,
    sound_original = excluded.sound_original,
    comments_json = excluded.comments_json,
    hashtags_json = excluded.hashtags_json,
    channel_type = excluded.channel_type,
    last_updated_at = excluded.last_updated_at
`

export function upsertTiktokVideo(v: TikTokVideo, nowSec: number): 'inserted' | 'updated' {
  const existed = db.prepare('SELECT 1 FROM tiktok_videos WHERE id = ?').get(v.id)
  const params = {
    id: v.id,
    description: v.description || '',
    url: v.url,
    cover: v.cover || null,
    duration: v.duration || 0,
    views: v.views || 0,
    likes: v.likes || 0,
    shares: v.shares || 0,
    comment_count: v.commentCount || 0,
    saved: v.saved || 0,
    published_at: v.publishedAt || null,
    create_time: v.publishedAt ? Math.floor(new Date(v.publishedAt).getTime() / 1000) : null,
    author_id: v.author.id || null,
    author_unique_id: v.author.uniqueId || '',
    author_nickname: v.author.nickname || '',
    author_avatar: v.author.avatar || null,
    author_verified: v.author.verified ? 1 : 0,
    author_signature: v.author.signature || '',
    author_follower_count: v.author.followerCount || null,
    sound_id: v.sound?.id || null,
    sound_title: v.sound?.title || null,
    sound_author: v.sound?.authorName || null,
    sound_cover: v.sound?.cover || null,
    sound_duration: v.sound?.duration || null,
    sound_original: v.sound?.original ? 1 : 0,
    comments_json: JSON.stringify(v.comments || []),
    hashtags_json: JSON.stringify(v.hashtags || []),
    channel_type: v.channelType,
    first_seen_at: existed ? null : nowSec,  // 처음 들어온 row만 first_seen_at 셋
    last_updated_at: nowSec,
  }
  // first_seen_at은 INSERT일 때만 의미 있음. UPDATE 시 null이면 SQL 오류 → 보정
  if (existed) {
    // UPDATE 경로: 기존 first_seen_at 유지
    db.prepare(UPSERT_SQL.replace('@first_seen_at', 'COALESCE((SELECT first_seen_at FROM tiktok_videos WHERE id = @id), @last_updated_at)')).run(params)
    return 'updated'
  } else {
    db.prepare(UPSERT_SQL).run(params)
    return 'inserted'
  }
}

export function getRecentTiktokVideos(maxAgeDays: number = 30, limit: number = 500): TikTokVideo[] {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeDays * 24 * 3600
  const rows = db.prepare(`
    SELECT * FROM tiktok_videos
    WHERE create_time IS NULL OR create_time >= ?
    ORDER BY create_time DESC
    LIMIT ?
  `).all(cutoff, limit) as any[]
  return rows.map(rowToVideo)
}

export function countTiktokVideos(maxAgeDays: number = 30): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeDays * 24 * 3600
  const r = db.prepare(`
    SELECT COUNT(*) as c FROM tiktok_videos
    WHERE create_time IS NULL OR create_time >= ?
  `).get(cutoff) as { c: number }
  return r.c
}

// 30일 초과 자동 삭제 (cleanup cron 용)
export function deleteOldTiktokVideos(maxAgeDays: number = 30): number {
  const cutoff = Math.floor(Date.now() / 1000) - maxAgeDays * 24 * 3600
  const r = db.prepare(`
    DELETE FROM tiktok_videos
    WHERE create_time IS NOT NULL AND create_time < ?
  `).run(cutoff)
  return r.changes
}

// stats/comments만 갱신 (Update cron 용 — 영상 메타는 그대로 두고 통계만)
export function updateTiktokVideoStats(
  id: string,
  patch: { views?: number; likes?: number; shares?: number; commentCount?: number; saved?: number; comments?: TikTokComment[] },
  nowSec: number,
): boolean {
  const fields: string[] = []
  const params: any = { id, last_updated_at: nowSec }
  if (patch.views !== undefined) { fields.push('views = @views'); params.views = patch.views }
  if (patch.likes !== undefined) { fields.push('likes = @likes'); params.likes = patch.likes }
  if (patch.shares !== undefined) { fields.push('shares = @shares'); params.shares = patch.shares }
  if (patch.commentCount !== undefined) { fields.push('comment_count = @comment_count'); params.comment_count = patch.commentCount }
  if (patch.saved !== undefined) { fields.push('saved = @saved'); params.saved = patch.saved }
  if (patch.comments !== undefined) { fields.push('comments_json = @comments_json'); params.comments_json = JSON.stringify(patch.comments) }
  if (fields.length === 0) return false
  fields.push('last_updated_at = @last_updated_at')
  const r = db.prepare(`UPDATE tiktok_videos SET ${fields.join(', ')} WHERE id = @id`).run(params)
  return r.changes > 0
}

// 가장 오래된 last_updated_at 영상 N개 (Update cron이 갱신할 대상)
export function getStaleTiktokVideos(limit: number = 30): TikTokVideo[] {
  const rows = db.prepare(`
    SELECT * FROM tiktok_videos
    ORDER BY last_updated_at ASC
    LIMIT ?
  `).all(limit) as any[]
  return rows.map(rowToVideo)
}

// cron 실행 로그
export function setCronLog(task: 'discovery' | 'update' | 'cleanup', status: 'success' | 'failed', summary?: any) {
  db.prepare(`
    INSERT INTO tiktok_cron_log (task, last_run_at, last_status, last_summary)
    VALUES (@task, @last_run_at, @last_status, @last_summary)
    ON CONFLICT(task) DO UPDATE SET
      last_run_at = excluded.last_run_at,
      last_status = excluded.last_status,
      last_summary = excluded.last_summary
  `).run({
    task,
    last_run_at: Math.floor(Date.now() / 1000),
    last_status: status,
    last_summary: summary ? JSON.stringify(summary).slice(0, 500) : null,
  })
}

export function getCronLog(task: 'discovery' | 'update' | 'cleanup') {
  const r = db.prepare(`SELECT last_run_at, last_status, last_summary FROM tiktok_cron_log WHERE task = ?`).get(task) as any
  if (!r) return null
  return {
    lastRunAt: r.last_run_at,
    lastStatus: r.last_status,
    lastSummary: r.last_summary ? JSON.parse(r.last_summary) : null,
  }
}
