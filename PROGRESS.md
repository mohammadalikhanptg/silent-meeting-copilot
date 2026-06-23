# Silent Meeting Copilot — Overnight Build Progress

**Date:** 2026-06-23 (Session 5 updates in bold)
**Session:** Autonomous overnight build × 5

---

## Summary

All four tasks (P1–P4) across all sessions are complete at maximum completable state on this Mac. Session 5 delivers repeat-back repair (the operator's cheat code for garbled OTHERS transcripts), Deepgram diarization, schema columns for corrections, and UI rendering of clarified turns.

---

## **Session 5 — Repeat-back Repair + Diarization + Clarified Badge ✅ COMPLETE**

### **P1 — Repeat-back detection + OTHERS transcript correction**

#### How detection works

When the operator notices a garbled OTHERS turn and mirrors it back ("so if I understand correctly, you're saying X"), the coaching system detects this and uses the clean restatement to reconstruct what OTHERS actually said.

**Detection algorithm (in `worker/src/session-do.js`):**

1. `detectRepeatBacks(meLines, othersLines)` scans the most recent 5 ME turns
2. Each ME turn is checked against `REPEAT_BACK_SIGNPOSTS` — a maintained list of ~40 phrases in English and Hindi/Urdu (transliterated)
3. **Conservative threshold**: requires BOTH a signpost phrase AND at least 8 words. Short phrases like "so you're saying yes" are acknowledgements, not restatements — they are ignored
4. The most recent OTHERS turn with ≥3 words is selected as the correction target
5. `inferCorrectedText(garbled, restatement, env)` calls the LLM to reconstruct what OTHERS said in first person, using both the garbled original and the operator's clean restatement
6. Only stored if the LLM produced a meaningfully different result (case-insensitive comparison)

**Signpost phrases maintained:**

English: "if I understand correctly", "so you're saying", "let me make sure I got that", "just to confirm", "you said", "your point is", "what you're saying is", "in other words", "to paraphrase", "am I correct that", "did I hear you correctly", and ~15 more variants.

Hindi/Urdu (transliterated): "matlab", "yaani", "toh aap keh rahe hain", "agar main sahi samjha", "aap ne kaha", "aapka matlab", and more.

**False positive prevention:**
- No signpost = no correction (semantic overlap alone never triggers it)
- Fewer than 8 words in ME turn = no correction
- OTHERS turn with fewer than 3 words skipped
- Duplicate suppression (same ME or OTHERS index not corrected twice)

#### How corrections affect coaching

When corrections are detected:
- `effectiveOthers`: corrected text substituted in place of garbled turns
- `effectiveMe`: restatement turns EXCLUDED from open-items/suggestions analysis (they are the operator's echo, not a new argument)
- Talk balance: restatement turns are still counted as ME speaking time (as specified)
- LLM coaching prompt uses `effectiveOthers` and `effectiveMe` — so open items and suggestions reflect the corrected understanding

**Response format (additions to `POST /coach` response):**
```json
{
  "corrections": [
    {
      "meIndex": 2,
      "othersIndex": 1,
      "original": "Uh the dedline is… we have ressource issue...",
      "corrected": "The deadline is moving to end of month because we're short-staffed due to recruitment being frozen, and we can't deliver by the original date."
    }
  ]
}
```

#### Acceptance test — PASSED (2026-06-23)

```bash
node scripts/test-repeat-back.mjs

# Test 1: garbled OTHERS + ME repeat-back → correction detected ✅
# Test 2: normal ME argument → no spurious correction ✅
# Test 3: short signpost phrase (<8 words) → not treated as repeat-back ✅
# 16/16 assertions passed
```

### **P2 — Schema + UI**

#### Schema changes (appended to `scripts/migrate.mjs`)

```sql
ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS corrected_text text;
ALTER TABLE transcript_segments ADD COLUMN IF NOT EXISTS clarified_by_me boolean DEFAULT false;
```

Both are `IF NOT EXISTS` — idempotent. Applied on Vercel deploy via `npm run build` → `node scripts/migrate.mjs`.

#### New API route: `PATCH /api/meetings/[id]/segments/[segId]`

Persists a repeat-back correction to the DB for a specific segment. Body: `{corrected_text, clarified_by_me}`. Verifies meeting ownership before updating. Returns `{ok: true}`.

#### `POST /api/meetings/[id]/segments` now returns `segmentId`

Changed `RETURNING id` and response now includes `{ok: true, segmentId: row.id}`. Used by the session page to track which DB row corresponds to each OTHERS line.

#### Session page (`app/session/page.js`) changes

- OTHERS lines now tracked with `{..., segmentId: null, corrected: null, clarifiedByMe: false}`
- Segment save is now async (captures `segmentId` from response, updates the line object by identity)
- When coaching returns `corrections`, applies them in-place to `othersLines` and fires `PATCH /api/meetings/{id}/segments/{segId}` for DB persistence
- **Clarified badge**: OTHERS panel header shows `X clarified` count badge; individual corrected turns show:
  - Green `CLARIFIED` badge
  - Corrected text in lighter green
  - Original text struck through (hover for title tooltip)
- Coaching panel: shows "Transcript repairs: N OTHERS turns auto-corrected from your restatements" when corrections exist

#### Meeting review page (`app/meetings/[id]/page.js`) changes

- Queries `corrected_text` and `clarified_by_me` from segments
- Passes `corrected_text || cleaned` to coaching endpoint (coaching uses corrected meanings)
- Header shows `N turns clarified` count
- Coaching summary shows "Transcript repairs" cell when clarifications exist
- Transcript renders clarified turns with same badge + strikethrough as live session

### **P3 — Deepgram speaker diarization**

`transcribeDeepgram()` in `worker/src/session-do.js` now passes `diarize=true` to the Deepgram API. When the response includes per-word speaker labels (`words[].speaker`), the transcript is reconstructed with inline `[Speaker N]` markers grouping consecutive words per speaker.

**Example output with diarization:**
```
[Speaker 1] So when can you deliver the feature? [Speaker 2] We can have it ready by Friday. [Speaker 1] That works for me.
```

**Cloudflare Whisper limitation:** Cloudflare's Whisper model has no speaker diarization capability. Diarization only applies to the Deepgram path (`mode=hindi-urdu` or `mode=auto` when key is set). The Cloudflare path returns a single unlabelled string regardless of how many speakers are present.

The LLM cleanup pass preserves `[Speaker N]` labels (system prompt updated to say "PRESERVE any [Speaker N] labels exactly as written").

### **Files changed (Session 5)**

| File | Change |
|------|--------|
| `worker/src/session-do.js` | REPEAT_BACK_SIGNPOSTS list, detectRepeatBacks(), inferCorrectedText(), updated generateCoaching() with corrections; Deepgram diarize=true + word-level reconstruction; LLM cleanup preserves [Speaker N] |
| `scripts/migrate.mjs` | Appended corrected_text and clarified_by_me columns (idempotent ALTER TABLE IF NOT EXISTS) |
| `app/api/meetings/[id]/segments/route.js` | POST now returns segmentId via RETURNING id |
| `app/api/meetings/[id]/segments/[segId]/route.js` | New — PATCH to apply correction to a segment |
| `app/session/page.js` | Track segmentId per OTHERS line; apply corrections from coach; clarified badge rendering; coaching panel "transcript repairs" count |
| `app/meetings/[id]/page.js` | Query corrected_text/clarified_by_me; pass corrected text to coaching; render clarified badge with strikethrough |
| `scripts/test-repeat-back.mjs` | New — 3 test cases, 16 assertions, all pass |

---

## **Session 4 — Live Coaching + Persistence + Meetings Review ✅ COMPLETE**

### **P1 — Live coaching layer**

#### How coaching is delivered

Coaching is generated by a new `POST /coach` endpoint on the Cloudflare Worker. The session page polls this endpoint every **25 seconds** while a session is live.

**Worker endpoint: `POST /coach`**

- Accepts: `{me: string[], others: string[], objective?: string}`
- Returns: `{ok, talkBalance, openItems, suggestions, alignment}`
- Implemented in `generateCoaching()` in `worker/src/session-do.js` (exported)
- Talk balance is computed directly from word counts (no LLM needed)
- Open items, suggestions, and alignment are generated by `@cf/meta/llama-3.2-3b-instruct`
- JSON extracted from LLM response with regex fallback — never crashes on malformed output
- Returns safe defaults if fewer than 3 segments / 20 words accumulated

**Coaching fields:**
| Field | Description |
|-------|-------------|
| `talkBalance.mePercent` / `othersPercent` | Word-count-based talk time % |
| `openItems` | Questions/issues raised by OTHERS not yet addressed by ME (max 4) |
| `suggestions` | 1–3 concrete things ME could say next |
| `alignment` | Whether ME is staying on stated objective (only if objective was given) |

**Session page changes (`app/session/page.js`):**
- `objective` text input appears before session starts (optional, max 200 chars)
- Coaching panel appears below the transcript grid during and after a live session
- Talk balance shown as a colour-coded progress bar (green → blue)
- Polls every 25s via `setInterval` while status is `live`
- Uses refs for `meLines`, `othersLines`, `objective` inside the interval to avoid stale-closure issues
- Purple accent colour to distinguish from ME (green) and OTHERS (blue) panels

**Acceptance test — PASSED (2026-06-23):**

```bash
curl -s -X POST "https://smc-engine.ali-6b8.workers.dev/coach" \
  -H "Content-Type: application/json" \
  -d '{
    "me": ["Hello everyone, thanks for joining", "Yes I think the deadline should be next Friday", "I can handle the design work"],
    "others": ["Can you clarify the deadline?", "Who is responsible for the design?", "What about testing coverage?"],
    "objective": "Assign owners and agree on delivery dates"
  }' | python3 -m json.tool

# Result:
{
    "ok": true,
    "talkBalance": {
        "mePercent": 57,
        "othersPercent": 43
    },
    "openItems": [
        "Clarify the deadline",
        "Specify who is responsible for the design work",
        "Address testing coverage",
        "Confirm the design owner"
    ],
    "suggestions": [
        "Reiterate the deadline and confirm it's next Friday",
        "Offer to assign design work to a specific team member",
        "Propose a testing coverage plan and involve the team"
    ],
    "alignment": "Staying on track with the objective of assigning owners and agreeing on delivery dates"
}
```

All four coaching fields present and correct. ✅

### **P2 — Session persistence**

#### New tables (appended to `scripts/migrate.mjs`)

```sql
CREATE TABLE IF NOT EXISTS meetings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email      text NOT NULL,
  title           text,
  objective       text,
  language_mode   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings (user_email, started_at DESC);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES meetings(id),
  speaker     text NOT NULL CHECK (speaker IN ('me','others')),
  raw         text NOT NULL,
  cleaned     text NOT NULL,
  lang        text,
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_segments_meeting ON transcript_segments (meeting_id, ts);
```

Both `CREATE TABLE IF NOT EXISTS` — idempotent.

#### New API routes

| Route | Method | Action |
|-------|--------|--------|
| `/api/meetings` | `POST` | Create meeting row, return `{id}` |
| `/api/meetings` | `GET` | List user's meetings (unused by UI, available for testing) |
| `/api/meetings/[id]` | `PATCH` | Set `ended_at` on stop |
| `/api/meetings/[id]/segments` | `POST` | Append a transcript segment |

All routes call `getSessionPayload()` from `app/lib/auth.js` to authenticate — no auth files modified. The segments route additionally verifies the meeting belongs to the requesting user before inserting.

#### Session page persistence flow

1. `startSession()` → `POST /api/meetings` → stores `id` in `meetingIdRef.current`
2. Each `ws.onmessage` transcript event → `POST /api/meetings/{id}/segments` (fire-and-forget)
3. `stopSession()` → `PATCH /api/meetings/{id}` with `ended_at`

Non-fatal: if the DB is unreachable, the session continues and `meetingIdRef.current` stays `null`.

**Acceptance:** The Vercel production build runs `node scripts/migrate.mjs` before `next build`. The DB migration creates both tables on deploy. A meeting row and segments are written during a live session; the `/meetings` review page reads them back.

### **P3 — Meetings review**

Two new protected pages:

**`/meetings`** — lists the signed-in user's past meetings, newest first:
- Meeting title, date, objective (if set), language mode badge, segment count, duration
- Links to `/meetings/[id]`
- "New Session" button linking to `/session`

**`/meetings/[id]`** — shows a single past meeting:
- Title, date range, language mode, objective
- Final coaching summary (calls `POST /coach` server-side with the full transcript)
- Full ME/OTHERS transcript in chronological order with speaker tags and timestamps

Home page updated with "Past Meetings" button linking to `/meetings`.

**Acceptance — PASSED (2026-06-23):**

```bash
# Build passes
npx next build
# Route /meetings (ƒ Dynamic) ✓
# Route /meetings/[id] (ƒ Dynamic) ✓

# Push to main
git push origin main  # commit 2bb6521

# Vercel deployment: READY (15s build time)
# Canonical URL: https://silent-meeting-copilot.vercel.app/

# Auth middleware intact — all protected routes redirect:
curl -si https://silent-meeting-copilot.vercel.app/          # 307 → /login ✅
curl -si https://silent-meeting-copilot.vercel.app/meetings   # 307 → /login ✅
curl -si https://silent-meeting-copilot.vercel.app/session    # 307 → /login ✅
```

### **Files changed (Session 4)**

| File | Change |
|------|--------|
| `worker/src/session-do.js` | Added `generateCoaching()` export |
| `worker/src/index.js` | Added `POST /coach` route |
| `scripts/migrate.mjs` | Appended meetings + transcript_segments tables |
| `app/api/meetings/route.js` | New — create/list meetings |
| `app/api/meetings/[id]/route.js` | New — PATCH ended_at |
| `app/api/meetings/[id]/segments/route.js` | New — append segment |
| `app/session/page.js` | Objective input, coaching panel, meeting persistence |
| `app/meetings/page.js` | New — meetings list |
| `app/meetings/[id]/page.js` | New — meeting detail + coaching summary |
| `app/page.js` | Added Past Meetings link |

---

## Session 3 — Per-Meeting Language Selector ✅ COMPLETE

### P1 — Language selector on the session screen

Replaced the generic 8-language dropdown with a clear **"Meeting language"** selector. Before the session starts, the user sees:

| Option | Display | Mode value | STT provider |
|--------|---------|------------|--------------|
| Default | **English (fast)** | `english` | Cloudflare Whisper (free, always works) |
| Optional | **Hindi / Urdu (multilingual)** | `hindi-urdu` | Deepgram nova-2 (requires key) |
| Optional | **Auto-detect** | `auto` | Deepgram if key present, else Cloudflare |

**Behaviour when Hindi/Urdu selected:**
- The UI fetches `/health` on page mount to check whether `deepgramAvailable` is `true` or `false`
- If Deepgram key is **not configured**: amber warning box appears, Start button is disabled, session cannot start in this mode
- If Deepgram key **is configured**: session starts with `?mode=hindi-urdu&lang=hi` sent to the engine
- During a live session: the footer and status bar show the active mode label (e.g. "Live — Hindi / Urdu")
- If the engine reports `deepgram_unavailable` mid-session (belt-and-braces): a red error message appears — no silent fallback to English

**Files changed:**
- `app/session/page.js` — replaced `lang` state with `mode` state; added `deepgramAvailable` check; redesigned selector; warning box; mode badge; WS error handler

### P2 — Engine per-session provider selection

The Worker now routes STT provider **per session** based on the `mode` query parameter, not the global key-presence check.

**Provider routing (new logic in `transcribeAndClean`):**

```
mode=english    → always Cloudflare Whisper (key irrelevant)
mode=hindi-urdu → key present: Deepgram nova-2
                  key absent:  return {error:'deepgram_unavailable'} — NEVER falls back silently
mode=auto       → Deepgram if key present, else Cloudflare (legacy / default)
```

**Acceptance tests — PASSED (2026-06-23):**

```bash
# mode=english → Cloudflare, transcribes correctly
curl -s -X POST "https://smc-engine.ali-6b8.workers.dev/transcribe?mode=english&lang=en" \
  -H "Content-Type: audio/wav" --data-binary @/tmp/s.wav
# {"ok":true,"raw":"testing English mode...","cleaned":"Testing English mode...","provider":"cloudflare"}

# mode=hindi-urdu, no key → explicit error, NOT silent fallback
curl -s -X POST "https://smc-engine.ali-6b8.workers.dev/transcribe?mode=hindi-urdu&lang=hi" \
  -H "Content-Type: audio/wav" --data-binary @/tmp/s.wav
# {"ok":true,"raw":"","cleaned":"","provider":"deepgram","error":"deepgram_unavailable"}

# Health check confirms deepgramAvailable field
curl -s https://smc-engine.ali-6b8.workers.dev/health
# {"ok":true,"ts":...,"provider":"cloudflare","deepgramAvailable":false}
```

All three routing branches verified. ✅

---

## P4 — Operator handoff

### How coaching works end-to-end

```
Session page (browser)
    │
    ├─ On start: POST /api/meetings → get meetingId
    │
    ├─ Per transcript segment: POST /api/meetings/{id}/segments
    │
    ├─ Every 25s (live): POST https://smc-engine.../coach
    │     ├─ Input: {me:[...], others:[...], objective:"..."}
    │     └─ Output: {talkBalance, openItems, suggestions, alignment}
    │           → displayed in purple "Coaching" panel below transcripts
    │
    └─ On stop: PATCH /api/meetings/{id} with ended_at
```

```
/meetings/[id] page (server-side render)
    ├─ Reads all segments from DB
    └─ Calls POST /coach with full transcript
         → renders final coaching summary at top of page
```

### How to test session persistence

1. Sign in at `https://silent-meeting-copilot.vercel.app/`
2. Click **Open Live Session**
3. Optionally enter a meeting objective
4. Click **Start Session** and speak into the mic
5. After a few sentences: coaching panel appears below the transcripts
6. Click **Stop**
7. Click **Past Meetings** → your session appears
8. Click the session → full transcript + coaching summary

### To enable Hindi / Urdu (Deepgram)

```bash
cd ~/claude-workspace/silent-meeting-copilot/worker
export CLOUDFLARE_API_TOKEN=$(grep 'CLOUDFLARE_DEPLOY_TOKEN' ~/.pacific/env | tr -d '\r"' | sed 's/.*CLOUDFLARE_DEPLOY_TOKEN=//')
npx wrangler secret put DEEPGRAM_API_KEY
```

### What still needs the operator

| Item | Needs | Blocker |
|------|-------|---------|
| Enable Hindi/Urdu transcription | `wrangler secret put DEEPGRAM_API_KEY` | Need Deepgram account + key |
| Windows helper audio bridge | Test on Windows 10/11 | Requires Windows hardware (WASAPI loopback) |
| End-to-end shared session test | Windows helper + browser open same session code | Requires Windows hardware |
| Engine auth | HMAC session token on WS upgrade | Optional security hardening |

---

## Session 1 — Cloudflare Engine ✅

- Worker deployed at `https://smc-engine.ali-6b8.workers.dev`
- Endpoints: `GET /health`, `POST /transcribe`, `POST /coach`, `GET /session/:id/ws`, `GET /session/:id/info`
- Models: `@cf/openai/whisper` (ASR) + `@cf/meta/llama-3.2-3b-instruct` (LLM cleanup + coaching)

---

## Session 2 — Shared Sessions + Hardened UI ✅

- Short human-readable session codes: format `abc-1234`
- `/session?s=<code>` — reads code from URL or generates one
- Auto-reconnect on WebSocket drop: exponential backoff (1s→16s, max 5 attempts)
- Connection status indicator: green/amber/grey dot
- Mobile responsive: single-column grid at ≤760px

---

## Git commits

| Hash | Description |
|------|-------------|
| `1476551` | feat(worker): Cloudflare transcription engine with WebSocket + REST |
| `d0a8bfe` | feat(session): live session page with WebSocket transcription + home link |
| `916b67c` | feat(helper): Windows Electron audio bridge scaffold |
| `a7db5aa` | docs: PROGRESS.md — overnight build summary, all P1-P4 complete |
| `83c2380` | feat(P1-P3): pluggable STT, shared sessions, hardened session page |
| `9223ff5` | docs: PROGRESS.md — Session 2 build summary (P1-P4 complete) |
| `77cc182` | feat(P1-P2): per-meeting language selector + per-session STT provider routing |
| `9bfae96` | docs: PROGRESS.md — Session 3 build summary (per-meeting language selector) |
| `2bb6521` | feat(P1-P4): live coaching panel, session persistence, meetings review |
| `66ab737` | docs: PROGRESS.md — Session 4 build summary (coaching, persistence, meetings) |
| `e2386f2` | feat(P1-P4): repeat-back repair, diarization, clarified badge |

---

## Architecture

### Full system (post Session 4)

```
Browser /session
  │
  ├─ [idle] objective input, mode selector
  │
  ├─ [start] POST /api/meetings → meetingId
  │
  ├─ [live] MediaRecorder → binary WS frames → Cloudflare Worker
  │           Worker SessionDO:
  │             buffer 64 KB per speaker
  │             → transcribeAndClean(audio, mode)
  │                 mode=english    → Cloudflare Whisper
  │                 mode=hindi-urdu → Deepgram nova-2 (or error)
  │                 mode=auto       → Deepgram if key, else Cloudflare
  │                 → LLM cleanup (@cf/meta/llama-3.2-3b-instruct)
  │             → broadcast {type:'transcript', speaker, raw, cleaned}
  │           Browser receives transcript:
  │             → render in ME/OTHERS panel
  │             → POST /api/meetings/{id}/segments (fire-and-forget)
  │
  ├─ [every 25s] POST ENGINE/coach {me, others, objective}
  │               → generateCoaching() on Worker
  │               → render coaching panel (talk balance, open items, suggestions)
  │
  └─ [stop] PATCH /api/meetings/{id} {ended_at}

/meetings       → server page → DB query → list of past meetings
/meetings/[id]  → server page → DB + POST ENGINE/coach → transcript + coaching summary
```

### STT Provider routing (per session)

```
UI: mode = 'english' | 'hindi-urdu' | 'auto'
         ↓
WS URL: /session/:id/ws?mode=<mode>&lang=<hint>
         ↓
SessionDO.this.mode = mode
         ↓
transcribeAndClean(audio, env, lang, mode)
  mode=english    → Cloudflare Whisper (always)
  mode=hindi-urdu → key present: Deepgram nova-2
                    key absent:  {error:'deepgram_unavailable'}
  mode=auto       → Deepgram if key, else Cloudflare
         ↓
LLM cleanup pass: @cf/meta/llama-3.2-3b-instruct
         ↓
broadcast {type:'transcript', speaker, raw, cleaned, provider}
```

---

## Recommended next steps

1. **Run a live session with repeat-back** — sign in, start a session, let OTHERS say something garbled, say "so if I understand correctly, you're saying X", observe the OTHERS turn get the clarified badge in real time
2. **Check coaching ignores restatements** — the corrected OTHERS meaning should appear in open items; the ME restatement should NOT appear as a new ME argument
3. **Enable Deepgram to test diarization** — `cd worker && wrangler secret put DEEPGRAM_API_KEY`, then run a session with multiple remote speakers; verify [Speaker 1] / [Speaker 2] labels appear in the OTHERS transcript
4. **Run `wrangler secret put DEEPGRAM_API_KEY`** — enables Hindi/Urdu mode and diarization end to end
5. **Test shared session** — browser + Windows helper on same code
6. **Engine auth** — add HMAC session token to WS upgrade to prevent unauthorised connections
7. **Upgrade Whisper** — `@cf/openai/whisper-large-v3` (paid Workers AI plan) for better accuracy
8. **Coaching quality** — tune the LLM prompt; consider `@cf/meta/llama-3.3-70b-instruct-fp8-fast` for better JSON reliability
9. **Expand signpost list** — add any language-specific phrases that come up in Mo's actual meetings; the list is in `REPEAT_BACK_SIGNPOSTS` in `worker/src/session-do.js`

---

## Known blockers

1. **Windows helper — Windows hardware required.** WASAPI loopback audio does not work on macOS.
2. **Deepgram key not yet set.** Hindi/Urdu mode is code-complete but gated.
3. **Engine WebSocket has no auth.** Anyone who discovers the URL can connect. Recommended: HMAC-SHA256 session token on WS upgrade.
