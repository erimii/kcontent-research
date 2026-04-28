// ============================================================
// K-Content Intelligence - 크롤러 서버 (Node.js CJS)
// Reddit RSS 전용 (Soompi/MyDramaList/FlixPatrol 제거)
// PORT: 3001
// ============================================================
'use strict'

const http = require('http')

// ============================================================
// 유틸리티
// ============================================================

function log(msg) {
  console.log(`[Crawler ${new Date().toISOString().slice(11, 19)}] ${msg}`)
}

function makeId(prefix = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x200B;/g, '')
}

// ============================================================
// 파이프라인 (Reddit 전용)
// ============================================================

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','has','have','had',
  'do','does','did','will','would','could','should','may','might',
  'it','its','this','that','i','my','me','you','your','he','she','we',
  'they','his','her','our','their','what','which','who','how','when',
  'where','why','season','ep','episode','part','vol','just','really',
  'like','love','hate','good','bad','great','best','worst','watch',
])

function normalizeTitle(raw) {
  return raw
    .toLowerCase()
    .replace(/[:\-–—]/g, ' ')
    .replace(/[''""«»]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[^a-z0-9\s가-힣]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(normalized) {
  return normalized.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

function jaccardSim(a, b) {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  const inter = [...sa].filter(t => sb.has(t)).length
  return inter / new Set([...sa, ...sb]).size
}

function levenshteinSim(a, b) {
  const m = a.length, n = b.length
  if (!m && !n) return 1
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return 1 - dp[m][n] / Math.max(m, n)
}

function isSame(a, b) {
  if (a.normTitle === b.normTitle) return true
  if (a.normTitle.includes(b.normTitle) || b.normTitle.includes(a.normTitle)) {
    const lo = Math.min(a.normTitle.length, b.normTitle.length)
    const hi = Math.max(a.normTitle.length, b.normTitle.length)
    if (lo / hi >= 0.6) return true
  }
  if (a.tokens.length >= 2 && b.tokens.length >= 2 && jaccardSim(a.tokens, b.tokens) >= 0.42) return true
  return levenshteinSim(a.normTitle, b.normTitle) >= 0.75
}

// Reddit 포스트에서 드라마 제목 추출 (따옴표 안만)
function extractDramaTitleFromReddit(title) {
  const patterns = [
    /\u201c([^\u201d]{3,50})\u201d/,   // "드라마명"
    /"([^"]{3,50})"/,                   // "드라마명"
    /\[([A-Z][^\[\]]{3,50})\]/,         // [드라마명]
  ]
  for (const p of patterns) {
    const m = title.match(p)
    if (m) {
      const t = m[1].trim()
      if (t.length >= 3 && t.split(/\s+/).length <= 7 && !/^\d+$/.test(t)) return t
    }
  }
  return null
}

function runPipeline(redditPosts, reportType = 'daily') {
  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  // --- 정규화 (Reddit만) ---
  const items = []
  for (const p of redditPosts) {
    const extracted = extractDramaTitleFromReddit(p.title)
    const rawTitle = extracted ?? p.title
    const hasDramaTitle = extracted !== null
    const normTitle = normalizeTitle(rawTitle)
    if (normTitle.length < 2) continue

    items.push({
      rawTitle, normTitle,
      tokens: tokenize(normTitle),
      source: 'reddit',
      score: p.score + p.commentCount * 2,
      commentCount: p.commentCount,
      timestamp: p.createdAt,
      isK: true, // Reddit 한국 서브레딧에서 수집 → 모두 K-content
      meta: {
        subreddit: p.subreddit,
        url: p.url,
        flair: p.flair,
        originalTitle: p.title,
        hasDramaTitle,
        topComments: (p.comments || []).slice(0, 3).map(c => c.body),
      }
    })
  }

  // --- 클러스터링 ---
  const assigned = new Set()
  const groups = []
  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue
    const grp = [items[i]]
    assigned.add(i)
    for (let j = i + 1; j < items.length; j++) {
      if (!assigned.has(j) && isSame(items[i], items[j])) {
        grp.push(items[j]); assigned.add(j)
      }
    }
    groups.push(grp)
  }

  // --- 점수화 + 랭킹 ---
  const clusters = groups.map((grp, idx) => {
    const repItem = [...grp].sort((a, b) => b.score - a.score)[0]
    const repTitle = repItem.rawTitle
    const aliases = [...new Set(grp.map(i => i.rawTitle))].filter(t => t !== repTitle)
    const sources = ['reddit']
    const platforms = []
    const regions = []
    const topComments = grp.flatMap(i => i.meta?.topComments || []).filter(c => c && c.length > 20).slice(0, 5)

    const totalComments = grp.reduce((s, i) => s + i.commentCount, 0)
    const totalScore = grp.reduce((s, i) => s + i.score, 0)
    const engScore = Math.log10(Math.max(totalComments + 1, 1)) * 50

    const timestamps = grp.map(i => i.timestamp).sort()
    const lastTs = new Date(timestamps[timestamps.length - 1] || now).getTime()
    const ageDays = (now.getTime() - lastTs) / 86400000
    const recScore = ageDays < 1 ? 100 : ageDays < 3 ? 90 - ageDays * 10 : ageDays < 7 ? 70 - ageDays * 5 : 20

    const kBonus = 20 // 모두 K-content

    const finalScore = Math.round(
      totalScore * 0.40 + engScore * 0.30 + recScore * 0.25 + kBonus * 0.05
    )

    return {
      clusterId: `cluster_${now.getTime()}_${idx}`,
      representativeTitle: repTitle,
      aliases, contentType: 'drama', sources, platforms, regions,
      mentionScore: Math.round(totalScore),
      engagementScore: Math.round(engScore),
      recencyScore: Math.round(recScore),
      totalScore: Math.round(totalScore + engScore + recScore + kBonus),
      finalScore,
      rawItems: grp,
      topComments,
      firstSeen: timestamps[0] || now.toISOString(),
      lastSeen: timestamps[timestamps.length - 1] || now.toISOString(),
      isKContent: true,
      actors: [],
      genres: ['Drama'],
    }
  }).sort((a, b) => b.finalScore - a.finalScore)

  // --- 인사이트 생성 ---
  const insights = generateInsights(clusters)

  // --- Reddit 카테고리 요약 ---
  const redditSummary = redditPosts.length > 0 ? categorizeReddit(redditPosts) : null

  return {
    id: `report_${now.getTime()}`,
    reportType,
    generatedAt: now.toISOString(),
    period: { from: periodFrom.toISOString(), to: now.toISOString() },
    topContents: clusters.slice(0, 30),
    topByPlatform: {},
    topByRegion: {},
    insights,
    sourceSummary: [
      { source: 'reddit', itemCount: redditPosts.length, crawledAt: now.toISOString() },
    ],
    redditSummary,
  }
}

