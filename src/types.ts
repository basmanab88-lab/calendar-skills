// Shared types for calendar-skills

export type ChatMsg = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | unknown
}

export type ResolvedDateTime = {
  /** YYYY-MM-DD in target timezone */
  date: string
  /** HH:MM in target timezone, 24-hour */
  time: string
}
