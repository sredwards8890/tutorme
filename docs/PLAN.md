# TutorMe — Plan v0.2 (2026-10-12)

A two-person tutoring room that replaces Teams/Zoom/Meet for one tutor (retired finance
professor, iPad 11 + generic stylus) and one student (business student, Windows PC).

## 1. Decisions locked in (from Q&A, 2026-10-12)

| Topic | Decision |
|-------|----------|
| Devices | Tutor: iPad 11, Safari, generic (non-Apple) stylus. Student: Windows, Chrome or Edge. |
| Who shares Excel | Student only (Windows). Tutor never screen-shares. |
| "The problem" | Lives on a web page in the student's online learning system. Shown in the app as a **pasted screenshot** (Win+Shift+S then paste). View only; notes go on the whiteboard. |
| Whiteboard | Both users annotate. |
| Snippets | PNG saved to the **student's Windows machine** as personal notes, no matter who presses the button. |
| Persistence | Nice to have, not mandatory. Done for free in the browser (see 4.5). |
| Hosting | **Zero cost, and no path to a surprise bill.** Every service must have a hard cap that fails closed, not an overage charge. |
| Camera video | Out of scope for v1. |

## 2. Hard platform constraints (verified 2026-10-12)

1. **iPad Safari cannot screen-share from a web page** (`getDisplayMedia` unsupported on
   iOS/iPadOS). Not a problem: only the student shares, from Windows.
2. **Windows screen share is easy.** Chrome/Edge let the user pick a single window (Excel).
3. **The tutor's stylus reports as a real pen.** Spike result (2026-10-12, see
   `docs/SPIKE_RESULTS.md`): Safari delivers `pointerType === "pen"` with live tilt, but a
   **constant pressure of 0.12** (no pressure sensor). iPadOS therefore handles palm
   rejection at the OS level, and the whiteboard can use Excalidraw's native pen handling.
   Two consequences: (a) the capacitive-stylus palm filter in `penmode.ts` is a fallback
   only, and (b) stroke width must not come from raw pressure. Excalidraw simulates pressure
   from velocity only when an event reports exactly 0.5, so the page overrides the
   `PointerEvent.pressure` getter to return 0.5 for pen events while down (the
   "Width: simulated" toggle in the spike). Re-dispatching cloned events was tried first
   and rejected: it breaks Excalidraw's `setPointerCapture`.
4. **Two home networks need a TURN relay** for WebRTC to connect reliably. The realtime
   provider below includes one.

## 3. Technology choices

**Overall: a single static web app (installable PWA), TypeScript end to end.** One codebase
for both devices, no App Store, no server to run.