function generateInsights(clusters) {
  const insights = []
  const top = clusters.slice(0, 5)

  if (top.length > 0) {
    insights.push({
      category: 'dominant',
      text: `"${top[0].representativeTitle}"이(가) 이번 기간 Reddit K-드라마 커뮤니티에서 가장 많이 언급되고 있습니다. 종합 점수 ${top[0].finalScore}점을 기록했습니다.`,
      evidence: top[0].rawItems.slice(0, 3).map(i => `[${i.meta?.subreddit}] ${i.meta?.originalTitle || i.rawTitle}`),
      score: top[0].finalScore,
    })
  }

  if (top.length >= 3) {
    insights.push({
      category: 'rising',
      text: `상위 3개 화제작(${top.slice(0, 3).map(c => c.representativeTitle).join(', ')})이 집중 언급되고 있습니다.`,
      evidence: top.slice(0, 3).map(c => `${c.representativeTitle} (${c.finalScore}점)`),
      score: top.slice(0, 3).reduce((s, c) => s + c.finalScore, 0),
    })
  }

  const multiPost = clusters.filter(c => c.rawItems.length >= 2).slice(0, 3)
  if (multiPost.length > 0) {
    insights.push({
      category: 'newcomer',
      text: `"${multiPost[0].representativeTitle}" 등 ${multiPost.length}편이 복수 포스트에서 동시 언급되며 화제 집중 현상을 보입니다.`,
      evidence: multiPost.map(c => `${c.representativeTitle} (포스트 ${c.rawItems.length}개)`),
      score: multiPost.reduce((s, c) => s + c.finalScore, 0),
    })
  }

  return insights.sort((a, b) => b.score - a.score)
}

