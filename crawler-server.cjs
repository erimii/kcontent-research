// ============================================================
// 크롤러 서버 - CommonJS (Node.js + Playwright)
// Hono 앱(port 3000)에서 fetch로 호출됨 → port 3001
// ============================================================

'use strict'

const http = require('http')
const { chromium } = require('playwright')

const PORT = 3001

// ============================================================
// 유틸: 제목 정규화
// ============================================================
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

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','has','have','had','do','does',
  'did','will','would','could','should','it','its','this','that','i','my',
  'you','your','he','she','we','they','his','her','season','ep','episode','part'
])

function tokenize(str) {
  return str.split(' ').filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

// ============================================================
// K콘텐츠 감지
// ============================================================
const K_SIGNALS = ['korean','korea','kdrama','k-drama','tvn','mbc','kbs','sbs','jtbc']
function isKContent(title) {
  const t = title.toLowerCase()
  return K_SIGNALS.some(k => t.includes(k))
}

// ============================================================
// Jaccard 유사도
// ============================================================
function jaccard(a, b) {
  if (!a.length && !b.length) return 1
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  const inter = [...sa].filter(x => sb.has(x)).length
  const union = new Set([...sa, ...sb]).size
  return inter / union
}

// ============================================================
// 브라우저 초기화
// ============================================================
async function getBrowser() {
  return await chromium.launch({
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  })
}

// ============================================================
// Reddit 크롤링 (공개 JSON API)
// ============================================================
async function crawlReddit(browser, subreddits) {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (compatible; KContentBot/1.0)',
    'Accept': 'application/json',
  })

  const allPosts = []

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/hot/.json?limit=25`
      console.log(`  [Reddit] r/${sub} 수집 중...`)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
      const text = await page.evaluate(() => document.body.innerText)
      const data = JSON.parse(text)
      if (!data?.data?.children) continue

      for (const child of data.data.children) {
        const p = child.data
        if (!p || p.stickied) continue
        allPosts.push({
          id: p.id,
          subreddit: p.subreddit,
          title: p.title,
          url: p.url,
          score: p.score || 0,
          commentCount: p.num_comments || 0,
          createdAt: new Date(p.created_utc * 1000).toISOString(),
          comments: [],
          flair: p.link_flair_text || null,
        })
      }
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.error(`  [Reddit] r/${sub} 실패:`, e.message)
    }
  }

  // 인기 포스트 댓글 수집 (상위 5개)
  const hot = allPosts.filter(p => p.commentCount >= 10).slice(0, 5)
  for (const post of hot) {
    try {
      const url = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}/.json?limit=8&depth=1`
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      const text = await page.evaluate(() => document.body.innerText)
      const data = JSON.parse(text)
      if (!Array.isArray(data) || data.length < 2) continue
      const comments = (data[1]?.data?.children || [])
        .filter(c => c.kind !== 'more' && c.data?.body && c.data.body !== '[deleted]')
        .slice(0, 8)
        .map(c => ({ id: c.data.id, body: c.data.body.slice(0, 400), score: c.data.score || 0, depth: 0 }))
      post.comments = comments
      await new Promise(r => setTimeout(r, 800))
    } catch (e) { /* 댓글 실패는 무시 */ }
  }

  await page.close()
  console.log(`  [Reddit] 총 ${allPosts.length}개 포스트 수집`)
  return allPosts
}

