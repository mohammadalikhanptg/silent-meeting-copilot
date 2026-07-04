# Zoom meeting-bot — Gate 1a findings (prerequisite / environment probe)

Job: `job-zoombot-g1a` · Branch: `worker/job-zoombot-g1a` · Host: **DEV-ORCH-01** · Date: 4 Jul 2026

Gate 1a is a **no-build** environment probe. It answers one question the planner
deliberately refused to answer blind before dispatching the adapter build (Gate 1b):

> Can the Zoom Meeting SDK for Linux (C++ headless capture) adapter be **built and
> authenticated on this worker at all**, or must a dedicated Linux build host be provisioned?

**Headline verdict: NO — the adapter cannot be built on DEV-ORCH-01 as it stands.**
This is a Windows host with **no C++ toolchain of any kind and no Linux userland**. The
Zoom Linux SDK and its credentials are **not staged**. A remediation path exists (WSL2 is
feature-enabled; the CPU supports virtualization), but standing it up is a provisioning
action, not part of Gate 1a. **Gate 1b must not be dispatched to this worker as-is.**

---

## 1. Probe scope and method

Four things were checked, per the Gate 1a brief in ROADMAP.md (§ "Zoom meeting-bot Gate 1a dispatched"):

1. Linux x86_64 C++ build capability on the worker.
2. Staged Zoom Linux SDK — presence, integrity, version.
3. Credential presence (Zoom Marketplace Meeting-SDK Client ID / Secret).
4. A Zoom SDK JWT mint + validate (headless SDK auth attempted **only if feasible without a join**).

Method: direct interrogation of this host — no build, no install, no join, no external
Zoom API call. Findings below are from live commands on DEV-ORCH-01, not from any prior
self-report.

---

## 2. Findings

### 2.1 Host identity and OS
- `MINGW64_NT-10.0-26200 DEV-ORCH-01 … x86_64 Msys` — **Windows 11 Pro, x64**, commands run
  through the MSYS2/MinGW64 (Git Bash) shell. This is the "Windows Claude Code machine reaching
  outbound services" the roadmap flagged. Confirmed.

### 2.2 Linux x86_64 C++ build capability — ✗ ABSENT
| Capability | Result |
|---|---|
| WSL distro installed | **None.** `wsl -l -v` → "has no installed distributions". Ubuntu is *available to install* (`wsl -l -o` lists it) but is not present. |
| Docker | **Absent** (`docker` not found). |
| Linux cross-compiler (`x86_64-linux-gnu-g++`) | **Absent.** |
| MinGW cross-compiler (`x86_64-w64-mingw32-g++`) | **Absent.** |
| Native GCC/Clang (`g++`, `gcc`, `clang`, `clang++`) | **All absent.** |
| MSVC (`cl.exe`) / Visual Studio | **Absent** — no `Microsoft Visual Studio` dir under Program Files or Program Files (x86). |
| `cmake`, `make` | **Both absent.** |

**Conclusion:** the worker cannot compile C++ for **any** target right now — not Linux, not
even native Windows. There is no Linux userland to build *in* and no compiler to build *with*.
The Zoom Linux SDK is a native C++ shared-library integration; it cannot be built here.

### 2.3 Staged Zoom Linux SDK — ✗ ABSENT
- No `*zoom*sdk*`, `*meeting-sdk*`, `*zoom*linux*`, `zoom-meeting-sdk*`, or `*meetingsdk*linux*`
  artefact anywhere under `C:\Pacific-Orchestration` (searched to depth 5), in `$HOME`, or at
  `C:\zoom*` / `C:\sdk*`. No tarball, no `.deb`, no extracted tree.
- The repo's own `docs/meeting-bot-design.md` (lines 22–24, 140–141) states the Zoom Meeting SDK
  adapter "needs operator Zoom Marketplace SDK credentials **and a Linux host**, and is **out of
  scope**" for the shipped runtime. Nothing has been staged since.
- **Integrity/version: N/A** — there is no SDK to hash or version.

### 2.4 Credential presence — ✗ ABSENT
- Environment scan (`env | grep -iE 'zoom|sdk|bot|smc'`) returns only shell bookkeeping
  (`PWD`, `OLDPWD`, `CLAUDE_CODE_ENTRYPOINT`). **No** `SDK_CLIENT_ID`, `SDK_CLIENT_SECRET`,
  `ZOOM_*`, or equivalent.
- No `.env`, secret file, or staged credential for the Zoom Meeting SDK anywhere in the bot
  runtime or repo. (The repo's `smcb1_` credential is the app's own **session-bound bot
  credential** per H4 — unrelated to Zoom SDK auth.)

### 2.5 Zoom SDK JWT mint + validate — ⚠ MECHANISM OK, REAL AUTH NOT FEASIBLE
- **What works:** the worker can mint and validate a **structurally-correct Zoom Meeting SDK
  auth JWT** using Node's built-in `crypto` (no external dependency). A probe built the standard
  Meeting-SDK HS256 token (`{alg:HS256,typ:JWT}` header; payload `appKey`/`sdkKey`/`mn`/`role`/
  `iat`/`exp`/`tokenExp`), HMAC-SHA256 signed, and verified the round-trip: **signature verifies
  `true`**, payload decodes cleanly. So the token-minting mechanism the adapter needs is present
  and correct on this host.
