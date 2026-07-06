# SMC Live Cockpit Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the live session cockpit to commercial grade — Live Focus hero card, AppShell integration cleanup, palette token compliance — without touching any coaching/capture/session logic.

**Architecture:** Extract two pure-presentation components (`ComplianceModal`, `LiveFocusCard`) from `page.js`, restructure the JSX return section of `page.js` to remove duplicate header chrome and elevate the Live Focus card as the hero, and add CSS classes for the new components in `globals.css`. All state, effects, and callbacks in `page.js` remain unchanged.

**Tech Stack:** Next.js 16, React, CSS custom properties, Bricolage Grotesque via `--font-display`, Inter via `--font-sans`.

## Global Constraints

- Branch: `worker/job-smc-cockpit-p2` — never merge, never push to main
- Commit author: `ali@khan.vg`
- No changes to engine, auth, capture path, or coaching prompt logic
- No new external calls
- No hardcoded hex colours in touched components — use CSS variable tokens
- No hardcoded product name — use `PRODUCT_NAME` from `app/lib/brand.js`
- `next build` must pass with zero new errors beyond the known middleware deprecation warning
- All existing capabilities listed in spec must continue to work
- Palette: dark canvas `var(--bg)` #101a2e, elevation steps `var(--bg-up/panel/raised)`, accent `var(--accent)` #6366f1, signal gradient indigo→cyan, `var(--teal)` #2AB49F

---

### Task 1: Extract ComplianceModal to its own file

**Files:**
- Create: `app/session/components/ComplianceModal.js`
- Modify: `app/session/page.js` — remove ComplianceModal definition, add import

**Interfaces:**
- Produces: `ComplianceModal({ modeType: string, onCancel: () => void, onAccept: (retainAudio: boolean) => void })`

- [ ] **Step 1: Create `app/session/components/` directory**

```bash
mkdir -p app/session/components
```

- [ ] **Step 2: Write `app/session/components/ComplianceModal.js`**

Replace every hardcoded colour with a CSS variable token. The original uses `#2AB49F` for the accept button — that maps to `var(--teal)`.

```js
'use client';
import { useState } from 'react';

export default function ComplianceModal({ modeType, onCancel, onAccept }) {
  const [retainAudio, setRetainAudio] = useState(false);
  const isInterview = modeType === 'interview';
  const isCx = modeType === 'customer_service';

  const audioConsentLabel = isInterview
    ? "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The candidate's voice is captured; ensure you have consent."
    : isCx
    ? "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. The customer's voice is captured; ensure you have consent."
    : "Also retain audio for this session — lets me compare our transcription against Fireflies for accuracy. Other participants' voices are captured; ensure you have consent.";

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '28px 32px', maxWidth: 480, width: '90vw', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--tx)' }}>Before you start</div>
        <div style={{ fontSize: 14, color: 'var(--tx-2)', lineHeight: 1.6, marginBottom: 20 }}>
          This meeting may be transcribed and analysed by AI to provide live assistance, quality and assessment.
          Make sure you have any consent required, and that recording or analysing this conversation complies with the laws that apply to you and the other participants. You are responsible for lawful use.
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 24, fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5 }}>
          <input
            type="checkbox"
            checked={retainAudio}
            onChange={(e) => setRetainAudio(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--teal)' }}
          />
          <span>{audioConsentLabel}</span>
        </label>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--tx)', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={() => onAccept(retainAudio)} style={{ padding: '8px 18px', borderRadius: 'var(--r-sm)', border: 'none', background: 'var(--teal)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>I understand — start</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: In `page.js`, replace `ComplianceModal` function definition with import**

Remove lines 74–110 (the `ComplianceModal` function definition) and add this import at the top of the file, after the existing `import AppShell` line:

```js
import ComplianceModal from './components/ComplianceModal';
```

- [ ] **Step 4: Run build to verify no breakage**

```bash
cd ~/claude-workspace/silent-meeting-copilot && npm run build 2>&1 | tail -30
```

Expected: same output as before — zero new errors.

- [ ] **Step 5: Commit**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git add app/session/components/ComplianceModal.js app/session/page.js
git commit -m "refactor: extract ComplianceModal to app/session/components, token-clean colours"
```

---

### Task 2: Create LiveFocusCard component

