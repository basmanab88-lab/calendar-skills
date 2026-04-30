# calendar-skills

Shared Google Calendar + Hebrew/English time-parsing logic for Basman's apps.

**Single source of truth.** All calendar/time intelligence used by T-800, HandyMan, and future apps lives here. Fixes made here propagate to every consuming app via Dependabot or manual version bump — never edit the logic directly in the apps.

## Why

Without a shared module, calendar improvements made in T-800 silently drift away from HandyMan and any future app. This repo exists to compound learnings: every fix lands once and benefits all apps.

## What's in here

- **`resolveRelativeTime(text)`** — parse Hebrew + English relative-time expressions ("עוד 10 דקות", "in half an hour", "בעוד שעתיים") into absolute `{date, time}` in Asia/Jerusalem (or any IANA TZ).
- **`isRelativeTime(text)`** — detector for relative-time markers; useful as a guard.
- **`detectAmbiguousTime(text)`** — true if the user gave a bare hour 1-12 with scheduling context but no AM/PM.
- **`getAmbiguityResolution(msgs)`** — when the bot asked "morning or evening?", parse the user's reply and return the resolved HH:MM.
- **`TIME_RULES`** + **`allTimeRules()`** — system-prompt rule blocks (RELATIVE TIME, AMBIGUOUS TIME, RESCHEDULING, TIME PARSING) — inject into the bot's system prompt.
- **`buildTimeContextMessages({ timeZone, now })`** — generates DATE REFERENCE + CURRENT TIME system messages with late-night handling.

## Usage

### Deno (Supabase Edge Functions)

```ts
import {
  resolveRelativeTime,
  detectAmbiguousTime,
  buildTimeContextMessages,
} from "https://raw.githubusercontent.com/basmanab88-lab/calendar-skills/v1.0.0/src/index.ts"

const result = resolveRelativeTime("תוסיף משימה לעוד עשר דקות")
// → { date: "2026-04-30", time: "14:32" }
```

Pin to a tagged version (e.g. `v1.0.0`) to avoid surprises. To upgrade, bump the version in the URL.

### Node / Vite frontend

Install from GitHub:

```bash
npm install github:basmanab88-lab/calendar-skills#v1.0.0
```

Then:

```ts
import { resolveRelativeTime } from "@basmanab88-lab/calendar-skills"
```

## Versioning

Semver. Patch for bug fixes, minor for new helpers, major for breaking API changes.

## Contributing (= the workflow)

When you find a calendar/time bug in any of Basman's apps:

1. **Do not fix it in the app's repo.** Find the relevant function here.
2. Edit the code in this repo.
3. Bump the version: `npm version patch` (or run `git tag vX.Y.Z` manually).
4. `git push && git push --tags`.
5. Create a GitHub release for the new tag (`gh release create vX.Y.Z`).
6. **The `notify-consumers` workflow auto-opens a PR in T-800 (and any other registered consumer) bumping the version pin.** Merge the PR to deploy.

## Auto-propagation setup (one-time)

For the auto-PR workflow to work, this repo needs a secret named `CONSUMER_PAT`:

- A GitHub Personal Access Token (PAT) with `repo` scope on each consumer repo (T-800, HandyMan, etc.)
- Stored as a secret: `gh secret set CONSUMER_PAT --body "$YOUR_PAT" --repo basmanab88-lab/calendar-skills`

To register a new consumer app, edit `.github/workflows/notify-consumers.yml` and add another job mirroring `bump-t-800`.

## License

MIT