// ============================================================
// FlixPatrol 크롤링
// ============================================================
async function crawlFlixPatrol(browser) {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  })

  const platforms = [
    { name: 'netflix', slug: 'netflix' },
    { name: 'disney', slug: 'disney' },
    { name: 'apple', slug: 'apple-tv' },
  ]
  const regions = [
    { name: 'Global', slug: 'world' },
    { name: 'US', slug: 'united-states' },
    { name: 'UK', slug: 'united-kingdom' },
    { name: 'Korea', slug: 'south-korea' },
  ]

  const allEntries = []

  for (const platform of platforms) {
    for (const region of regions) {
      try {
        const url = `https://flixpatrol.com/top10/${platform.slug}/tv-shows/${region.slug}/today/`
        console.log(`  [FlixPatrol] ${platform.name}/${region.name} 수집 중...`)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 })

        const entries = await page.evaluate((pName, rName) => {
          const results = []
          const rows = document.querySelectorAll('table tbody tr')
          rows.forEach((row, idx) => {
            if (idx >= 10) return
            const titleEl = row.querySelector('a[href*="/title/"], td:nth-child(2) a')
            const title = titleEl?.textContent?.trim()
            if (!title || title.length < 2) return
            const pointsEl = row.querySelector('td:last-child')
            const points = parseInt(pointsEl?.textContent?.replace(/[^0-9]/g, '') || '0') || 0
            results.push({ rank: idx + 1, title, platform: pName, region: rName, points, url: titleEl?.href || '', isKContent: false })
          })

          if (results.length === 0) {
            const cards = document.querySelectorAll('.top10-show, [data-rank]')
            cards.forEach((card, idx) => {
              if (idx >= 10) return
              const titleEl = card.querySelector('a, .title, h3')
              const title = titleEl?.textContent?.trim()
              if (!title) return
              results.push({ rank: idx + 1, title, platform: pName, region: rName, points: 0, url: '', isKContent: false })
            })
          }
          return results
        }, platform.name, region.name)

        // K콘텐츠 감지
        for (const e of entries) {
          e.isKContent = isKContent(e.title)
        }
        allEntries.push(...entries)
        await new Promise(r => setTimeout(r, 1200))
      } catch (e) {
        console.error(`  [FlixPatrol] ${platform.name}/${region.name} 실패:`, e.message)
      }
    }
  }

  await page.close()
  console.log(`  [FlixPatrol] 총 ${allEntries.length}개 항목 수집`)
  return allEntries
}

// ============================================================
// MyDramaList 크롤링
// ============================================================
async function crawlMyDramaList(browser) {
  const page = await browser.newPage()
  await page.setExtraHTTPHeaders({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  })

  const entries = []

  try {
    const url = 'https://mydramalist.com/shows/korean-dramas?sort=popular&year=2025'
    console.log('  [MDL] 인기 드라마 수집 중...')
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })

    const items = await page.evaluate(() => {
      const results = []
      const cards = document.querySelectorAll('.box-body, li.list-item, .drama-card, .col-lg-8 .box')
      cards.forEach((card, idx) => {
        if (idx >= 20) return
        const titleEl = card.querySelector('h6 a, h5 a, .title a, a.block-title')
        const title = titleEl?.textContent?.trim()
        if (!title) return
        const ratingEl = card.querySelector('.score, .rating')
        const rating = parseFloat(ratingEl?.textContent?.trim() || '0') || 0
        const votesEl = card.querySelector('.votes, .watchers')
        const votes = parseInt(votesEl?.textContent?.replace(/[^0-9]/g, '') || '0') || 0
        const genreEls = card.querySelectorAll('.genre a, .genres a')
        const genres = [...genreEls].map(g => g.textContent?.trim()).filter(Boolean)
        const actorEls = card.querySelectorAll('[class*="cast"] a, .artists a')
        const actors = [...actorEls].map(a => a.textContent?.trim()).filter(Boolean).slice(0, 4)
        results.push({
          rank: idx + 1, title, rating, votes, episodes: 0,
          genres, actors, url: titleEl?.href || '', year: 2025
        })
      })
      return results
    })

    entries.push(...items)
  } catch (e) {
    console.error('  [MDL] 실패:', e.message)
  }

  await page.close()
  console.log(`  [MDL] 총 ${entries.length}개 드라마 수집`)
  return entries
}

// ============================================================
// 데이터 파이프라인 (정규화 → 클러스터링 → 점수화 → 인사이트)
// ============================================================