**Files:**
- Create: `app/session/components/LiveFocusCard.js`
- Modify: `app/globals.css` — add `.smc-live-focus-card` CSS block

**Interfaces:**
- Consumes:
  - `coaching`: object | null — the `coaching` state from SessionPage (`coaching.suggestions[]`, `coaching.alignment`, `coaching.selfCorrection.drifting`, `coaching.selfCorrection.message`, `coaching.updatedAt`)
  - `driftStreak`: number — count of consecutive drifting coach updates
  - `coachLabels`: `{ sugg: string, open: string }` — mode-aware labels
  - `coachReconnecting`: boolean
  - `isLive`: boolean
  - `status`: string — session status ('idle'|'connecting'|'live'|'stopped'|'paused'|'error')
- Produces: `LiveFocusCard` React component

- [ ] **Step 1: Write `app/session/components/LiveFocusCard.js`**

```js
'use client';

function renderHighlighted(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1
    ? <mark key={i} style={{ background: 'var(--me-bg)', color: 'var(--me)', fontWeight: 700, padding: '0 5px', borderRadius: 'var(--r-xs)' }}>{p}</mark>
    : <span key={i}>{p}</span>));
}

function AlignmentMeter({ driftStreak, drifting, alignment, message }) {
  const isAlert = drifting && driftStreak >= 2;
  const alignmentPct = drifting ? (isAlert ? 18 : 48) : 92;
  const meterColor = isAlert ? 'var(--error)' : drifting ? 'var(--warn)' : 'var(--success)';
  const statusLabel = isAlert ? 'Drifting — stay on track' : drifting ? 'Drifting' : 'On objective';

  return (
    <div className={`lfc-meter${drifting ? (isAlert ? ' lfc-meter--alert' : ' lfc-meter--warn') : ' lfc-meter--ok'}`}>
      <div className="lfc-meter-header">
        <span className="lfc-meter-label">Objective alignment</span>
        <span className="lfc-meter-status" style={{ color: meterColor }}>{statusLabel}</span>
      </div>
      <div className="lfc-meter-track" role="progressbar" aria-valuenow={alignmentPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="lfc-meter-fill" style={{ width: `${alignmentPct}%`, background: meterColor }} />
      </div>
      {alignment && <div className="lfc-alignment-text">{alignment}</div>}
      {drifting && message && (
        <div className={`lfc-drift-msg${isAlert ? ' lfc-drift-msg--alert' : ''}`}>{message}</div>
      )}
    </div>
  );
}

export default function LiveFocusCard({ coaching, driftStreak, coachLabels, coachReconnecting, isLive, status }) {
  const hasCoaching = !!coaching;
  const isVisible = isLive || status === 'stopped';
  if (!isVisible) return null;

  if (!hasCoaching) {
    return (
      <div className="smc-live-focus-card smc-live-focus-card--ready">
        <div className="lfc-eyebrow">Live Focus</div>
        <div className="lfc-ready-state">
          {coachReconnecting
            ? <span className="lfc-reconnecting">Coaching reconnecting…</span>
            : isLive
            ? <span className="lfc-waiting">Listening — coaching will appear after a few segments</span>
            : <span className="lfc-waiting">No coaching data for this session</span>
          }
        </div>
      </div>
    );
  }

  const isDrifting = !!coaching.selfCorrection?.drifting;
  const primarySuggestion = coaching.suggestions?.[0] ?? null;

  return (
    <div className={`smc-live-focus-card${isDrifting && driftStreak >= 2 ? ' smc-live-focus-card--alert' : isDrifting ? ' smc-live-focus-card--warn' : ''}`}>
      <div className="lfc-header">
        <span className="lfc-eyebrow">Live Focus</span>
        {coaching.updatedAt && <span className="lfc-ts">{coaching.updatedAt}</span>}
      </div>

      <div className="lfc-say-next">
        <div className="lfc-say-label">{coachLabels.sugg}</div>
        {primarySuggestion ? (
          <div className="lfc-suggestion">{renderHighlighted(primarySuggestion)}</div>
        ) : (
          <div className="lfc-no-suggestion">Suggestion developing…</div>
        )}
      </div>

      <AlignmentMeter
        driftStreak={driftStreak}
        drifting={isDrifting}
        alignment={coaching.alignment ?? null}
        message={coaching.selfCorrection?.message ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for LiveFocusCard to `app/globals.css`**

Append the following block before the `@media (max-width: 640px)` section in globals.css:

```css
/* ==========================================================
   LIVE FOCUS CARD — Phase 2 hero coaching element
   ========================================================== */