| Layer | Choice | Why | Alternative |
|-------|--------|-----|-------------|
| Language | TypeScript | Same stack as pdm-monitor. | Swift native iPad app (not needed now that the tutor never shares a screen). |
| UI | React 19 + Vite + Tailwind | Small SPA, fast to build. | Next.js (heavier than needed). |
| Realtime audio, screen share, data channel | **LiveKit Cloud, "Build" (free) plan** | React SDK handles signaling, TURN, reconnect. Free plan is a **hard cap** (~5,000 participant-minutes/month, no card on file, requests fail instead of billing). Two people × 3 h/week ≈ 1,500 participant-min/month. | Daily.co (10,000 min free; confirm it fails closed before switching). Cloudflare Realtime (generous free tier but overage-billed, so rejected). |
| Whiteboard | **Excalidraw** (`@excalidraw/excalidraw`, MIT) | Free, no key, simulated pressure from velocity (works without a real pen), pinch zoom, `exportToBlob` for PNG. | tldraw (license key + watermark on free tier). |
| Whiteboard sync | Excalidraw element updates over the **LiveKit data channel** | No extra server; two peers reconcile by element version (last writer wins). | Yjs (only if >2 users). |
| Problem pane | Pasted PNG from the clipboard, sent over the data channel (chunked) and displayed on both sides | One keystroke for the student; no upload server. | Second screen-share track of the LMS tab (Phase 3 if wanted). |
| Snippet capture | "Snapshot" button on either device sends a data-channel message; the **Windows client** exports the current selection (or viewport) with `exportToBlob` and saves to its Downloads folder | PNGs always land on the student's PC, regardless of who pressed it. | Web Share on iPad (not needed). |
| Persistence | Excalidraw scene JSON in **IndexedDB on each device**, keyed by room; on join, the peer with the newest scene pushes it | Zero cost; survives a split session. Optional "Export board (.excalidraw)" button. | Cloud storage (costs, out of scope). |
| Auth / tokens | **Pre-minted long-lived LiveKit tokens** (one per person, 1-year TTL) embedded in each person's private join link; a script in the repo mints them | Removes the only server-side component. The link is the secret, same posture as a room code + PIN. | Cloudflare Worker token route (free, 100k req/day, fails closed). Upgrade path if link-sharing ever becomes a concern. |
| Hosting | **GitHub Pages** from the public repo `sredwards8890/tutorme`, deployed by GitHub Actions (decided 2026-10-12) | Free for public repos, no card, no overage path; the code is already there. Served at `https://sredwards8890.github.io/tutorme/`. | Cloudflare Pages (also free, easier custom domain); Azure Static Web Apps Free. |

### Cost guardrails
- LiveKit Build: hard cap, no payment method on the account. Check usage on the dashboard
  monthly; the app shows a "minutes used this month" hint on the join screen (read via the
  LiveKit dashboard, not an API, so this is manual at first).
- GitHub Pages: free static hosting for a public repo, no card required. Soft limits
  (100 GB bandwidth/month, 10 builds/hour) are far above two users' use and are not billed.
- Nothing else is hosted. No database, no object storage, no functions.

## 4. Functional design

### 4.1 Screens
1. **Join**: opened from a private link that carries the room + token. Mic picker, mic test,
   "Join" button. Remembers mic choice.