- **What is NOT feasible:** the probe used **placeholder** Client ID/Secret because the real ones
  are absent (§2.4). No *authenticatable* token can be produced, and no **headless SDK auth was
  attempted** — that requires (a) the real credentials, (b) the C++ SDK binary, and (c) a Linux
  host to load it, **none of which exist here**. Per the brief ("only if feasible without a
  join"), real SDK auth was correctly not attempted; it is not feasible on this worker.

### 2.6 Remediation path — AVAILABLE but unprovisioned
The host *can* be turned into a Linux x86_64 C++ build host without new hardware:
- CPU virtualization firmware: **enabled** (`VirtualizationFirmwareEnabled = True`).
- `Microsoft-Windows-Subsystem-Linux` feature: **Enabled**.
- `VirtualMachinePlatform` feature: **Enabled** (WSL2 backend ready).
- Disk headroom: **751 GB free** — ample.

So WSL2 is fully enabled at the platform layer; only the **distro + toolchain + SDK + creds**
are missing. Standing this up is a provisioning action with side effects (multi-GB download,
possible reboot, admin rights) and is **out of Gate 1a scope** — it was not performed.

---

## 3. Answer to the Gate 1a question

| Item | Status | Evidence |
|---|---|---|
| Linux x86_64 C++ build on this worker | **✗ Not possible as-is** | No compiler at all; no Linux userland; no Docker |
| Staged Zoom Linux SDK | **✗ Absent** | No artefact on disk; design doc marks it out-of-scope |
| Zoom SDK credentials | **✗ Absent** | Not in env; no secret file staged |
| JWT mint/validate mechanism | **✓ Present** (Node crypto) | Structurally-valid HS256 token minted + verified |
| Real headless SDK auth | **✗ Not feasible** | Needs SDK + creds + Linux — all absent |
| Remediation via WSL2 | **○ Available, unprovisioned** | Virtualization + WSL + VM Platform all enabled; 751 GB free |

**Gate 1b (adapter build) must NOT be dispatched to DEV-ORCH-01 as it stands.** The worker
cannot compile the C++ Zoom Linux SDK integration.

---

## 4. Recommendation to the planner (decision for the operator)

Choose one before Gate 1b:

**Option A — provision this worker as a WSL2 Linux build host (lowest new cost).**
Prerequisites are already met (§2.6). One-time setup:
1. `wsl --install -d Ubuntu` (admin; may require a reboot; ~1–2 GB download).
2. In the distro: `sudo apt update && sudo apt install -y build-essential cmake pkg-config`
   plus the Zoom Linux SDK runtime deps (typically `libx11-6`, `libxcb`, `libgl1`, `libglib2.0-0`,
   ALSA/PulseAudio libs — pin against the SDK release notes at stage time).
3. Stage the operator-downloaded **Zoom Meeting SDK for Linux** (matching glibc/arch) and record
   its version + SHA-256 in the repo.
4. Stage the **Meeting-SDK app** Client ID / Secret as worker secrets (never committed).
   *Caveat:* WSL2 is fine for **building**; a headless bot that captures **raw audio** also needs
   the SDK's runtime deps and likely a virtual audio/display device — verify at Gate 1b, don't
   assume build-success implies run-success.

**Option B — provision a dedicated native Linux build/run host (cleanest for the runtime bot).**
A small Ubuntu x86_64 VM the bot both builds and *runs* on. Removes the WSL2 audio/display
uncertainty; the eventual production bot needs a Linux host to run on regardless, so this is the
path Gate 1b's runtime ultimately requires.

**Independent of A/B, the operator still owes** (currently all blocking):
- Zoom Marketplace **Meeting SDK** app Client ID + Secret (staged as secrets).
- The **Zoom Meeting SDK for Linux** download (licence-gated; cannot be fetched by the worker).

The JWT-minting half of the auth path is already proven to work on Node (§2.5), so once real
credentials land, token generation is a solved problem; the open risk is entirely the **C++
build + Linux runtime + SDK staging**, which Option A or B resolves.

---

## 5. Probe log (commands, for re-verification)

- `uname -a` → `MINGW64_NT-10.0-26200 DEV-ORCH-01 … x86_64 Msys`
- `wsl -l -v` → no installed distributions; `wsl -l -o` → Ubuntu available
- `docker --version` → not found
- toolchain sweep (`g++ gcc clang clang++ cl x86_64-linux-gnu-g++ x86_64-w64-mingw32-g++ cmake make`) → all absent
- Visual Studio dirs under Program Files / (x86) → none
- Zoom SDK filesystem sweep (HOME, `C:\`, `C:\Pacific-Orchestration` depth 5) → none
- `env | grep -iE 'zoom|sdk|bot|smc'` → no credentials
- Node JWT probe → HS256 Meeting-SDK token minted, `signature verifies: true`, payload round-trips
- `Get-CimInstance Win32_Processor` → `VirtualizationFirmwareEnabled = True`
- WSL / VirtualMachinePlatform optional features → both `Enabled`
- `Get-PSDrive C` → 751.5 GB free

*No build, install, or Zoom join was performed. Real Zoom SDK auth was not attempted (not
feasible without staged SDK + credentials + a Linux host).*