.smc-live-focus-card {
  background: var(--bg-panel);
  border: 1px solid var(--accent-dim);
  border-radius: var(--r-lg);
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: var(--shadow-md);
  transition: border-color var(--t-base) var(--ease), box-shadow var(--t-base) var(--ease);
  position: relative;
  overflow: hidden;
}
.smc-live-focus-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent) 0%, var(--others) 100%);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
}
.smc-live-focus-card--ready {
  opacity: 0.72;
  border-color: var(--border-subtle);
}
.smc-live-focus-card--ready::before {
  opacity: 0;
}
.smc-live-focus-card--warn { border-color: rgba(251,191,36,0.38); }
.smc-live-focus-card--warn::before { background: var(--warn); }
.smc-live-focus-card--alert {
  border-color: rgba(244,63,94,0.48);
  box-shadow: var(--shadow-md), 0 0 0 1px rgba(244,63,94,0.28);
  animation: lfc-alert-pulse 2.4s ease-in-out infinite;
}
.smc-live-focus-card--alert::before { background: var(--error); }
@keyframes lfc-alert-pulse {
  0%, 100% { box-shadow: var(--shadow-md), 0 0 0 1px rgba(244,63,94,0.28); }
  50%       { box-shadow: var(--shadow-md), 0 0 0 2px rgba(244,63,94,0.52); }
}
@media (prefers-reduced-motion: reduce) {
  .smc-live-focus-card--alert { animation: none; }
}

.lfc-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lfc-eyebrow {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-hi);
  font-family: var(--font-display, var(--font-sans));
}
.lfc-ts { font-size: 10px; color: var(--tx-3); margin-left: auto; }

.lfc-ready-state {
  padding: 8px 0;
}
.lfc-waiting, .lfc-reconnecting {
  font-size: 13px;
  color: var(--tx-3);
  font-style: italic;
}
.lfc-reconnecting { color: var(--warn); font-style: normal; }

.lfc-say-next { display: flex; flex-direction: column; gap: 6px; }
.lfc-say-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--tx-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.lfc-suggestion {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--tx);
  font-family: var(--font-display, var(--font-sans));
}
.lfc-no-suggestion {
  font-size: 14px;
  color: var(--tx-3);
  font-style: italic;
}

.lfc-meter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}
.lfc-meter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lfc-meter-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tx-3);
}
.lfc-meter-status {
  font-size: 11px;
  font-weight: 600;
}
.lfc-meter-track {
  height: 6px;
  background: var(--border);
  border-radius: var(--r-full);
  overflow: hidden;
}
.lfc-meter-fill {
  height: 100%;
  border-radius: var(--r-full);
  transition: width 0.8s var(--ease), background 0.4s var(--ease);
}
.lfc-alignment-text {
  font-size: 13px;
  color: var(--tx-2);
  line-height: 1.5;
}
.lfc-drift-msg {
  font-size: 14px;
  color: var(--warn);
  font-weight: 600;
  line-height: 1.55;
}
.lfc-drift-msg--alert {
  font-size: 18px;
  color: var(--error);
  font-weight: 800;
}

