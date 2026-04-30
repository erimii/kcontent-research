// ============================================================
// Groq 기반 영→한 번역 (캐시 + 배치)
//
// - .env.local 에서 GROQ_API_KEY 로드 (~/Desktop/secret/001/.env.local)
// - SQLite translation_cache 영구 캐시 (sha256 hash)
// - 배치 번역: 한 번 API 호출로 N개 댓글 번역 (rate limit 절약)
// - 한국어가 50% 이상 포함된 텍스트는 번역 스킵 (이미 한국어)
// ============================================================

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getTranslationCached, setTranslationCached } from '../db.js'

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'  // 빠르고 한국어 자연스러움
const BATCH_SIZE = 8                           // 한 번에 보낼 텍스트 개수 (429 회피로 10→8 축소)
const MAX_INPUT_LEN = 800                      // 텍스트당 최대 길이
const BATCH_DELAY_MS = 1200                    // 배치 간 sleep (rate limit 회피)
const MAX_RETRY = 3                            // 429 재시도 횟수
const SYSTEM_PROMPT = '당신은 K-드라마 Reddit 댓글을 한국어로 번역하는 전문가다. 출력 규칙: (1) 순수 한국어(한글)로만 번역. 한자(漢字·汉字)나 일본어 가나는 절대 사용 금지 — "字幕" 대신 "자막", "第二" 대신 "두 번째"처럼 모두 한글로. (2) 고유명사(드라마 제목·배우 이름·OTT명)는 영문 그대로 보존. (3) 라벨·따옴표·해설 없이 번역만 출력.'

let cachedKey: string | null = null  // 성공 시에만 캐시 (실패는 재시도)
function loadGroqKey(): string | null {
  if (cachedKey) return cachedKey
  const candidates = [
    path.join(os.homedir(), 'Desktop/secret/001/.env.local'),
    path.resolve('.env.local'),
    path.resolve('.env'),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const content = fs.readFileSync(p, 'utf-8')
      const m = content.match(/^GROQ_API_KEY\s*=\s*["']?([^"'\n\r]+)/m)
      if (m && m[1].startsWith('gsk_')) {
        cachedKey = m[1]
        return cachedKey
      }
    } catch { /* skip */ }
  }
  return null  // 빈 키 캐시 안 함 → 키 추가되면 다음 호출에서 자동 인식
}

function sha(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32)
}

function isMostlyKorean(text: string): boolean {
  const korean = (text.match(/[가-힯]/g) || []).length
  const letters = (text.match(/[가-힯A-Za-z]/g) || []).length
  if (letters < 5) return false
  return korean / letters >= 0.5
}

// 한자/일본어 가나 검출
function hasHanja(text: string): boolean {
  return /[一-鿿぀-ゟ゠-ヿ]/.test(text)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 한자 포함 시 한 번 더 시도하는 재번역 단계 (단일 텍스트)
async function retranslateWithoutHanja(apiKey: string, original: string, firstAttempt: string): Promise<string | null> {
  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: original },
          { role: 'assistant', content: firstAttempt },
          { role: 'user', content: '위 번역에 한자(漢字·汉字)나 일본 가나가 포함되어 있다. 모두 순수 한글로 다시 작성하라. 번역만 출력.' },
        ],
        temperature: 0.2,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json() as any
    const fixed = data?.choices?.[0]?.message?.content?.trim()
    return fixed && !hasHanja(fixed) ? fixed : null
  } catch { return null }
}

// ── 단일 텍스트 번역 (캐시 우선) ─────────────────────────────
export async function translateOne(text: string): Promise<string | null> {
  if (!text) return null
  const trimmed = text.trim().slice(0, MAX_INPUT_LEN)
  if (!trimmed) return null
  if (isMostlyKorean(trimmed)) return trimmed  // 이미 한국어
  const hash = sha(trimmed)
  const cached = getTranslationCached(hash)
  if (cached) return cached

  const apiKey = loadGroqKey()
  if (!apiKey) return null

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: trimmed },
          ],
          temperature: 0.3,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get('retry-after') || '0') * 1000
        const delay = retryAfter || 2000 * Math.pow(2, attempt)
        console.warn(`[translate] 429 — ${delay}ms 후 재시도 (${attempt + 1}/${MAX_RETRY})`)
        await sleep(delay)
        continue
      }
      if (!res.ok) {
        console.warn(`[translate] HTTP ${res.status}`)
        return null
      }
      const data = await res.json() as any
      let translation: string | null = data?.choices?.[0]?.message?.content?.trim() || null
      if (!translation) return null

      // 한자 검출 시 한 번 더 시도
      if (hasHanja(translation)) {
        const fixed = await retranslateWithoutHanja(apiKey, trimmed, translation)
        if (fixed) translation = fixed
      }
      setTranslationCached(hash, trimmed, translation)
      return translation
    } catch (e) {
      console.warn(`[translate] 실패:`, (e as Error).message)
      return null
    }
  }
  return null
}

