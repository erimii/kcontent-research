// 서브레딧별 실제 게시글 발행량 측정
const subs = ['kdramas', 'kdrama', 'kdramarecommends', 'korean']
const now = Date.now() / 1000
const ONE_DAY = 86400
const ONE_WEEK = 7 * 86400

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

async function fetchRSS(sub: string, sort: 'hot' | 'new', limit: number) {
  const url = `https://www.reddit.com/r/${sub}/${sort}.rss?limit=${limit}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/atom+xml, application/rss+xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    console.warn(`  [${sub}/${sort}] HTTP ${res.status}`)
    return []
  }
  const text = await res.text()
  const entries: { published: number; title: string }[] = []
  const re = /<entry>([\s\S]*?)<\/entry>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const e = m[1]
    const title = e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || ''
    if (!title || /\[pinned\]|\[mod post\]|\[announcement\]/i.test(title)) continue
    const pub = e.match(/<published>(.*?)<\/published>/)?.[1] || ''
    if (!pub) continue
    entries.push({ published: new Date(pub).getTime() / 1000, title })
  }
  return entries
}

// new.rss를 pagination으로 깊이 가져옴 (실제 7일 표본 측정)
async function fetchNewPaginated(sub: string, maxPages = 8): Promise<{ published: number; title: string }[]> {
  const results: { published: number; title: string }[] = []
  let after: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const url = `https://www.reddit.com/r/${sub}/new.rss?limit=25${after ? `&after=${after}` : ''}`
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/atom+xml, application/rss+xml, */*' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) break
    const text = await res.text()
    const re = /<entry>([\s\S]*?)<\/entry>/g
    let m: RegExpExecArray | null
    let pageCount = 0
    let lastId = ''
    while ((m = re.exec(text)) !== null) {
      const e = m[1]
      const title = e.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() || ''
      const pub = e.match(/<published>(.*?)<\/published>/)?.[1] || ''
      const id = e.match(/<id>tag:reddit\.com,2008:t3_([a-z0-9]+)/)?.[1] || ''
      if (!title || !pub || /\[pinned\]|\[mod post\]/i.test(title)) continue
      results.push({ published: new Date(pub).getTime() / 1000, title })
      if (id) lastId = id
      pageCount++
    }
    if (pageCount === 0 || !lastId) break
    after = `t3_${lastId}`
    await new Promise(r => setTimeout(r, 1500))  // rate limit
    // 가장 오래된 entry가 7일 넘으면 stop
    const oldest = Math.min(...results.map(e => e.published))
    if (Date.now() / 1000 - oldest > 7 * 86400) break
  }
  return results
}

async function fetchAll(sub: string) {
  return fetchNewPaginated(sub)
}

async function main() {
  console.log()
  console.log('서브레딧별 게시글 발행량 (Reddit RSS new.rss?limit=100 기준)')
  console.log('='.repeat(95))
  console.log('서브레딧'.padEnd(22), 'RSS 응답', '24h내', '7일내', '평균/일', '가장 오래된 글')
  console.log('-'.repeat(95))

  let total24h = 0
  let total7d = 0
  for (const sub of subs) {
    try {
      const all = await fetchAll(sub)
      const within24 = all.filter(e => now - e.published < ONE_DAY).length
      const within7d = all.filter(e => now - e.published < ONE_WEEK).length
      const oldestHours = all.length > 0 ? Math.round((now - Math.min(...all.map(e => e.published))) / 3600) : 0
      const dailyAvg = within7d / 7
      total24h += within24
      total7d += within7d
      console.log(
        `r/${sub}`.padEnd(22),
        `${all.length}개`.padEnd(8),
        `${within24}개`.padEnd(7),
        `${within7d}개`.padEnd(7),
        `${dailyAvg.toFixed(1)}개`.padEnd(9),
        `${oldestHours}시간 전`
      )
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) {
      console.log(`r/${sub}: 실패 - ${(e as Error).message}`)
    }
  }
  console.log('-'.repeat(95))
  console.log('합계'.padEnd(22), ' '.repeat(8), `${total24h}개`.padEnd(7), `${total7d}개`.padEnd(7), `${(total7d / 7).toFixed(1)}개/일`)
  console.log()
  console.log('※ 우리 크롤러는 hot.rss?limit=25 + new.rss?limit=25 (서브당 최대 50)')
  console.log('  → 실제 발행량보다 적게 캐치할 수 있음 (24h 활성 서브레딧일수록 누락 多)')
}

main().catch(e => { console.error(e); process.exit(1) })