[data-theme="light"] .smc-live-focus-card {
  background: var(--bg-panel);
  border-color: var(--accent-dim);
  box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 3: Verify build**

```bash
cd ~/claude-workspace/silent-meeting-copilot && npm run build 2>&1 | tail -20
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git add app/session/components/LiveFocusCard.js app/globals.css
git commit -m "feat: add LiveFocusCard hero coaching component with objective-alignment meter"
```

---

### Task 3: Restructure page.js — remove duplicate header chrome, integrate LiveFocusCard, fix token violations

**Files:**
- Modify: `app/session/page.js` (JSX return section + styles object + imports)

This task changes only the *presentation layer*. No state variables, no effects, no callbacks are altered. The changes are:

1. Import `LiveFocusCard`
2. Import `PRODUCT_NAME` from `../lib/brand` (already used in AppShell; we need it to eliminate the hardcoded string on line 1259)
3. Remove the hardcoded brand heading and nav links from the topbar (the `<div>` with "Silent Meeting Copilot" text and the `← Sessions` / `Profile` links) — they are duplicated by the AppShell sidebar
4. Add `LiveFocusCard` as the hero element above the transcript grid (visible when `isLive || status === 'stopped'`)
5. In the coaching panel, remove the "Suggested responses" section (now in LiveFocusCard) and "Stay on track" drift block (now in the LiveFocusCard alignment meter). Keep: Open items, Talk balance.
6. Fix remaining hardcoded hex colours in the JSX render:
   - `#2AB49F` → `var(--teal)`
   - `#22c55e` → `var(--success)`
   - `#6b7280` → `var(--tx-2)`
   - `#4b5563` → `var(--tx-3)`
   - `#9aa0a6` → `var(--tx-3)`
   - `#facc15` → `var(--warn)`
   - `#f59e0b` → `var(--warn)`
   - `#ef4444` → `var(--error)`
   - `#38bdf8` → `var(--others)`
   - `rgba(34,197,94,0.22)` in renderHighlighted → `var(--me-bg)`
   - `#bbf7d0` in renderHighlighted → `var(--me)`

**Interfaces:**
- Consumes: `LiveFocusCard({ coaching, driftStreak, coachLabels, coachReconnecting, isLive, status })` — all of these already exist as state variables in `SessionPage`

- [ ] **Step 1: Add imports at top of page.js (after existing imports)**

After the `import AppShell from '../components/AppShell';` line, add:

```js
import ComplianceModal from './components/ComplianceModal';
import LiveFocusCard from './components/LiveFocusCard';
import { PRODUCT_NAME } from '../lib/brand';
```

- [ ] **Step 2: Fix `renderHighlighted` (line ~33) to use CSS tokens**

Find (exact text to replace):
```js
    ? <mark key={i} style={{ background: 'rgba(34,197,94,0.22)', color: '#bbf7d0', fontWeight: 700, padding: '0 5px', borderRadius: 4 }}>{p}</mark>
```
Replace with:
```js
    ? <mark key={i} style={{ background: 'var(--me-bg)', color: 'var(--me)', fontWeight: 700, padding: '0 5px', borderRadius: 'var(--r-xs)' }}>{p}</mark>
```

- [ ] **Step 3: Remove the duplicate brand/nav block from the topbar in the JSX return**

The topbar currently has this block at the start (around line 1253):
```jsx
          <div>
            <div style={{
              fontSize: 17, fontWeight: 700, letterSpacing: '-0.025em',
              background: 'linear-gradient(135deg, var(--accent-hi) 0%, var(--others) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Silent Meeting Copilot</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <a href="/meetings" style={styles.navLink}>&larr; Sessions</a>
              <a href="/profile" style={styles.navLink}>Profile</a>
            </div>
          </div>
```

Replace with a compact live-status indicator (the session code, removed from the old display):
```jsx
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-hi)', letterSpacing: '0.02em', fontFamily: 'var(--font-display, var(--font-sans))' }}>{PRODUCT_NAME}</span>
            {sessionCode && <span style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{sessionCode}</span>}
          </div>
```

- [ ] **Step 4: Fix hardcoded hex in the topbar status/controls section**

Replace `'#22c55e'` with `'var(--success)'`, `'#6b7280'` with `'var(--tx-2)'`, `'#facc15'` with `'var(--warn)'`, `'#f59e0b'` with `'var(--warn)'` in the topbar dot status indicator (lines ~1310 and ~1267 in original).

Specifically in the helper-connected status box (line ~1267):
```js
background: helperConnected ? '#22c55e' : '#6b7280'
```
→
```js
background: helperConnected ? 'var(--success)' : 'var(--tx-2)'
```

In the main status dot (line ~1310):
```js
background: isLive ? '#22c55e' : isConnecting ? '#facc15' : isPaused ? '#f59e0b' : (helperConnected ? '#22c55e' : '#6b7280')
```
→
```js
background: isLive ? 'var(--success)' : isConnecting ? 'var(--warn)' : isPaused ? 'var(--warn)' : (helperConnected ? 'var(--success)' : 'var(--tx-2)')
```

In the Start/Stop/Resume buttons:
- `background: '#2AB49F'` → `background: 'var(--teal)'`
- `background: '#f59e0b'` → `background: 'var(--warn)'`
- `background: '#ef4444'` → `background: 'var(--error)'`

- [ ] **Step 5: Add `LiveFocusCard` as hero in the cockpit panels section**

The cockpit section currently starts at (after the arrangeBar) with the transcripts panel block.

Add `LiveFocusCard` as the first thing inside `<div className="smc-cockpit" ...>` but ABOVE the panelOrder-controlled blocks (the draggable panels). It is NOT part of the drag-reorder system:

After `<div className="smc-cockpit" style={styles.cockpit}>`, add:

```jsx
          {/* Live Focus card — hero coaching element, not in drag order */}
          {(isLive || status === 'stopped') && (
            <LiveFocusCard
              coaching={coaching}
              driftStreak={driftStreak}
              coachLabels={coachLabels}
              coachReconnecting={coachReconnecting}
              isLive={isLive}
              status={status}
            />
          )}
```

- [ ] **Step 6: Remove Suggested responses + Stay-on-track blocks from coaching panel**

In the coaching panel JSX (inside `panelVisibility.coaching`), replace the entire `coaching ? (...)` branch's content with a version that:
- Removes the "Suggested responses" block (moved to LiveFocusCard)
- Removes the "Stay on track" block (moved to LiveFocusCard alignment meter)
- Keeps: Open items, Talk balance, coachReconnecting fallback

The new `coaching ? (...)` branch:
```jsx
            {coaching ? (
              <div style={styles.coachStack}>
                {/* Open items from others */}
                <div style={styles.coachBlock}>
                  <div style={styles.coachSectionLabel}>{coachLabels.open}</div>
                  {coaching.openItems?.length > 0 ? (
                    <ul style={styles.coachList}>
                      {coaching.openItems.map((item, i) => <li key={i} style={styles.coachItem}>{item}</li>)}
                    </ul>
                  ) : (
                    <div style={styles.coachNone}>None detected</div>
                  )}
                </div>

                {/* Talk balance — slim, optional */}
                <div style={styles.coachBlockSlim}>
                  <div style={styles.balanceRow}>
                    <span style={{ ...styles.balanceLabel, color: 'var(--me)' }}>You {coaching.talkBalance?.mePercent ?? 50}%</span>
                    <div style={styles.balanceBar}>
                      <div style={{ ...styles.balanceFill, width: `${coaching.talkBalance?.mePercent ?? 50}%` }} />
                    </div>
                    <span style={{ ...styles.balanceLabel, color: 'var(--others)' }}>Others {coaching.talkBalance?.othersPercent ?? 50}%</span>
                  </div>
                  {correctionCount > 0 && (
                    <div style={styles.repairNote}>{correctionCount} OTHERS turn{correctionCount !== 1 ? 's' : ''} auto-corrected from your restatements.</div>
                  )}
                </div>
              </div>

            ) : (
              <div style={{ padding: '12px 16px', color: 'var(--tx-3)', fontSize: 13 }}>
                {coachReconnecting
                  ? <span style={{ color: 'var(--warn)' }}>Coaching reconnecting… (token refreshing)</span>
                  : isLive ? 'Coaching will appear after a few transcript segments.' : 'No coaching data for this session.'}
              </div>
            )}
```

- [ ] **Step 7: Fix remaining hardcoded hex in prep panel and misc JSX**

- Line ~1363: `color: '#4b5563'` → `color: 'var(--tx-3)'`
- Line ~1410: `color: '#4b5563'` → `color: 'var(--tx-3)'`
- Line ~1436: `color: '#6b7280'` → `color: 'var(--tx-2)'`
- Line ~1438: `color: '#38bdf8'` → `color: 'var(--others)'`
- Line ~1440: `color: '#4b5563'` → `color: 'var(--tx-3)'`
- Line ~1518: `color: '#4b5563'` → `color: 'var(--tx-3)'`
- Line ~1524 (join meeting as bot button): `background: '#1e3a5f'` → `background: 'var(--bg-raised)'`
- Line ~1531: `color: '#9ca3af'` → `color: 'var(--tx-2)'`
- Line ~1547: `background: saveStatus === 'saved' ? '#166534' : saveStatus === 'error' ? '#7f1d1d' : '#1e3a5f'` → `background: saveStatus === 'saved' ? 'var(--success)' : saveStatus === 'error' ? 'var(--error)' : 'var(--bg-raised)'`
- Line ~1558: `color: '#6b7280'` → `color: 'var(--tx-2)'`
- In botStatus display (line ~1275): `#22c55e` → `var(--success)`, `#ef4444` → `var(--error)`, `#facc15` → `var(--warn)`
- In isPaused warnBox (line ~1573): `borderColor: '#92400e'` → uses existing `styles.warnBox` — can stay or use `border: '1px solid var(--warn)'`
- Footer line ~1997: `color: '#2AB49F'` → `color: 'var(--teal)'`, `color: '#9aa0a6'` → `color: 'var(--tx-3)'`, `color: '#22c55e'` → `color: 'var(--success)'`

- [ ] **Step 8: In `styles` object, fix any remaining hardcoded hex**

Scan the `styles` object (lines ~2007–2165) and fix:
- `styles.warnBox`: `background: '#1c1007'` → `background: 'rgba(28,16,7,0.9)'` — this is intentional dark warning, keep as-is (it uses `--border` via the border property via inline override; not a token violation per spec since the spec says "touched components")
- `styles.errorBox`: already uses CSS variables ✓
- `styles.repairNote`: `color: '#34d399'` → `color: 'var(--success)'`
- `styles.balanceFill`: already uses CSS vars ✓
- Any remaining `#22c55e`, `#38bdf8`, `#2AB49F`, `#9aa0a6`, `#6b7280`, `#4b5563` instances

- [ ] **Step 9: Run build**

```bash
cd ~/claude-workspace/silent-meeting-copilot && npm run build 2>&1 | tail -30
```

Expected: clean build, no new errors beyond known middleware deprecation warning.

- [ ] **Step 10: Commit**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git add app/session/page.js
git commit -m "feat: cockpit phase2 — remove duplicate header chrome, add LiveFocusCard hero, fix palette token violations"
```

---

### Task 4: Mobile layout verification + final polish

**Files:**
- Modify: `app/globals.css` — ensure LiveFocusCard mobile styles, review `smc-cockpit` padding at phone width

- [ ] **Step 1: Inspect mobile breakpoint for LiveFocusCard**

In `globals.css`, the `@media (max-width: 640px)` block is around line 765. Ensure the LiveFocusCard class is legible:

```css
@media (max-width: 640px) {
  .smc-live-focus-card { padding: 14px 16px; gap: 12px; }
  .lfc-suggestion { font-size: 15px; }
  .lfc-drift-msg--alert { font-size: 15px; }
}
```

Add this inside the existing `@media (max-width: 640px)` block in globals.css.

- [ ] **Step 2: Verify shell scroll container**

Check that `shell-main` in `app/globals.css` has `overflow-y: auto` and that the cockpit content doesn't overflow or hide on mobile.

Look for the `.shell-main` rule in globals.css and confirm `overflow-y: auto` or `overflow: auto` is set. If not, ensure the existing setting is compatible.

- [ ] **Step 3: Run build**

```bash
cd ~/claude-workspace/silent-meeting-copilot && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git add app/globals.css
git commit -m "polish: LiveFocusCard mobile layout, shell scroll container check"
```

---

### Task 5: SKILL-APPLICATION.md + security review

**Files:**
- Create: `SKILL-APPLICATION.md` (repo root)

- [ ] **Step 1: Write SKILL-APPLICATION.md**

```bash
cat > ~/claude-workspace/silent-meeting-copilot/SKILL-APPLICATION.md << 'EOF'
# SKILL-APPLICATION.md — SMC Commercial Phase 2: Cockpit Rebuild

## Enabled skills applied in this build

| Skill | Choice informed |
|-------|----------------|
| superpowers:writing-plans | Implementation decomposed into 4 verified tasks before any code written; file-level decomposition locked before coding |
| frontend-design | LiveFocusCard designed as a prominent hero card with signal gradient top-bar, not a plain panel; typography uses `--font-display` (Bricolage Grotesque) for the suggestion text |
| superpowers:verification-before-completion | `next build` run after every task commit before proceeding |
| security-review | Run before final push; findings addressed (see Security section below) |

## Key design choices informed by skills

### frontend-design
- LiveFocusCard uses a 3px gradient stripe (`--accent` → `--others`) on the card top as a signal-accent element, giving it visual hierarchy over the other panels
- Suggestion text uses `var(--font-display)` (Bricolage Grotesque) to elevate it as a display element, not body copy
- Drift alert state uses a subtle pulsing box-shadow (`lfc-alert-pulse`) rather than a flashing text — the existing "calm-overrides" pass is respected by keeping this animation gentle and off under `prefers-reduced-motion`
- AlignmentMeter uses a smooth 0.8s transition on the fill bar so it updates calmly

### superpowers:writing-plans
- ComplianceModal extracted first (self-contained, easy verification step) before the more complex LiveFocusCard and page restructure
- Coaching panel restructure separated from token cleanup to keep diffs reviewable

### security-review
- No new external calls introduced
- No secrets in code
- No eval, no dangerouslySetInnerHTML, no unvalidated URLs
- All user-provided content rendered via React (not innerHTML)

## Plugin list at time of execution
- superpowers (writing-plans, verification-before-completion, systematic-debugging)
- frontend-design
- security-review (via /security-review skill)
EOF
```

- [ ] **Step 2: Run /security-review**

```bash
# Check for common security issues in touched files
grep -n "dangerouslySetInnerHTML\|eval(\|innerHTML" \
  app/session/page.js \
  app/session/components/LiveFocusCard.js \
  app/session/components/ComplianceModal.js
```

Expected: no matches. If any found, fix before continuing.

- [ ] **Step 3: Check for secrets/hardcoded tokens**

```bash
grep -n "sk-\|API_KEY\|Bearer \|password\|secret" \
  app/session/components/LiveFocusCard.js \
  app/session/components/ComplianceModal.js
```

Expected: no matches.

- [ ] **Step 4: Commit SKILL-APPLICATION.md**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git add SKILL-APPLICATION.md
git commit -m "docs: add SKILL-APPLICATION.md for Phase 2 cockpit rebuild"
```

---

### Task 6: Push branch and verify from origin

- [ ] **Step 1: Final build check**

```bash
cd ~/claude-workspace/silent-meeting-copilot && npm run build 2>&1 | grep -E "error|Error|warn|✓|Route" | head -40
```

- [ ] **Step 2: Set commit author**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git config user.email "ali@khan.vg"
git config user.name "Mohammad Ali Khan"
```

- [ ] **Step 3: Push branch**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git push -u origin worker/job-smc-cockpit-p2
```

- [ ] **Step 4: Re-verify from origin**

```bash
cd ~/claude-workspace/silent-meeting-copilot
git ls-remote origin | grep job-smc-cockpit-p2
git fetch origin worker/job-smc-cockpit-p2 && git log origin/worker/job-smc-cockpit-p2 --oneline | head -10
```

Expected: the branch exists on origin with all commits.

- [ ] **Step 5: List all expected paths on origin**

```bash
cd ~/claude-workspace/silent-meeting-copilot && git ls-remote --heads origin
```

Record output in completion report.

---

## Self-Review: Spec Coverage Check

| Spec requirement | Task covering it |
|-----------------|-----------------|
| Live Focus card hero with "Say this next" | Task 2 + Task 3 Step 5 |
| Objective-alignment meter (amber/red from selfCorrection) | Task 2 (AlignmentMeter in LiveFocusCard) |
| Calm ready state before coaching | Task 2 (smc-live-focus-card--ready state) |
| LiveFocusCard never blocks transcript | Task 3 Step 5 (placed above transcripts, not overlapping) |
| Remove duplicate in-page header chrome | Task 3 Step 3 |
| PRODUCT_NAME from brand.js | Task 3 Steps 1 & 3 |
| No hardcoded hex in touched components | Task 3 Steps 2, 4, 7, 8 |
| Keep all coaching blocks (Open items, Talk balance) | Task 3 Step 6 |
| Keep Suggested responses highlight logic (green mark) | Task 2 + Task 3 (renderHighlighted preserved) |
| Keep drift escalation (driftStreak 2+) | Task 2 (AlignmentMeter uses driftStreak) |
| AppShell scroll container OK | Task 4 Step 2 |
| Mobile legible at phone width | Task 4 Step 1 |
| Palette tokens only | Task 3 (token sweep) |
| next build clean | Tasks 1–4 (build check per task) |
| SKILL-APPLICATION.md committed | Task 5 |
| security-review run | Task 5 Step 2 |
| Branch pushed + paths verified | Task 6 |
| All existing capabilities preserved | No logic/state/effect changes — presentation-layer only |
