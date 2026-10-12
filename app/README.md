# TutorMe app

The real thing: a two-person tutoring room. See [../docs/PLAN.md](../docs/PLAN.md) for the
design and [../docs/SPIKE_RESULTS.md](../docs/SPIKE_RESULTS.md) for what was proven first.

## Run

```bash
cd app && npm install && npm run dev
```

- `npm run dev` → `http://localhost:5180` (and the LAN IP). Open with no link to use the room
  offline (whiteboard only), or with a minted link to connect.
- `npm run dev:https` → `https://<lan-ip>:5181`, self-signed, for iPad microphone testing on
  the same Wi-Fi.
- `npm run mint` → prints the two private links. Reads `app/.env`, falling back to
  `../spike/.env`. Set `BASE_URL` to where the app is served.

## Deploy

Every push to `main` builds this app to the root of the GitHub Pages site
(`https://sredwards8890.github.io/tutorme/`) and the spike under `/spike/`.

## Layout

```
src/
  App.tsx              reads the private link from the URL fragment, Join → Room
  join/Join.tsx        join screen
  room/Room.tsx        top bar, snapshot routing, pane tabs
  room/SplitPane.tsx   draggable divider
  room/SharePane.tsx   screen share video (remote, or self-view when sharing)
  room/ProblemPane.tsx placeholder until Phase 2
  rtc/useRoom.ts       LiveKit room: audio, share, speaking, chunked data channel
  rtc/messages.ts      message types and the 14 KB chunked transport
  whiteboard/          Excalidraw, two-peer sync, PNG snapshot, pen pressure override
scripts/mint-tokens.ts token minting (identities "tutor" and "student" drive the roles)
```
