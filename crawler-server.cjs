// ============================================================
// K-Content Intelligence - 크롤러 서버 (Node.js CJS)
// Reddit RSS + Playwright(FlixPatrol/MyDramaList) 통합
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

// XML 태그 내용 추출
function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''
}

// HTML 엔티티 디코딩
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

// 텍스트에서 숫자 추출
function parseNum(str) {
  if (!str) return 0
  const m = str.replace(/,/g, '').match(/[\d.]+/)
  return m ? parseFloat(m[0]) : 0
}

// ============================================================
// 정규화 / 파이프라인 (클라우드플레어 없이 직접 구현)
// ============================================================

const K_SIGNALS = [
  'korean','korea','kdrama','k-drama','kdramas','hangul','seoul','busan',
  'tvn','mbc','kbs','sbs','jtbc','wavve','watcha',
  'oppa','noona','eonni','ahjussi','chaebol',
]

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

function detectKContent(title, meta = '') {
  const combined = (title + ' ' + meta).toLowerCase()
  return K_SIGNALS.some(s => combined.includes(s))
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

const SRC_WEIGHT = { flixpatrol: 3.0, mydramalist: 2.5, letterboxd: 2.0, fundex: 1.8, google_trends: 1.5, reddit: 1.2 }

function runPipeline(redditPosts, flixEntries, mdlEntries, reportType = 'daily') {
  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  // --- 정규화 ---
  const items = []

  for (const p of redditPosts) {
    const titleMatch = p.title.match(/["'「」『』]([^"'「」『』]+)["'「」『』]/)
    const rawTitle = titleMatch ? titleMatch[1].trim() : p.title
    const normTitle = normalizeTitle(rawTitle)
    if (normTitle.length < 2) continue
    items.push({
      rawTitle, normTitle,
      tokens: tokenize(normTitle),
      source: 'reddit',
      score: p.score + p.commentCount * 2,
      commentCount: p.commentCount,
      timestamp: p.createdAt,
      isK: detectKContent(p.title, p.subreddit),
      meta: { subreddit: p.subreddit, url: p.url, flair: p.flair, topComments: (p.comments || []).slice(0,3).map(c => c.body) }
    })
  }

  for (const e of flixEntries) {
    const normTitle = normalizeTitle(e.title)
    if (normTitle.length < 2) continue
    const rankScore = Math.max(0, 101 - e.rank) * 2
    items.push({
      rawTitle: e.title, normTitle,
      tokens: tokenize(normTitle),
      source: 'flixpatrol',
      platform: e.platform,
      region: e.region,
      score: rankScore + (e.points || 0),
      commentCount: 0,
      timestamp: now.toISOString(),
      isK: e.isKContent || detectKContent(e.title),
      meta: { rank: e.rank, platform: e.platform, region: e.region }
    })
  }

  for (const e of mdlEntries) {
    const normTitle = normalizeTitle(e.title)
    if (normTitle.length < 2) continue
    const score = e.rating * 10 + Math.log10(Math.max(e.votes, 1)) * 20 + Math.max(0, 101 - e.rank) * 1.5
    items.push({
      rawTitle: e.title, normTitle,
      tokens: tokenize(normTitle),
      source: 'mydramalist',
      score,
      commentCount: 0,
      timestamp: now.toISOString(),
      isK: true,
      meta: { rank: e.rank, rating: e.rating, votes: e.votes, actors: e.actors, genres: e.genres, url: e.url }
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
    const srcPriority = { flixpatrol: 3, mydramalist: 2, letterboxd: 2, reddit: 0 }
    const repItem = [...grp].sort((a, b) => (srcPriority[b.source] || 0) - (srcPriority[a.source] || 0))[0]
    const repTitle = repItem.rawTitle
    const aliases = [...new Set(grp.map(i => i.rawTitle))].filter(t => t !== repTitle)
    const sources = [...new Set(grp.map(i => i.source))]
    const platforms = [...new Set(grp.map(i => i.platform).filter(Boolean))]
    const regions = [...new Set(grp.map(i => i.region).filter(Boolean))]
    const actors = [...new Set(grp.flatMap(i => i.meta?.actors || []))]
    const genres = [...new Set(grp.flatMap(i => i.meta?.genres || []))]
    const topComments = grp.flatMap(i => i.meta?.topComments || []).filter(c => c && c.length > 20).slice(0, 5)

    // 점수 계산
    let mentionScore = 0
    for (const item of grp) {
      const w = SRC_WEIGHT[item.source] || 1
      const pw = item.platform === 'netflix' ? 2 : item.platform === 'disney' ? 1.5 : 1
      mentionScore += item.score * w * pw
    }
    const totalComments = grp.reduce((s, i) => s + i.commentCount, 0)
    const engScore = Math.log10(Math.max(totalComments + 1, 1)) * 20
    const timestamps = grp.map(i => i.timestamp).sort()
    const lastTs = new Date(timestamps[timestamps.length - 1] || now).getTime()
    const ageDays = (now.getTime() - lastTs) / 86400000
    const recScore = ageDays < 1 ? 100 : ageDays < 3 ? 90 - ageDays * 10 : ageDays < 7 ? 70 - ageDays * 5 : 20
    const divBonus = sources.length * 15 + regions.length * 10
    const kBonus = grp.some(i => i.isK) ? 20 : 0

    // 콘텐츠 시그널
    let csig = 0
    for (const item of grp) {
      const r = item.rawTitle.toLowerCase()
      if (r.includes('recommend') || r.includes('suggest')) csig += 5
      if (r.includes('review') || r.includes('watch')) csig += 4
      if (r.includes('best') || r.includes('top')) csig += 3
      if (item.commentCount > 50) csig += 10
      if (item.commentCount > 100) csig += 15
    }

    const finalScore = Math.round(
      mentionScore * 0.35 + engScore * 0.20 + recScore * 0.20 +
      divBonus * 0.10 + csig * 0.10 + kBonus * 0.05
    )

    // 콘텐츠 타입
    const allMeta = grp.map(i => JSON.stringify(i.meta)).join(' ').toLowerCase()
    const genreStr = genres.join(' ').toLowerCase()
    const contentType =
      allMeta.includes('episode') || allMeta.includes('drama') || genreStr.includes('drama') ? 'drama' :
      allMeta.includes('film') || allMeta.includes('movie') || genreStr.includes('film') ? 'movie' :
      allMeta.includes('variety') || allMeta.includes('show') ? 'variety' : 'unknown'

    return {
      clusterId: `cluster_${now.getTime()}_${idx}`,
      representativeTitle: repTitle,
      aliases, contentType, sources, platforms, regions,
      mentionScore: Math.round(mentionScore),
      engagementScore: Math.round(engScore),
      recencyScore: Math.round(recScore),
      totalScore: Math.round(mentionScore + engScore + recScore + divBonus + kBonus),
      finalScore,
      rawItems: grp,
      topComments,
      firstSeen: timestamps[0] || now.toISOString(),
      lastSeen: timestamps[timestamps.length - 1] || now.toISOString(),
      isKContent: grp.some(i => i.isK),
      actors, genres,
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
    topByPlatform: groupBy(clusters, 'platforms'),
    topByRegion: groupBy(clusters, 'regions'),
    insights,
    sourceSummary: [
      { source: 'reddit', itemCount: redditPosts.length, crawledAt: now.toISOString() },
      { source: 'flixpatrol', itemCount: flixEntries.length, crawledAt: now.toISOString() },
      { source: 'mydramalist', itemCount: mdlEntries.length, crawledAt: now.toISOString() },
    ].filter(s => s.itemCount > 0),
    redditSummary,
  }
}

function groupBy(clusters, field) {
  const map = {}
  for (const c of clusters) {
    const vals = c[field] || []
    if (!vals.length) { (map['Other'] = map['Other'] || []).push(c); continue }
    for (const v of vals) (map[v] = map[v] || []).push(c)
  }
  return map
}

function generateInsights(clusters) {
  const insights = []
  const kContent = clusters.filter(c => c.isKContent)
  const top = clusters.slice(0, 5)

  if (top.length > 0) {
    insights.push({
      category: 'dominant',
      text: `"${top[0].representativeTitle}"이(가) 이번 기간 글로벌 K콘텐츠 팬 담론을 주도하고 있습니다. ${top[0].sources.length}개 플랫폼에서 동시 언급되며 종합 점수 ${top[0].finalScore}점을 기록했습니다.`,
      evidence: top[0].rawItems.slice(0, 3).map(i => `[${i.source}] ${i.rawTitle}`),
      score: top[0].finalScore,
    })
  }

  if (top.length >= 3) {
    insights.push({
      category: 'rising',
      text: `상위 3개 콘텐츠(${top.slice(0, 3).map(c => c.representativeTitle).join(', ')})가 전체 언급량의 ${Math.round(top.slice(0, 3).reduce((s, c) => s + c.finalScore, 0) / Math.max(clusters.reduce((s, c) => s + c.finalScore, 0), 1) * 100)}%를 차지하며 집중 화제 현상이 나타나고 있습니다.`,
      evidence: top.slice(0, 3).map(c => `${c.representativeTitle} (${c.finalScore}점)`),
      score: top.slice(0, 3).reduce((s, c) => s + c.finalScore, 0),
    })
  }

  const kRatio = clusters.length > 0 ? Math.round(kContent.length / clusters.length * 100) : 0
  if (kContent.length > 0) {
    insights.push({
      category: 'genre',
      text: `전체 화제 콘텐츠 중 K콘텐츠 비율은 ${kRatio}%(${kContent.length}/${clusters.length}편)이며, 최고 순위 K콘텐츠는 "${kContent[0].representativeTitle}"(${kContent[0].finalScore}점)입니다.`,
      evidence: kContent.slice(0, 3).map(c => `${c.representativeTitle} - ${c.genres.join(', ') || '장르 미분류'}`),
      score: kContent.reduce((s, c) => s + c.finalScore, 0),
    })
  }

  // 배우 언급 집계
  const actorMap = {}
  for (const c of clusters) {
    for (const a of c.actors) actorMap[a] = (actorMap[a] || 0) + c.finalScore
  }
  const topActors = Object.entries(actorMap).sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topActors.length > 0) {
    insights.push({
      category: 'actor',
      text: `배우 언급 상위: ${topActors.map(([n]) => n).join(', ')}. 이들은 현재 방영 중인 작품으로 팬 관심이 집중되고 있습니다.`,
      evidence: topActors.map(([n, s]) => `${n} (점수 기여: ${Math.round(s)})`),
      score: topActors.reduce((s, [, v]) => s + v, 0),
    })
  }

  // 멀티소스 콘텐츠
  const multiSource = clusters.filter(c => c.sources.length >= 2).slice(0, 3)
  if (multiSource.length > 0) {
    insights.push({
      category: 'newcomer',
      text: `"${multiSource[0].representativeTitle}" 등 ${multiSource.length}편이 Reddit·OTT 랭킹 등 복수 채널에서 동시 화제화되며 크로스 플랫폼 확산 조짐을 보입니다.`,
      evidence: multiSource.map(c => `${c.representativeTitle} (소스: ${c.sources.join(', ')})`),
      score: multiSource.reduce((s, c) => s + c.finalScore, 0),
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

    const titleMatch = p.title.match(/["'「」]([^"'「」]{3,40})["'「」]/)
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
// Reddit RSS 크롤러
// ============================================================

async function crawlRedditRSS(subreddit, limit = 25) {
  const url = `https://www.reddit.com/r/${subreddit}/hot/.rss?limit=${limit}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; KContentResearch/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml',
    }
  })
  if (!res.ok) throw new Error(`Reddit RSS ${subreddit}: HTTP ${res.status}`)
  const xml = await res.text()

  // Atom feed 파싱
  const entries = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let m
  while ((m = entryRegex.exec(xml)) !== null) {
    const entry = m[1]
    const title = decodeHtml(extractTag(entry, 'title'))
    const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || ''
    const updated = extractTag(entry, 'updated')
    const content = decodeHtml(extractTag(entry, 'content') || extractTag(entry, 'summary'))
    const author = decodeHtml(extractTag(entry, 'name'))

    // 콘텐츠에서 댓글수/스코어 추출 시도
    const commentMatch = content.match(/(\d+)\s*comment/i)
    const commentCount = commentMatch ? parseInt(commentMatch[1]) : 0

    if (!title || title.length < 3) continue

    entries.push({
      id: makeId('r'),
      subreddit,
      title,
      url: link,
      score: 1,  // RSS는 upvote 노출 안 함 - 기본값
      commentCount,
      createdAt: updated || new Date().toISOString(),
      comments: [],
      flair: '',
    })
  }

  // fallback: item 기반 RSS 파싱
  if (entries.length === 0) {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    while ((m = itemRegex.exec(xml)) !== null) {
      const item = m[1]
      const title = decodeHtml(extractTag(item, 'title'))
      const link = extractTag(item, 'link')
      const pubDate = extractTag(item, 'pubDate')
      if (!title || title.length < 3) continue
      entries.push({
        id: makeId('r'),
        subreddit, title, url: link, score: 1, commentCount: 0,
        createdAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        comments: [], flair: '',
      })
    }
  }

  log(`Reddit r/${subreddit}: ${entries.length}개 포스트 수집`)
  return entries
}

async function crawlAllReddit() {
  const subreddits = ['kdramas', 'kdrama', 'kdramarecommends']
  const results = await Promise.allSettled(subreddits.map(s => crawlRedditRSS(s, 25)))
  const posts = []
  for (const r of results) {
    if (r.status === 'fulfilled') posts.push(...r.value)
    else log(`Reddit 오류: ${r.reason?.message}`)
  }
  // 중복 URL 제거
  const seen = new Set()
  return posts.filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true })
}

// ============================================================
// FlixPatrol 크롤러 (Playwright)
// ============================================================

async function crawlFlixPatrol(browser) {
  const entries = []
  const pages = [
    { url: 'https://flixpatrol.com/top10/netflix/united-states/', platform: 'netflix', region: 'US' },
    { url: 'https://flixpatrol.com/top10/netflix/world/', platform: 'netflix', region: 'Global' },
    { url: 'https://flixpatrol.com/top10/netflix/south-korea/', platform: 'netflix', region: 'KR' },
  ]

  for (const { url, platform, region } of pages) {
    try {
      const page = await browser.newPage()
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
      await page.waitForTimeout(2000)

      // 여러 셀렉터 시도
      const rows = await page.$$eval(
        'table tr, .top10-show, .fl-table tr',
        (els) => els.slice(0, 15).map(el => {
          const rank = el.querySelector('.rank, td:first-child, .number')?.textContent?.trim()
          const title = el.querySelector('a, .title, td:nth-child(2)')?.textContent?.trim()
          const points = el.querySelector('.points, .fl-points, td:last-child')?.textContent?.trim()
          return { rank, title, points }
        })
      ).catch(() => [])

      for (const row of rows) {
        if (!row.title || row.title.length < 2) continue
        const rank = parseNum(row.rank) || 0
        if (rank < 1 || rank > 10) continue
        const isK = detectKContent(row.title)
        entries.push({
          rank,
          title: row.title.trim(),
          platform, region,
          points: parseNum(row.points),
          isKContent: isK,
        })
      }

      log(`FlixPatrol ${platform}/${region}: ${rows.length}개 항목`)
      await page.close()
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) {
      log(`FlixPatrol ${region} 오류: ${e.message.slice(0, 80)}`)
    }
  }

  return entries
}

// ============================================================
// MyDramaList 크롤러 (Playwright)
// ============================================================

async function crawlMyDramaList(browser) {
  const entries = []
  const urls = [
    'https://mydramalist.com/shows/top?so=week',
    'https://mydramalist.com/shows/top',
  ]

  for (const url of urls.slice(0, 1)) {  // 일단 1개만
    try {
      const page = await browser.newPage()
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })

      // Cloudflare 대기
      const isCF = await page.locator('title').textContent({ timeout: 3000 })
        .then(t => t.includes('Just a moment')).catch(() => false)
      if (isCF) {
        log('MyDramaList: Cloudflare 감지 - 대기 중...')
        await page.waitForTimeout(5000)
      }

      // 리스트 항목 수집
      const items = await page.$$eval(
        '.box.series-box, li.list-item, article.item',
        (els) => els.slice(0, 20).map(el => {
          const title = el.querySelector('h6 a, h5 a, .title a, .series-title')?.textContent?.trim()
          const rating = el.querySelector('.score, .rating, .film-rating')?.textContent?.trim()
          const votes = el.querySelector('.vote, .votes, .text-muted')?.textContent?.trim()
          const href = el.querySelector('a')?.getAttribute('href') || ''
          const actors = [...el.querySelectorAll('.cast a, .actor a')].map(a => a.textContent.trim()).slice(0, 3)
          const genres = [...el.querySelectorAll('.genre, .tag')].map(g => g.textContent.trim()).slice(0, 3)
          return { title, rating, votes, href, actors, genres }
        })
      ).catch(() => [])

      items.forEach((item, i) => {
        if (!item.title || item.title.length < 2) return
        entries.push({
          rank: i + 1,
          title: item.title,
          rating: parseNum(item.rating) || 7.5,
          votes: parseNum(item.votes) || 100,
          episodes: 0,
          genres: item.genres || [],
          actors: item.actors || [],
          url: item.href ? `https://mydramalist.com${item.href}` : url,
        })
      })

      log(`MyDramaList: ${entries.length}개 드라마 수집`)
      await page.close()
    } catch (e) {
      log(`MyDramaList 오류: ${e.message.slice(0, 80)}`)
    }
  }

  return entries
}

// ============================================================
// 전체 크롤링 파이프라인
// ============================================================

async function runFullCrawl(sources = ['reddit', 'flixpatrol', 'mydramalist'], reportType = 'daily') {
  const logs = []
  const addLog = (msg) => { log(msg); logs.push(msg) }

  addLog(`크롤링 시작: ${sources.join(', ')} | 타입: ${reportType}`)
  const startTime = Date.now()

  let redditPosts = [], flixEntries = [], mdlEntries = []
  let browser = null

  // Reddit (Playwright 불필요 - fetch로)
  if (sources.includes('reddit')) {
    try {
      redditPosts = await crawlAllReddit()
      addLog(`✅ Reddit: ${redditPosts.length}개 포스트`)
    } catch (e) {
      addLog(`❌ Reddit 실패: ${e.message.slice(0, 80)}`)
    }
  }

  // Playwright 필요 소스들
  const needsPlaywright = sources.some(s => ['flixpatrol', 'mydramalist'].includes(s))
  if (needsPlaywright) {
    try {
      const { chromium } = require('./node_modules/playwright')
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      })
      addLog('✅ Playwright 브라우저 시작')
    } catch (e) {
      addLog(`❌ Playwright 시작 실패: ${e.message.slice(0, 80)}`)
    }
  }

  if (browser) {
    if (sources.includes('flixpatrol')) {
      try {
        flixEntries = await crawlFlixPatrol(browser)
        addLog(`✅ FlixPatrol: ${flixEntries.length}개 항목`)
      } catch (e) {
        addLog(`❌ FlixPatrol 실패: ${e.message.slice(0, 80)}`)
      }
    }

    if (sources.includes('mydramalist')) {
      try {
        mdlEntries = await crawlMyDramaList(browser)
        addLog(`✅ MyDramaList: ${mdlEntries.length}개 드라마`)
      } catch (e) {
        addLog(`❌ MyDramaList 실패: ${e.message.slice(0, 80)}`)
      }
    }

    try { await browser.close() } catch (_) {}
  }

  // 파이프라인 실행
  addLog('파이프라인 처리 중...')
  const report = runPipeline(redditPosts, flixEntries, mdlEntries, reportType)
  addLog(`✅ 파이프라인 완료: ${report.topContents.length}개 클러스터, 인사이트 ${report.insights.length}개`)

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

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' })
    res.end(); return
  }

  // GET /health
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJSON(res, 200, { status: 'ok', timestamp: new Date().toISOString(), service: 'crawler' })
  }

  // GET /crawl/reddit - Reddit 단독 테스트
  if (req.method === 'GET' && url.pathname === '/crawl/reddit') {
    try {
      const posts = await crawlAllReddit()
      const report = runPipeline(posts, [], [], 'daily')
      return sendJSON(res, 200, { success: true, posts: posts.length, report, logs: [] })
    } catch (e) {
      return sendJSON(res, 500, { success: false, error: e.message })
    }
  }

  // POST /crawl - 전체 파이프라인
  if (req.method === 'POST' && url.pathname === '/crawl') {
    try {
      const body = await readBody(req)
      const sources = body.sources || ['reddit', 'flixpatrol', 'mydramalist']
      const reportType = body.type || 'daily'
      const result = await runFullCrawl(sources, reportType)
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
  console.log(`  POST /crawl        - 전체 파이프라인 실행`)
  console.log(`  GET  /crawl/reddit - Reddit 테스트`)
  console.log(`  GET  /health       - 헬스체크`)
})

server.on('error', (e) => console.error('[Crawler Server] 오류:', e.message))