function categorizeReddit(posts) {
  const recKeywords = ['recommend','suggest','looking for','what should','similar to','like this','anyone seen']
  const revKeywords = ['review','thoughts','opinion','finished','completed','watching','just watched']
  const actorKeywords = ['actor','actress','cast','performance','played','role','star']

  const recMap = {}, revMap = {}, actorMap = {}, culturalMap = {}

  for (const p of posts) {
    const t = p.title.toLowerCase()
    const isRec = recKeywords.some(k => t.includes(k))
    const isRev = revKeywords.some(k => t.includes(k))
    const isActor = actorKeywords.some(k => t.includes(k))

    const titleMatch = p.title.match(/[""\u201c\u201d「」]([^""「」\u201c\u201d]{3,40})[""\u201c\u201d「」]/)
    const drama = titleMatch ? titleMatch[1] : null

    if (isRec && drama) recMap[drama] = (recMap[drama] || 0) + 1
    if (isRev && drama) {
      const lower = p.title.toLowerCase()
      const sent = lower.includes('love') || lower.includes('great') || lower.includes('amazing') ? 'positive'
        : lower.includes('drop') || lower.includes('disappoint') || lower.includes('bad') ? 'negative' : 'mixed'
      if (!revMap[drama]) revMap[drama] = { count: 0, sentiment: sent }
      revMap[drama].count++
    }
    if (isActor) {
      const words = p.title.split(/\s+/)
      for (let i = 0; i < words.length - 1; i++) {
        if (words[i].length > 1 && words[i+1].length > 1 && /^[A-Z]/.test(words[i]) && /^[A-Z]/.test(words[i+1])) {
          const name = words[i] + ' ' + words[i+1]
          if (!actorMap[name]) actorMap[name] = { count: 0, context: p.title.slice(0, 80) }
          actorMap[name].count++
        }
      }
    }

    const cultural = ['language','learn','culture','food','travel','visit','seoul','busan','music','kpop','k-pop']
    const culturalMatch = cultural.find(k => t.includes(k))
    if (culturalMatch) culturalMap[culturalMatch] = (culturalMap[culturalMatch] || 0) + 1
  }

  return {
    recommendations: Object.entries(recMap).sort((a,b) => b[1]-a[1]).slice(0,8).map(([t,c]) => ({ title: t, count: c })),
    reviews: Object.entries(revMap).sort((a,b) => b[1].count-a[1].count).slice(0,8).map(([t,v]) => ({ title: t, sentiment: v.sentiment, count: v.count })),
    actorMentions: Object.entries(actorMap).sort((a,b) => b[1].count-a[1].count).slice(0,8).map(([n,v]) => ({ name: n, count: v.count, context: v.context })),
    culturalQuestions: Object.entries(culturalMap).sort((a,b) => b[1]-a[1]).slice(0,6).map(([t,c]) => ({ topic: t, count: c })),
    hotPosts: posts.sort((a,b) => b.score - a.score).slice(0, 5),
  }
}

// ============================================================
// Reddit RSS 크롤러 (hot + new, 1주 이내)
// ============================================================

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

async function fetchRedditRSS(subreddit, sort = 'hot') {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.rss?limit=25`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/atom+xml, application/rss+xml, */*',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  const nowMs = Date.now()
  const cutoff = nowMs - ONE_WEEK_MS
  const entries = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let m

  while ((m = entryRegex.exec(text)) !== null) {
    const entry = m[1]
    const title = decodeHtml(
      (entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '').trim()
    )
    if (!title || /\[pinned\]|\[mod post\]|\[announcement\]/i.test(title)) continue

    const published =
      entry.match(/<published>(.*?)<\/published>/)?.[1] ||
      entry.match(/<updated>(.*?)<\/updated>/)?.[1] || ''

    const postMs = published ? new Date(published).getTime() : 0
    if (postMs && postMs < cutoff) continue

    const link =
      entry.match(/<link rel="alternate"[^>]+href="([^"]+)"/)?.[1] ||
      entry.match(/<id>(https?:\/\/[^<]+)<\/id>/)?.[1] || ''

    const idMatch = link.match(/comments\/([a-z0-9]+)\//)
    const id = idMatch?.[1] || makeId('r')

    const flair = entry.match(/<category[^>]+label="([^"]+)"/)?.[1] || ''

    const ageSec = (nowMs - postMs) / 1000
    const recencyScore = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10

    entries.push({
      id, subreddit, title, url: link,
      score: recencyScore,
      commentCount: 0,
      createdAt: published ? new Date(published).toISOString() : new Date().toISOString(),
      comments: [],
      flair,
    })
  }
  return entries
}

const K_SIGNALS = [
  'korean','korea','kdrama','k-drama','kdramas','hangul','seoul','busan',
  'tvn','mbc','kbs','sbs','jtbc','wavve','watcha','oppa','noona','eonni',
]

function isKoreanPost(post) {
  const kSubs = ['kdramas','kdrama','kdramarecommends']
  if (kSubs.includes(post.subreddit)) return true
  const combined = (post.title + ' ' + post.subreddit).toLowerCase()
  return K_SIGNALS.some(s => combined.includes(s))
}

async function fetchCommentsRSS(post) {
  try {
    const url = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.rss?limit=25`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { comments: [], count: 0 }
    const text = await res.text()

    const comments = []
    const matches = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    let total = 0

    for (const m of matches) {
      total++
      if (total === 1) continue // 첫 entry = 포스트 본문
      const content = decodeHtml(m[1].match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '')
      const body = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
      if (body.length > 20 && body !== '[deleted]' && body !== '[removed]') {
        comments.push({ id: makeId('c'), body, score: 1, depth: 0 })
      }
      if (comments.length >= 8) break
    }
    return { comments, count: Math.max(0, total - 1) }
  } catch {
    return { comments: [], count: 0 }
  }
}

