// Relative time resolver — parses Hebrew + English relative time expressions
// ("in 10 minutes", "עוד חצי שעה", "בעוד שעתיים") into absolute date+time
// in a target timezone (default Asia/Jerusalem).

import type { ResolvedDateTime } from "./types.ts"

const HEBREW_NUMS: Record<string, number> = {
  'אחת': 1, 'אחד': 1, 'שתיים': 2, 'שתים': 2, 'שניים': 2, 'שלוש': 3, 'שלושה': 3,
  'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6,
  'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
  'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50,
}

/**
 * Detects whether a text contains a relative-time expression.
 * Use this to bypass AM/PM ambiguity guards.
 */
export function isRelativeTime(text: string): boolean {
  if (/(?:עוד|בעוד|תוך)\s+(?:[^\s]+\s+)?(?:דקות|דקה|שעות|שעה|שניות|שניה|חצי|רבע)/i.test(text)) return true
  if (/מעכשיו|מעכשו/.test(text)) return true
  if (/\bin\s+(?:a\s+|an\s+|\d+\s*)(?:minutes?|mins?|hours?|hrs?|seconds?|secs?)\b/i.test(text)) return true
  if (/\bfrom\s+now\b/i.test(text)) return true
  if (/\bhalf\s+an?\s+hour\b/i.test(text)) return true
  if (/\bquarter\s+(?:of\s+)?an?\s+hour\b/i.test(text)) return true
  return false
}

/**
 * Parse a relative-time expression and return absolute date+time.
 *
 * Examples:
 *   resolveRelativeTime("תוסיף משימה לעוד 10 דקות")  → { date: "2026-04-30", time: "14:32" }
 *   resolveRelativeTime("in half an hour")            → now + 30min in target TZ
 *   resolveRelativeTime("בעוד שעתיים")                → now + 2h in target TZ
 *
 * @param text User message text
 * @param opts.timeZone IANA timezone (default "Asia/Jerusalem")
 * @param opts.now Override "now" for testing (default: new Date())
 * @returns Resolved {date, time} or null if no relative-time pattern matched
 */
export function resolveRelativeTime(
  text: string,
  opts: { timeZone?: string; now?: Date } = {},
): ResolvedDateTime | null {
  const timeZone = opts.timeZone ?? "Asia/Jerusalem"
  const nowMs = (opts.now ?? new Date()).getTime()

  let totalMinutes = 0
  let matched = false

  // Hebrew minutes: עוד/בעוד/תוך [number] דקות/דקה
  const heMin = text.match(/(?:עוד|בעוד|תוך)\s+(?:(\d+)|([֐-׿]+))\s+(?:דקות|דקה)/)
  if (heMin) {
    const num = heMin[1] ? parseInt(heMin[1]) : (HEBREW_NUMS[heMin[2]] ?? 0)
    if (num) { totalMinutes += num; matched = true }
  }
  // Hebrew hours: עוד/בעוד/תוך [number] שעות/שעה
  const heHour = text.match(/(?:עוד|בעוד|תוך)\s+(?:(\d+)|([֐-׿]+))\s+(?:שעות|שעה)/)
  if (heHour) {
    const num = heHour[1] ? parseInt(heHour[1]) : (HEBREW_NUMS[heHour[2]] ?? 0)
    if (num) { totalMinutes += num * 60; matched = true }
  }
  // שעתיים = 2 hours
  if (/(?:עוד|בעוד|תוך)\s+שעתיים/.test(text)) { totalMinutes += 120; matched = true }
  // חצי שעה / רבע שעה
  if (/(?:עוד|בעוד|תוך)\s+חצי\s+שעה/.test(text)) { totalMinutes += 30; matched = true }
  if (/(?:עוד|בעוד|תוך)\s+רבע\s+שעה/.test(text)) { totalMinutes += 15; matched = true }
  // עוד שעה / עוד דקה (no number)
  if (!matched && /(?:עוד|בעוד|תוך)\s+שעה(?!\s*\d)/.test(text)) { totalMinutes += 60; matched = true }
  if (!matched && /(?:עוד|בעוד|תוך)\s+דקה(?!\s*\d)/.test(text)) { totalMinutes += 1; matched = true }

  // English minutes
  const enMin = text.match(/\bin\s+(\d+|a|an)\s*(?:minutes?|mins?)\b/i)
  if (enMin) {
    const num = /^an?$/i.test(enMin[1]) ? 1 : parseInt(enMin[1])
    totalMinutes += num; matched = true
  }
  // English hours
  const enHour = text.match(/\bin\s+(\d+|a|an)\s*(?:hours?|hrs?)\b/i)
  if (enHour) {
    const num = /^an?$/i.test(enHour[1]) ? 1 : parseInt(enHour[1])
    totalMinutes += num * 60; matched = true
  }
  if (/\bhalf\s+an?\s+hour\b/i.test(text)) { totalMinutes += 30; matched = true }
  if (/\bquarter\s+(?:of\s+)?an?\s+hour\b/i.test(text)) { totalMinutes += 15; matched = true }

  if (!matched || totalMinutes <= 0) return null

  const future = new Date(nowMs + totalMinutes * 60_000)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
    const parts = fmt.formatToParts(future)
    const get = (t: string) => parts.find(p => p.type === t)?.value || ''
    let hour = get('hour')
    if (hour === '24') hour = '00'
    const date = `${get('year')}-${get('month')}-${get('day')}`
    const time = `${hour}:${get('minute')}`
    return { date, time }
  } catch {
    // Fallback: assume UTC+3 (Israel default, covers most of year)
    const ms = future.getTime() + 3 * 3600_000
    const d = new Date(ms)
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toISOString().slice(11, 16),
    }
  }
}