function normalizeAll(redditPosts, flixEntries, mdlEntries) {
  const items = []

  // Reddit 정규화
  for (const p of redditPosts) {
    const match = p.title.match(/["'「」]([^"'「」]{2,40})["'「」]/)
    const extracted = match ? match[1].trim() : p.title
    const norm = normalizeTitle(extracted)
    if (norm.length < 3) continue
    items.push({
      rawTitle: extracted,
      normalizedTitle: norm,
      tokens: tokenize(norm),
      source: 'reddit',
      platform: null,
      region: null,
      score: (p.score || 0) + (p.commentCount || 0) * 2,
      commentCount: p.commentCount || 0,
      timestamp: p.createdAt,
      metadata: {
        subreddit: p.subreddit,
        url: p.url,
        flair: p.flair,
        topComments: p.comments.slice(0, 3).map(c => c.body),
      }
    })
  }

  // FlixPatrol 정규화
  for (const e of flixEntries) {
    const norm = normalizeTitle(e.title)
    if (norm.length < 2) continue
    const rankScore = Math.max(0, 101 - e.rank) * 2
    items.push({
      rawTitle: e.title,
      normalizedTitle: norm,
      tokens: tokenize(norm),
      source: 'flixpatrol',
      platform: e.platform,
      region: e.region,
      score: rankScore + (e.points || 0),
      commentCount: 0,
      timestamp: new Date().toISOString(),
      metadata: { rank: e.rank, points: e.points, isKContent: e.isKContent }
    })
  }

  // MDL 정규화
  for (const e of mdlEntries) {
    const norm = normalizeTitle(e.title)
    if (norm.length < 2) continue
    const score = (e.rating || 0) * 10 + Math.log10(Math.max(e.votes || 1, 1)) * 20 + Math.max(0, 101 - e.rank) * 1.5
    items.push({
      rawTitle: e.title,
      normalizedTitle: norm,
      tokens: tokenize(norm),
      source: 'mydramalist',
      platform: null,
      region: null,
      score,
      commentCount: 0,
      timestamp: new Date().toISOString(),
      metadata: { rank: e.rank, rating: e.rating, votes: e.votes, genres: e.genres, actors: e.actors }
    })
  }

  return items
}

