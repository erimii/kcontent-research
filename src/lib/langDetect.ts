// ============================================================
// 댓글 언어 감지 — Unicode 분류 (1차) + franc (2차 라틴 disambiguation)
// ============================================================

import { franc } from 'franc'

// franc는 ISO 639-3 코드 반환 → 우리는 ISO 639-1로 표준화
const FRANC_TO_ISO1: Record<string, string> = {
  eng: 'en', spa: 'es', por: 'pt', fra: 'fr', deu: 'de', ita: 'it',
  ind: 'id', tgl: 'tl', vie: 'vi', tur: 'tr', pol: 'pl',
  nld: 'nl', ron: 'ro', ces: 'cs', hun: 'hu', swe: 'sv',
  fin: 'fi', dan: 'da', nob: 'no', ell: 'el',
  rus: 'ru', ukr: 'uk', srp: 'sr', bul: 'bg',
  ara: 'ar', heb: 'he', fas: 'fa', urd: 'ur',
  hin: 'hi', ben: 'bn', tam: 'ta', tel: 'te', mal: 'ml',
  cat: 'ca', glg: 'gl', eus: 'eu',
  jpn: 'ja', kor: 'ko', cmn: 'zh', yue: 'zh', wuu: 'zh',
  tha: 'th', mya: 'my', khm: 'km',
}

// Unicode 범위 기반 빠른 1차 분류 (90%+ 케이스 정확)
function detectByScript(text: string): string | null {
  if (/[가-힣]/.test(text)) return 'ko'                          // Hangul
  if (/[ぁ-ゟ゠-ヿ]/.test(text)) return 'ja'                     // Hiragana/Katakana
  if (/[一-鿿]/.test(text) && !/[가-힣ぁ-ゟ]/.test(text)) return 'zh'  // Hanzi (단 ja/ko 동시 없을 때)
  if (/[ก-๛]/.test(text)) return 'th'                           // Thai
  if (/[Ѐ-ӿ]/.test(text)) return 'ru'                 // Cyrillic
  if (/[؀-ۿ]/.test(text)) return 'ar'                 // Arabic
  if (/[ऀ-ॿ]/.test(text)) return 'hi'                 // Devanagari
  if (/[đƠơưƯấầậắặếệốộớợứự]/i.test(text)) return 'vi'           // Vietnamese diacritics
  return null  // 라틴 스크립트 → franc 보완
}

export function detectLang(text: string): string {
  // 이모지 + 기호 제거 후 길이 검사
  const t = (text || '')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]/gu, '')
    .trim()
  if (t.length < 3) return 'unknown'

  const byScript = detectByScript(t)
  if (byScript) return byScript

  // 라틴 스크립트 분기 — franc는 텍스트 길이 ≥ 12 권장
  if (t.length < 12) return 'en'  // 너무 짧으면 영어로 (TikTok·YouTube 댓글 ground truth)
  try {
    const code = franc(t, { minLength: 3 })
    if (code === 'und') return 'en'
    return FRANC_TO_ISO1[code] || 'en'
  } catch {
    return 'en'
  }
}

// 언어 코드 → 국기 + 라벨
export const LANG_META: Record<string, { flag: string; label: string }> = {
  en: { flag: '🇺🇸', label: 'English' },
  ko: { flag: '🇰🇷', label: '한국어' },
  es: { flag: '🇪🇸', label: 'Español' },
  pt: { flag: '🇧🇷', label: 'Português' },     // 사용자 ~85%가 브라질
  ja: { flag: '🇯🇵', label: '日本語' },
  zh: { flag: '🇨🇳', label: '中文' },
  vi: { flag: '🇻🇳', label: 'Tiếng Việt' },
  id: { flag: '🇮🇩', label: 'Bahasa Indonesia' },
  tl: { flag: '🇵🇭', label: 'Filipino' },
  th: { flag: '🇹🇭', label: 'ไทย' },
  ru: { flag: '🇷🇺', label: 'Русский' },
  ar: { flag: '🇸🇦', label: 'العربية' },
  hi: { flag: '🇮🇳', label: 'हिन्दी' },
  fr: { flag: '🇫🇷', label: 'Français' },
  de: { flag: '🇩🇪', label: 'Deutsch' },
  it: { flag: '🇮🇹', label: 'Italiano' },
  tr: { flag: '🇹🇷', label: 'Türkçe' },
  pl: { flag: '🇵🇱', label: 'Polski' },
  nl: { flag: '🇳🇱', label: 'Nederlands' },
  he: { flag: '🇮🇱', label: 'עברית' },
  fa: { flag: '🇮🇷', label: 'فارسی' },
  bn: { flag: '🇧🇩', label: 'বাংলা' },
  ta: { flag: '🇮🇳', label: 'தமிழ்' },
  ms: { flag: '🇲🇾', label: 'Bahasa Melayu' },
  uk: { flag: '🇺🇦', label: 'Українська' },
  unknown: { flag: '🌐', label: '기타' },
  other: { flag: '🌐', label: '기타' },
}
