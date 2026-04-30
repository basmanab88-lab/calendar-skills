// System-prompt rule blocks for calendar / time handling.
// Apps consume these by injecting them into their system prompts.
// All time/calendar prompt rules across Basman's apps live here — single source of truth.

/**
 * The TIME PARSING + RELATIVE TIME + AMBIGUOUS TIME rule blocks.
 * Insert into the bot's system prompt. The strings are battle-tested in T-800.
 */
export const TIME_RULES = {
  /** Basic time parsing rules — minutes default, period words, etc. */
  timeParsing: `TIME PARSING (minutes are ALWAYS :00 unless stated):
- scheduled_time MUST be HH:MM format (2 parts only, e.g. "22:00" not "22:00:00").
- "7 evening" = 19:00, "8 morning" = 08:00, "3 afternoon" = 15:00
- The number is the HOUR only. Never use it as minutes.`,

  /** Relative time handling — must override any AM/PM ambiguity rule. */
  relativeTime: `RELATIVE TIME (CRITICAL — overrides AM/PM ambiguity rules):
- "in 10 minutes", "עוד 10 דקות", "in half an hour", "עוד חצי שעה", "in 2 hours", "בעוד שעתיים", "from now", "מעכשיו" → these are RELATIVE to current time.
- NEVER ask "morning or evening?" for relative-time expressions — the answer is always determined by CURRENT TIME + offset.
- Use the CURRENT TIME injected as a system message + the offset. If the server injects a scheduled_date/scheduled_time hint, use those values exactly.
- If the resolved time is within the next 24 hours, create as a timed event (scheduled_date + scheduled_time).
- Numbers in relative expressions are MINUTES or HOURS (per the unit word — דקות/דקה=minutes, שעות/שעה=hours), NOT clock hours.`,

  /** AM/PM ambiguity handling — when bare hours 1-12 are given. */
  ambiguousTime: `AMBIGUOUS TIME:
  a. HH:MM with explicit minutes (e.g. "11:45", "3:30", "9:15") -> NEVER ask morning/evening. For hours 7-12 with minutes, assume morning/AM. For hours 1-6 with minutes, assume afternoon/PM. This is because users who mean 23:45 would write "23:45", not "11:45".
  b. Single hour 1-12 WITHOUT minutes: FIRST check conversation context — if the conversation is about afternoon/evening activities, infer without asking.
  c. If the user is discussing or modifying a nearby time (e.g. has a 3pm task and says "actually make it 2"), pick the closest logical time — NEVER ask.
  d. ONLY ask "morning or evening?" when a bare hour 1-6 is given with NO conversation context at all. Hours 7-12 alone default to morning. Hours 13-23 are always clear.`,

  /** Rescheduling — overrides ambiguous-time question because existing time disambiguates. */
  rescheduling: `RESCHEDULING (OVERRIDES ambiguous-time rules AND all user personal rules about ambiguous hours):
  When the user asks to MOVE, RESCHEDULE, or CHANGE TIME of an EXISTING event, NEVER ask morning/evening. Instead:
  a. FIRST: call query_items to get the item and its ACTUAL scheduled_time from the database.
  b. Relative move ("move 1 hour forward/back", "half hour earlier") -> add/subtract from the ACTUAL time in DB.
  c. "Move from X to Y" or "move to Y" -> use the ACTUAL time in DB to determine AM/PM of Y. If event is at 18:00 and user says "move to 5" -> 17:00. If at 06:00 and user says "move to 5" -> 05:00. The DB time is the source of truth.
  d. This rule has ABSOLUTE PRIORITY over any other ambiguous-time rule. When rescheduling, NEVER ask "morning or evening?" — the answer is always determined by the existing event time.`,
}

/**
 * All time-related rules concatenated, in the order they should appear in a system prompt.
 */
export function allTimeRules(): string {
  return [
    TIME_RULES.timeParsing,
    TIME_RULES.relativeTime,
    TIME_RULES.ambiguousTime,
    TIME_RULES.rescheduling,
  ].join('\n')
}

/**
 * Build the dynamic CURRENT TIME / DATE REFERENCE system message for a given moment.
 * Inject this each turn so the model has live now/date context.
 *
 * @param opts.timeZone IANA TZ (default Asia/Jerusalem)
 * @param opts.now Override now (for tests)
 * @returns Two system-message contents (date reference + current time)
 */
export function buildTimeContextMessages(
  opts: { timeZone?: string; now?: Date } = {},
): { dateReference: string; currentTime: string } {
  const timeZone = opts.timeZone ?? 'Asia/Jerusalem'
  const now = opts.now ?? new Date()

  // today in the target TZ
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const today = dateFmt.format(now)
  const parts = today.split('-').map(Number)
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  const addDays = (base: Date, n: number) => {
    const r = new Date(base)
    r.setUTCDate(r.getUTCDate() + n)
    return r.toISOString().slice(0, 10)
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const todayDayName = dayNames[d.getUTCDay()]

  // Late-night rule: between midnight and 6am, "tomorrow" = today (user hasn't slept)
  let currentHour = 12
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(now)
    currentHour = parseInt(hourStr) % 24
  } catch { /* keep default */ }
  const isLateNight = currentHour >= 0 && currentHour < 6
  const tomorrowDate = isLateNight ? today : addDays(d, 1)
  const dayAfterDate = isLateNight ? addDays(d, 1) : addDays(d, 2)
  const lateNightNote = isLateNight
    ? ` (LATE NIGHT MODE: it's past midnight but before 6 AM, so "tomorrow/מחר" = today ${today})`
    : ''

  const dateReference =
    `DATE REFERENCE (use these EXACT dates, do NOT calculate yourself): today=${today} (${todayDayName}), tomorrow=${tomorrowDate}, day after tomorrow=${dayAfterDate}, yesterday=${addDays(d, -1)}. ALWAYS use these values for scheduled_date.${lateNightNote}`

  // Current HH:MM in target TZ
  let nowHHMM = ''
  try {
    nowHHMM = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now)
  } catch { /* skip */ }

  const currentTime =
    `CURRENT TIME (${timeZone}, 24-hour): ${nowHHMM}. For relative expressions like "in 10 minutes" / "עוד עשר דקות" / "in half an hour" / "עוד חצי שעה", compute scheduled_time = current time + offset. If the result crosses midnight, use the next day's date. NEVER ask "morning or evening?" for relative times.`

  return { dateReference, currentTime }
}
