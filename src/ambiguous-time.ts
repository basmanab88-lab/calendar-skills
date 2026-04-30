// Ambiguous time detection + follow-up resolution.
// When a user says "schedule a meeting at 3" without specifying AM/PM,
// detectAmbiguousTime() returns true. After the bot asks "morning or evening?",
// getAmbiguityResolution() takes the conversation tail and returns the resolved
// HH:MM string.

import type { ChatMsg } from "./types.ts"
import { isRelativeTime } from "./relative-time.ts"

/**
 * Returns true if the text mentions a bare hour 1-12 with scheduling context
 * but no AM/PM marker — e.g. "פגישה ב-3" or "meeting at 5".
 *
 * Returns false if the text is unambiguous (24-hour, HH:MM, period markers,
 * or relative-time expression).
 */
export function detectAmbiguousTime(text: string): boolean {
  // Clear period markers -> not ambiguous
  if (/בוקר|ערב|אחהצ|אחרי הצהריים|לפנות|לילה|צהריים|\bam\b|\bpm\b/i.test(text)) return false
  // 24-hour time (13-23) -> not ambiguous
  if (/\b(1[3-9]|2[0-3])(?::\d\d)?\b/.test(text)) return false
  // Explicit HH:MM format (e.g. "11:45", "3:30") -> not ambiguous
  if (/\b\d{1,2}:\d{2}\b/.test(text)) return false
  // Relative time -> not ambiguous (resolved by resolveRelativeTime)
  if (isRelativeTime(text)) return false

  // Digit 1-12 (standalone, not part of HH:MM)
  const hasDigitHour = /\b([1-9]|1[0-2])\b/.test(text)
  // Hebrew number words 1-12
  const hasHebrewHour = /אחת|שתיים|שתים|שלוש|ארבע|חמש|שש|שבע|שמונה|תשע|עשר/.test(text)
  // Scheduling context (not a query or delete)
  const hasContext = /מחר|היום|הערב|פגישה|ישיבה|להסתפר|לפגוש|לקנות|לאסוף|לצאת|לאכול|לרופא|לדנטיסט|tomorrow|today|meeting|event|appointment/.test(text)
  const isQuery = /\?|מה יש|כמה|\bhow many\b|\bwhat do\b/i.test(text)
  return (hasDigitHour || hasHebrewHour) && hasContext && !isQuery
}

const HEBREW_HOURS: Record<string, number> = {
  'אחת': 1,                    // אחת
  'שתיים': 2,        // שתיים
  'שתים': 2,              // שתים
  'שלוש': 3,              // שלוש
  'ארבע': 4,              // ארבע
  'חמש': 5,                    // חמש
  'שש': 6,                          // שש
  'שבע': 7,                    // שבע
  'שמונה': 8,        // שמונה
  'תשע': 9,                    // תשע
  'עשר': 10,                   // עשר
  'עשתיים': 11, // עשתיים
  'שתים עשרה': 12, // שתים עשרה
}

/** The exact question phrases the bot uses for AM/PM disambiguation. */
export const AMBIGUITY_QUESTIONS = {
  hebrew: 'בוקר או ערב?',
  english: 'Morning or evening?',
}

/**
 * Given the recent conversation, if the prior assistant turn asked
 * "morning or evening?" and the latest user turn answers it,
 * return the resolved HH:MM string. Otherwise return null.
 */
export function getAmbiguityResolution(msgs: ChatMsg[]): string | null {
  if (msgs.length < 3) return null
  const last = msgs[msgs.length - 1]
  const prevAssist = msgs[msgs.length - 2]
  const prevUser = msgs[msgs.length - 3]
  if (prevAssist?.role !== 'assistant') return null

  const prevAssistContent = typeof prevAssist?.content === 'string' ? prevAssist.content : ''
  const lastContent = typeof last.content === 'string' ? last.content : ''
  const prevUserContent = typeof prevUser?.content === 'string' ? prevUser.content : ''

  const wasQuestion = /בוקר או ערב|morning or evening/i.test(prevAssistContent)
  if (!wasQuestion) return null

  const isEvening = /ערב|evening|pm/i.test(lastContent)
  const isMorning = /בוקר|morning|am/i.test(lastContent)
  if (!isEvening && !isMorning) return null

  // Extract hour from original user message
  const digitMatch = prevUserContent.match(/\b([1-9]|1[0-2])\b/)
  let hour: number | null = null
  if (digitMatch) {
    hour = parseInt(digitMatch[1])
  } else {
    for (const [word, h] of Object.entries(HEBREW_HOURS)) {
      if (prevUserContent.includes(word)) { hour = h; break }
    }
  }
  if (hour === null) return null

  const h24 = isEvening ? (hour < 12 ? hour + 12 : hour) : (hour === 12 ? 0 : hour)
  return `${String(h24).padStart(2, '0')}:00`
}