function clusterItems(items) {
  const clusters = []
  const assigned = new Set()

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue
    const group = [items[i]]
    assigned.add(i)

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue
      const a = items[i], b = items[j]
      let same = false

      if (a.normalizedTitle === b.normalizedTitle) {
        same = true
      } else if (a.tokens.length >= 2 && b.tokens.length >= 2) {
        same = jaccard(a.tokens, b.tokens) >= 0.45
      } else {
        // 짧은 제목 Levenshtein
        const maxLen = Math.max(a.normalizedTitle.length, b.normalizedTitle.length)
        if (maxLen > 0) {
          const dist = levenshtein(a.normalizedTitle, b.normalizedTitle)
          same = (1 - dist / maxLen) >= 0.75
        }
      }

      if (same) { group.push(items[j]); assigned.add(j) }
    }

    clusters.push(group)
  }

  return clusters.map((group, idx) => buildCluster(group, idx))
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({length: m+1}, (_, i) => Array.from({length: n+1}, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

function buildCluster(items, idx) {
  const priority = { flixpatrol: 3, mydramalist: 2, letterboxd: 2, reddit: 0 }
  const sorted = [...items].sort((a, b) => (priority[b.source] || 0) - (priority[a.source] || 0))
  const repTitle = sorted[0]?.rawTitle || items[0]?.rawTitle || 'Unknown'
  const aliases = [...new Set(items.map(i => i.rawTitle))].filter(t => t !== repTitle)
  const sources = [...new Set(items.map(i => i.source))]
  const platforms = [...new Set(items.map(i => i.platform).filter(Boolean))]
  const regions = [...new Set(items.map(i => i.region).filter(Boolean))]
  const actors = [...new Set(items.flatMap(i => i.metadata?.actors || []))]
  const genres = [...new Set(items.flatMap(i => i.metadata?.genres || []))]
  const topComments = items.flatMap(i => i.metadata?.topComments || []).filter(c => c && c.length > 20).slice(0, 5)
  const timestamps = items.map(i => i.timestamp).sort()
  const kContent = items.some(i => i.source === 'mydramalist' || i.metadata?.isKContent === true || (i.metadata?.subreddit || '').includes('kdrama'))

  return {
    clusterId: `cluster_${Date.now()}_${idx}`,
    representativeTitle: repTitle,
    aliases, sources, platforms, regions,
    totalScore: 0, mentionScore: 0, engagementScore: 0, recencyScore: 0, finalScore: 0,
    rawItems: items,
    topComments,
    firstSeen: timestamps[0] || new Date().toISOString(),
    lastSeen: timestamps[timestamps.length - 1] || new Date().toISOString(),
    isKContent: kContent,
    actors, genres,
    contentType: inferType(items),
  }
}

function inferType(items) {
  const text = items.map(i => JSON.stringify(i.metadata)).join(' ').toLowerCase()
  if (text.includes('drama') || text.includes('episode') || text.includes('season')) return 'drama'
  if (text.includes('film') || text.includes('movie')) return 'movie'
  if (text.includes('variety') || text.includes('reality')) return 'variety'
  return 'unknown'
}

function scoreAndRank(clusters) {
  const SW = { flixpatrol: 3.0, mydramalist: 2.5, reddit: 1.2 }
  const PW = { netflix: 2.0, disney: 1.5, apple: 1.3, amazon: 1.2, default: 1.0 }
  const now = Date.now()

  return clusters.map(c => {
    // 언급 점수
    const mention = c.rawItems.reduce((sum, i) => {
      const sw = SW[i.source] || 1.0
      const pw = PW[i.platform?.toLowerCase()] || PW.default
      return sum + i.score * sw * pw
    }, 0)

    // 참여도
    const totalComments = c.rawItems.reduce((s, i) => s + i.commentCount, 0)
    const engagement = Math.log10(Math.max(totalComments + 1, 1)) * 20

    // 최신성
    const ages = c.rawItems.map(i => (now - new Date(i.timestamp).getTime()) / 86400000)
    const minAge = Math.min(...ages)
    const recency = minAge < 1 ? 100 : minAge < 3 ? 90 - minAge * 10 : minAge < 7 ? 70 - minAge * 5 : 20

    // 소스 다양성
    const diversity = c.sources.length * 15 + c.regions.length * 10

    // K콘텐츠 보너스
    const kBonus = c.isKContent ? 20 : 0

    const finalScore = mention * 0.40 + engagement * 0.20 + recency * 0.20 + diversity * 0.15 + kBonus * 0.05

    return {
      ...c,
      mentionScore: Math.round(mention),
      engagementScore: Math.round(engagement),
      recencyScore: Math.round(recency),
      totalScore: Math.round(mention + engagement + recency + diversity + kBonus),
      finalScore: Math.round(finalScore),
    }
  }).sort((a, b) => b.finalScore - a.finalScore)
}

function generateInsights(ranked) {
  const insights = []
  if (!ranked.length) return insights

  const top = ranked[0]
  const topK = ranked.filter(c => c.isKContent)

  if (top) {
    insights.push({
      category: 'dominant',
      text: `"${top.representativeTitle}" is dominating this period with the highest score, trending across ${top.sources.join(', ')}.`,
      evidence: [`Score: ${top.finalScore}`, `Sources: ${top.sources.join(', ')}`],
      score: top.finalScore,
    })
  }

  if (topK.length > 0) {
    const kTop = topK[0]
    const kRank = ranked.indexOf(kTop) + 1
    insights.push({
      category: 'dominant',
      text: `K-Content leads with "${kTop.representativeTitle}" at #${kRank} overall — strong global fan demand signal.`,
      evidence: [`K-content score: ${kTop.mentionScore}`, `Platforms: ${kTop.platforms.join(', ') || 'Multiple'}`],
      score: kTop.finalScore,
    })
  }

  const multiSource = ranked.filter(c => c.sources.length >= 2).slice(0, 2)
  for (const ms of multiSource) {
    insights.push({
      category: 'rising',
      text: `"${ms.representativeTitle}" is trending across ${ms.sources.length} sources (${ms.sources.join(', ')}), signaling broad buzz.`,
      evidence: [`Source count: ${ms.sources.length}`],
      score: ms.finalScore,
    })
  }

  const genreMap = new Map()
  for (const c of ranked.slice(0, 15)) {
    for (const g of c.genres) genreMap.set(g, (genreMap.get(g) || 0) + 1)
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  if (topGenres.length > 0) {
    insights.push({
      category: 'genre',
      text: `Top genres this period: ${topGenres.map(([g, c]) => `${g}(${c})`).join(', ')} — align content strategy.`,
      evidence: topGenres.map(([g, c]) => `${g}: ${c} titles`),
      score: 40,
    })
  }

  return insights.sort((a, b) => b.score - a.score).slice(0, 8)
}

function categorizeReddit(posts) {
  const recKeywords = ['recommend','suggestion','similar to','looking for','what should','any good']
  const posKeywords = ['love','amazing','great','excellent','best','favorite','worth','masterpiece']
  const negKeywords = ['hate','bad','boring','disappointing','worst','skip','drop']
  const cultureKeywords = ['korean culture','learn korean','travel','food','customs','tradition']
  const titlePat = /["'「」]([^"'「」]{2,40})["'「」]/g

  const recs = new Map(), reviews = new Map(), cultural = new Map()
  const hotPosts = [...posts].sort((a, b) => b.score - a.score).slice(0, 5)

  for (const p of posts) {
    const fullText = (p.title + ' ' + p.comments.map(c => c.body).join(' ')).toLowerCase()

    if (recKeywords.some(k => fullText.includes(k))) {
      const matches = [...(p.title + ' ' + p.comments.map(c => c.body).join(' ')).matchAll(titlePat)]
      for (const m of matches) recs.set(m[1].trim(), (recs.get(m[1].trim()) || 0) + 1)
    }

    const titleMatches = [...p.title.matchAll(titlePat)]
    for (const m of titleMatches) {
      const t = m[1].trim()
      const pos = posKeywords.filter(k => fullText.includes(k)).length
      const neg = negKeywords.filter(k => fullText.includes(k)).length
      const ex = reviews.get(t) || { count: 0, pos: 0, neg: 0 }
      reviews.set(t, { count: ex.count + 1, pos: ex.pos + pos, neg: ex.neg + neg })
    }

    for (const kw of cultureKeywords) {
      if (fullText.includes(kw)) cultural.set(kw, (cultural.get(kw) || 0) + 1)
    }
  }

  return {
    recommendations: [...recs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([title, count]) => ({ title, count })),
    reviews: [...reviews.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10).map(([title, d]) => ({
      title, count: d.count,
      sentiment: d.pos > d.neg ? 'positive' : d.neg > d.pos ? 'negative' : 'mixed'
    })),
    actorMentions: [],
    culturalQuestions: [...cultural.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topic, count]) => ({ topic, count })),
    hotPosts,
  }
}

function runPipeline(redditPosts, flixEntries, mdlEntries, reportType) {
  const now = new Date()
  const periodFrom = new Date(now)
  periodFrom.setDate(periodFrom.getDate() - (reportType === 'weekly' ? 7 : 1))

  console.log(`  [Pipeline] 정규화 중... (Reddit: ${redditPosts.length}, Flix: ${flixEntries.length}, MDL: ${mdlEntries.length})`)
  const normalized = normalizeAll(redditPosts, flixEntries, mdlEntries)

  console.log(`  [Pipeline] 클러스터링 중... (${normalized.length}개 아이템)`)
  const clusters = clusterItems(normalized)

  console.log(`  [Pipeline] 점수화 중... (${clusters.length}개 클러스터)`)
  const ranked = scoreAndRank(clusters)

  const insights = generateInsights(ranked)
  const redditSummary = redditPosts.length > 0 ? categorizeReddit(redditPosts) : undefined

  // 플랫폼/권역별 그룹화
  const topByPlatform = {}
  const topByRegion = {}
  for (const c of ranked) {
    for (const p of c.platforms) { if (!topByPlatform[p]) topByPlatform[p] = []; topByPlatform[p].push(c) }
    for (const r of c.regions) { if (!topByRegion[r]) topByRegion[r] = []; topByRegion[r].push(c) }
    if (!c.platforms.length) { if (!topByPlatform['other']) topByPlatform['other'] = []; topByPlatform['other'].push(c) }
    if (!c.regions.length) { if (!topByRegion['Global']) topByRegion['Global'] = []; topByRegion['Global'].push(c) }
  }

  return {
    id: `report_${now.getTime()}`,
    reportType,
    generatedAt: now.toISOString(),
    period: { from: periodFrom.toISOString(), to: now.toISOString() },
    topContents: ranked.slice(0, 30),
    topByPlatform,
    topByRegion,
    insights,
    sourceSummary: [
      { source: 'reddit', itemCount: redditPosts.length, crawledAt: now.toISOString() },
      { source: 'flixpatrol', itemCount: flixEntries.length, crawledAt: now.toISOString() },
      { source: 'mydramalist', itemCount: mdlEntries.length, crawledAt: now.toISOString() },
    ].filter(s => s.itemCount > 0),
    redditSummary,
  }
}

// ============================================================
// HTTP 서버
// ============================================================
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200)
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }))
    return
  }

  // POST /crawl
  if (req.method === 'POST' && req.url === '/crawl') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const start = Date.now()
      let browser = null
      try {
        const params = body ? JSON.parse(body) : {}
        const reportType = params.reportType || 'daily'
        const sources = params.sources || ['reddit', 'flixpatrol', 'mydramalist']
        console.log(`\n[크롤러] 시작 - ${reportType} / ${sources.join(', ')}`)

        browser = await getBrowser()

        const [reddit, flix, mdl] = await Promise.all([
          sources.includes('reddit')      ? crawlReddit(browser, ['kdramas','kdrama','kdramarecommends','korean','koreatravel']) : Promise.resolve([]),
          sources.includes('flixpatrol')  ? crawlFlixPatrol(browser) : Promise.resolve([]),
          sources.includes('mydramalist') ? crawlMyDramaList(browser) : Promise.resolve([]),
        ])

        const report = runPipeline(reddit, flix, mdl, reportType)
        const duration = Date.now() - start
        console.log(`[크롤러] 완료 - ${duration}ms, 클러스터: ${report.topContents.length}개`)

        res.writeHead(200)
        res.end(JSON.stringify({ success: true, report, duration }))
      } catch (err) {
        console.error('[크롤러] 오류:', err.message)
        res.writeHead(500)
        res.end(JSON.stringify({ success: false, error: err.message }))
      } finally {
        if (browser) await browser.close().catch(() => {})
      }
    })
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[크롤러] 포트 ${PORT} 이미 사용 중 - 기존 프로세스 종료 후 재시작`)
    const { execSync } = require('child_process')
    try {
      execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`)
      setTimeout(() => {
        server.listen(PORT, () => {
          console.log(`\n🚀 크롤러 서버 재시작 성공 - http://localhost:${PORT}\n`)
        })
      }, 1500)
    } catch (e) {
      console.error('[크롤러] 포트 해제 실패:', e.message)
      process.exit(1)
    }
  } else {
    console.error('[크롤러] 서버 오류:', err)
    process.exit(1)
  }
})

server.listen(PORT, () => {
  console.log(`\n🚀 크롤러 서버 실행 중 - http://localhost:${PORT}`)
  console.log(`   POST /crawl   - 전체 파이프라인 실행`)
  console.log(`   GET  /health  - 헬스체크\n`)
})