2. **Room** (the only real screen):
   - Top bar: mic mute, speaking indicator for the other person, **Share Excel** (Windows
     only; hidden on iPad by feature detection), **Snapshot**, **Paste problem** (Windows),
     layout swap, leave.
   - Left pane: **Problem**. Shows the latest pasted screenshot; pinch/scroll to zoom. Keeps
     a small strip of previous problems from this session.
   - Right pane: **Whiteboard** or **Screen share**. Auto-switches to the screen share when
     the student starts one; a tab flips back to the whiteboard without stopping the share.
     The share pane shows the share on **both** devices: the student sees a self-view of the
     Excel window they are sharing, so tabbing back into the app keeps Excel visible next to
     the problem or whiteboard.
   - Draggable divider; double-tap a pane header to maximize it (important on an 11" iPad).
3. **Snapshots strip** (Windows only): thumbnails of PNGs saved this session.

### 4.2 Whiteboard on the iPad with the tutor's stylus
The stylus arrives as a real `"pen"` (spike-verified), so the OS rejects the palm and
Excalidraw's native pen handling applies: pen draws, fingers pan/zoom and select.
- The `PointerEvent.pressure` getter is overridden to report 0.5 for pen events so
  Excalidraw simulates width from velocity instead of using the stylus's constant 0.12
  (`penmode.ts`, `installPenPressureNormalizer`).
- The capacitive-stylus palm filter stays in the code as an opt-in fallback for any other
  stylus, off by default.
- Large (≥44 px) buttons for eraser, undo, color, width, "fit to content", "new page".
- Canvas-sized surfaces must refit on `ResizeObserver`, not only on window resize; the
  spike's first version drifted ~100 px horizontally on the iPad because of this.

### 4.3 Problem flow (student)
1. Student snips the question (Win+Shift+S) in the LMS.
2. Presses **Paste problem** (or Ctrl+V anywhere in the room).
3. Image is chunked over the data channel; both panes update within a second.

### 4.4 Snapshot flow
1. Either user presses **Snapshot**.
2. Windows client exports the current selection, or the visible viewport if nothing is
   selected, as a 2× PNG on white, and saves `tutorme-YYYYMMDD-HHMM-n.png` to Downloads.
3. A toast on both devices confirms the save.

### 4.5 Persistence
- Every few seconds of inactivity the scene is written to IndexedDB on both devices.
- On join, each peer sends its scene version; the newer one wins and is pushed.
- "Clear board" asks for confirmation and clears both devices.

### 4.6 Audio
- Opus through LiveKit, echo cancellation and noise suppression on. Mute toggle only.

## 5. Implementation plan

**Phase 0: Spike on the real devices. DONE 2026-10-12, verdict GO** (see
`docs/SPIKE_RESULTS.md`). Go/no-go on each item:
1. A one-page test (deployed to Cloudflare Pages) that logs `pointerType`, `pressure`,
   `width/height` for every pointer event. Tutor tries her stylus on it. This decides
   whether 4.2's heuristics are needed and whether they are good enough.
2. LiveKit audio between Windows and iPad, plus an Excel window share rendered on the iPad.
3. Excalidraw on the iPad in Safari and as a home-screen PWA: drawing feel, pinch zoom,
   palm rejection with the heuristics above.
4. `exportToBlob` to a PNG download on Windows.

Escape hatch for item 1: if palm rejection with the generic stylus is unusable, an Apple
Pencil (USB-C) or Logitech Crayon reports as a real pen and fixes it at the hardware level.

**Phase 1: Minimum room. BUILT 2026-10-12, awaiting the first real session.** `app/`:
Vite + React + TypeScript, private-link join (role from the token identity), LiveKit audio
with mic picker and speaking indicators, draggable split layout, Excalidraw whiteboard
synced over a chunked data channel (Excalidraw's `reconcileElements`, full-scene catch-up
on join), share pane with self-view and auto-switch, snapshot routed to the student's PC,
GitHub Pages deploy at the site root, token-minting script. Problem pane is a placeholder.

**Phase 2: Problem pane and polish.** Paste-to-share screenshot, auto-switch to screen share,
pane maximize/swap, IndexedDB persistence and scene handoff, reconnect handling, PWA
manifest and install prompt.

**Phase 3: Only if asked.** Second share track for the LMS tab, board export to PDF, camera
video, a third participant, Cloudflare Worker token route instead of pre-minted tokens.

## 6. Risks
| Risk | Mitigation |
|------|------------|
| ~~Generic stylus palm rejection is poor~~ | Resolved 2026-10-12: stylus reports as `pen`, OS handles the palm. Residual: constant pressure, handled by re-dispatch (4.2). |
| LiveKit free cap reached mid-month | Fails closed, no bill. Manual monthly usage check; Daily.co as a fallback provider. |
| Pre-minted token link leaks | Re-run the mint script to rotate; move to a Worker token route (Phase 3). |
| Simultaneous edits of the same element | Last writer wins; acceptable for two cooperative users. |
| iPad PWA quirks with pointer events | Spike item 3 tests both Safari tab and home-screen modes. |

## 7. Repo layout (proposed)
```
tutorme/
  docs/PLAN.md
  app/                 # Vite + React + TS client (the whole product)
    src/
      room/            # Room screen, layout, panes
      whiteboard/      # Excalidraw wrapper, pen-mode heuristics, sync, snapshot
      problem/         # Clipboard paste, chunked transfer, viewer
      rtc/             # LiveKit room hook, data-channel message types
      persist/         # IndexedDB scene store
  scripts/
    mint-tokens.ts     # Generates the two private join links from LiveKit API key/secret
  spike/               # Phase 0 throwaway pages (pointer-event logger etc.)
```
