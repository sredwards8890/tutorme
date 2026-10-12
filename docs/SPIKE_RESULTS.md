# Phase 0 spike results

## 1. Pointer logger (iPad 11, Safari, generic stylus) — 2026-10-12

Served over plain HTTP on the LAN (`http://192.168.1.202:5173/pointer.html`).

**Result: PASS, better than expected.**

| Measured | Value |
|----------|-------|
| `pointerType` | `pen` on every event (no `touch` events logged during the strokes) |
| `pressure` | constant `0.12` while down, `0` on up: **no pressure sensor** |
| `tiltX` / `tiltY` | live, e.g. 29,18 → 31,18 drifting through a stroke: tilt is real |
| `width` / `height` | 1 × 1 px |
| `isPrimary` | true |

Conclusions:
- The stylus speaks the Apple Pencil protocol well enough that iPadOS treats it as a pen.
  Palm rejection is the OS's job; the capacitive-stylus heuristics in `penmode.ts` are not
  needed for this stylus and stay as an opt-in fallback.
- Because Excalidraw only simulates pressure when an event reports exactly 0.5, the raw
  0.12 would produce thin uniform strokes. Fix: override the `PointerEvent.pressure` getter
  to return 0.5 for pen events (`installPenPressureNormalizer`), on by default in the board
  spike. A first attempt that re-dispatched cloned events was dropped because Excalidraw's
  `setPointerCapture` throws on the clone.

Issues found and fixed in the spike page itself:
- Strokes landed ~100 px left of the tip (vertical fine). Cause: the canvas backing store
  was sized once at load; the log pane then grew and shrank the canvas, so the backing
  store was stretched. Fixed with a `ResizeObserver` and a fixed-width log pane.
- "Copy log" did nothing: `navigator.clipboard` needs HTTPS. Added an `execCommand`
  fallback for plain-HTTP LAN testing.

## 3. Whiteboard (iPad 11, Safari, generic stylus) — 2026-10-12

**Result: PASS.** Writing feels good with the palm resting or lifted: iPadOS palm rejection
holds up inside Excalidraw. Simulated pressure (the `PointerEvent.pressure` override) is
visibly doing its job; with it off the strokes are thin and uniform.

Decision: Excalidraw with native pen handling plus the pressure override is the whiteboard
for Phase 1. The capacitive-stylus palm filter stays opt-in and off.

## 2. Audio + screen share (Windows Chrome/Edge ↔ iPad Safari, same Wi-Fi) — 2026-10-12

Served over HTTPS on the LAN with a self-signed certificate (`npm run dev:https`, port
5174); LiveKit Cloud Build plan; pre-minted tokens in the URL fragment.

**Result: PASS.**

| Check | Result |
|-------|--------|
| Audio both ways | Working |
| Data-channel round trip (Ping) | 36–48 ms on the LAN; 70–170 ms via the GitHub Pages link (traffic relayed through LiveKit's SFU) |
| Excel window shared from Windows | Visible on the iPad |
| Pre-minted token join links | Working on both devices |

Follow-up from the test: the student (the sharer) could not see their own share inside the
app. Added a self-view: the local screen-share track is attached to the same video element
so the share pane shows Excel on both sides. (Spike page updated; not yet re-tested.)

Not exercised: the TURN relay. A same-Wi-Fi test connects directly; the first cross-home
session is the real test of that, and the Build plan includes TURN.

## Phase 0 verdict — GO

All three risk items pass. Decisions carried into Phase 1:
- Web PWA, React + Vite + TypeScript, static hosting.
- LiveKit Cloud Build plan for audio, Windows screen share, and the data channel.
- Excalidraw with native pen handling plus the `PointerEvent.pressure` override.
- Pre-minted long-lived tokens in private links; no backend.
- The share pane shows the share on both devices, including the sharer's own.