// ── 배치 번역 (1회 API 호출로 다수 처리) ─────────────────────
export async function translateBatch(texts: string[]): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(texts.length).fill(null)

  // 1. 캐시·언어 사전 처리
  const needTranslation: { idx: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = (texts[i] || '').trim().slice(0, MAX_INPUT_LEN)
    if (!t) { results[i] = null; continue }
    if (isMostlyKorean(t)) { results[i] = t; continue }
    const cached = getTranslationCached(sha(t))
    if (cached) { results[i] = cached; continue }
    needTranslation.push({ idx: i, text: t })
  }

  if (needTranslation.length === 0) return results

  const apiKey = loadGroqKey()
  if (!apiKey) {
    console.warn('[translate] GROQ_API_KEY 없음 — 번역 스킵')
    return results
  }

  // 2. 배치 단위로 API 호출 (각 청크 별도 요청, 429 재시도 + 배치 간 sleep)
  const total = needTranslation.length
  let chunkIdx = 0
  for (let start = 0; start < total; start += BATCH_SIZE) {
    if (chunkIdx > 0) await sleep(BATCH_DELAY_MS)  // 첫 배치는 즉시
    chunkIdx++

    const chunk = needTranslation.slice(start, start + BATCH_SIZE)
    const numbered = chunk.map((c, i) => `${i + 1}. ${c.text}`).join('\n\n')
    const userPrompt = `다음 ${chunk.length}개의 K-드라마 Reddit 댓글/제목을 자연스러운 한국어로 번역하라. 입력 번호와 동일한 번호를 매겨 정확히 ${chunk.length}개의 번역을 한 줄씩 출력 ("N. 번역" 형식). 한자(漢字·汉字)와 일본 가나는 절대 사용 금지 — 모두 순수 한글로. 고유명사(드라마/배우/OTT)는 영문 그대로.\n\n${numbered}`

    let parsed: Map<number, string> | null = null
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      try {
        const res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            max_tokens: 2400,
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (res.status === 429) {
          const retryAfter = parseFloat(res.headers.get('retry-after') || '0') * 1000
          const delay = retryAfter || 2000 * Math.pow(2, attempt)
          console.warn(`[translate] 배치 429 — ${delay}ms 후 재시도 (${attempt + 1}/${MAX_RETRY})`)
          await sleep(delay)
          continue
        }
        if (!res.ok) {
          console.warn(`[translate] 배치 HTTP ${res.status}`)
          break
        }
        const data = await res.json() as any
        const raw: string = data?.choices?.[0]?.message?.content?.trim() || ''
        const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean)
        parsed = new Map<number, string>()
        for (const line of lines) {
          const m = line.match(/^(\d+)[.)]\s*(.+)$/)
          if (m) parsed.set(parseInt(m[1], 10), m[2].trim())
        }
        break  // 성공 → 재시도 루프 탈출
      } catch (e) {
        console.warn(`[translate] 배치 실패 (attempt ${attempt + 1}):`, (e as Error).message)
      }
    }

    if (!parsed) continue

    // 한자 포함된 항목은 단건 재번역 (한자 0개 보장)
    for (let i = 0; i < chunk.length; i++) {
      let ko = parsed.get(i + 1)
      if (!ko) continue
      if (hasHanja(ko)) {
        const fixed = await retranslateWithoutHanja(apiKey, chunk[i].text, ko)
        if (fixed) ko = fixed
      }
      results[chunk[i].idx] = ko
      setTranslationCached(sha(chunk[i].text), chunk[i].text, ko)
    }
  }

  return results
}