async function crawlAllReddit() {
  const subreddits = ['kdramas', 'kdrama', 'kdramarecommends', 'korean', 'koreatravel']
  const allPosts = []
  const seenIds = new Set()
  const nowMs = Date.now()
  const cutoff = nowMs - ONE_WEEK_MS

  // 서브레딧별 순차 처리 (429 방지), hot+new는 병렬
  for (const sub of subreddits) {
    try {
      log(`r/${sub} 수집 중...`)
      const [hotRes, newRes] = await Promise.allSettled([
        fetchRedditRSS(sub, 'hot'),
        fetchRedditRSS(sub, 'new'),
      ])
      const hotPosts = hotRes.status === 'fulfilled' ? hotRes.value : []
      const newPosts = newRes.status === 'fulfilled' ? newRes.value : []
      if (hotRes.status === 'rejected') log(`r/${sub} hot 실패: ${hotRes.reason?.message}`)
      if (newRes.status === 'rejected') log(`r/${sub} new 실패: ${newRes.reason?.message}`)

      let added = 0
      for (const p of [...hotPosts, ...newPosts]) {
        const postMs = new Date(p.createdAt).getTime()
        if (postMs < cutoff) continue
        if (!p.title || seenIds.has(p.id)) continue
        if (!isKoreanPost(p)) continue
        seenIds.add(p.id)
        allPosts.push(p)
        added++
      }
      log(`r/${sub}: hot ${hotPosts.length} + new ${newPosts.length} → 1주+K ${added}개`)

      await new Promise(r => setTimeout(r, 800)) // 429 방지
    } catch (e) {
      log(`r/${sub} 실패: ${e.message}`)
    }
  }

  // 댓글 수집: 상위 12개
  if (allPosts.length > 0) {
    const candidates = [...allPosts].sort((a, b) => b.score - a.score).slice(0, 12)
    log(`댓글 수집: 상위 ${candidates.length}개 처리 중...`)

    const results = await Promise.allSettled(candidates.map(p => fetchCommentsRSS(p)))
    const nowSec = Date.now() / 1000
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const { comments, count } = r.value
        candidates[i].comments = comments
        candidates[i].commentCount = count
        const ageSec = nowSec - new Date(candidates[i].createdAt).getTime() / 1000
        const recency = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10
        candidates[i].score = count * 15 + recency
      }
    })

    // 댓글 미수집 포스트 score 재산정
    const candidateIds = new Set(candidates.map(p => p.id))
    const nowSec2 = Date.now() / 1000
    for (const p of allPosts) {
      if (!candidateIds.has(p.id)) {
        const ageSec = nowSec2 - new Date(p.createdAt).getTime() / 1000
        p.score = ageSec < 86400 ? 100 : ageSec < 259200 ? 50 : 10
      }
    }
  }

  log(`총 ${allPosts.length}개 포스트 수집 완료`)
  return allPosts
}

// ============================================================
// 전체 크롤링 파이프라인
// ============================================================

async function runFullCrawl(reportType = 'daily') {
  const logs = []
  const addLog = (msg) => { log(msg); logs.push(msg) }

  addLog(`크롤링 시작 | 타입: ${reportType}`)
  const startTime = Date.now()

  let redditPosts = []
  try {
    redditPosts = await crawlAllReddit()
    addLog(`✅ Reddit: ${redditPosts.length}개 포스트`)
  } catch (e) {
    addLog(`❌ Reddit 실패: ${e.message}`)
  }

  addLog('파이프라인 처리 중...')
  const report = runPipeline(redditPosts, reportType)
  addLog(`✅ 완료: ${report.topContents.length}개 클러스터, 인사이트 ${report.insights.length}개`)

  const duration = Date.now() - startTime
  addLog(`총 소요 시간: ${(duration / 1000).toFixed(1)}초`)

  return { success: true, report, logs, duration }
}

// ============================================================
// HTTP 서버
// ============================================================

const PORT = process.env.PORT || 3001

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => data += chunk)
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(body)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end(); return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString(), service: 'crawler-reddit-only' })
  }

  if (req.method === 'POST' && url.pathname === '/crawl') {
    try {
      const body = await readBody(req)
      const reportType = body.type || 'daily'
      const result = await runFullCrawl(reportType)
      return sendJSON(res, 200, result)
    } catch (e) {
      log(`POST /crawl 오류: ${e.message}`)
      return sendJSON(res, 500, { success: false, error: e.message, logs: [e.message] })
    }
  }

  sendJSON(res, 404, { error: 'Not found' })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Crawler Server] 시작됨 → http://0.0.0.0:${PORT}`)
  console.log(`  POST /crawl  - Reddit 크롤링 + 파이프라인`)
  console.log(`  GET  /health - 헬스체크`)
})

server.on('error', (e) => console.error('[Crawler Server] 오류:', e.message))
