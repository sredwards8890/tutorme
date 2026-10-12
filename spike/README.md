# TutorMe Phase 0 spike

Throwaway pages that answer the go/no-go questions in [../docs/PLAN.md](../docs/PLAN.md).
Nothing here is meant to survive into the real app except `src/penmode.ts` if it proves out.

## Run locally

```bash
cd spike && npm install && npm run dev
```

`npm run dev` binds to all interfaces, so the iPad can open `http://<your-pc-lan-ip>:5173`
on the same Wi-Fi. The pointer and board pages work over plain HTTP.

Safari needs HTTPS for the microphone, so the audio test uses a second server:

```bash
cd spike && npm run dev:https
```

That serves `https://<your-pc-lan-ip>:5174` with a self-signed certificate. On the iPad,
Safari will warn once: tap **Show Details**, then **visit this website**. Set
`BASE_URL=https://<your-pc-lan-ip>:5174` in `.env` before minting so the links point there.
This only covers same-Wi-Fi testing; the cross-home test needs a real deploy (below).

## Deploy (free, for testing from both homes)

GitHub Pages, via `.github/workflows/pages.yml`: every push to `main` builds the app to the
site root and this spike (`--mode pages`, base `/tutorme/spike/`) to
`https://sredwards8890.github.io/tutorme/spike/`. Set `BASE_URL` in `.env` to that URL
before minting spike tokens for cross-home use. Pages is free for public repos only.

## Pages

| Page | Question it answers | Pass looks like |
|------|---------------------|-----------------|
| `/pointer.html` | Does the generic stylus arrive as `pen` or `touch`? Any pressure or contact size? Does the palm filter reject the palm and keep the stylus? | Drawing feels right with the palm resting; rejected palm touches show as red dots, stylus strokes draw. Note the contact-size values in the log and tune the slider. |
| `/rtc.html` | Can the two devices hear each other? Does an Excel window share from Windows show on the iPad? Data-channel round trip? | Both hear audio, speaking indicator flips, Excel is legible on the iPad, ping under ~300 ms. |
| `/board.html` | Does Excalidraw feel usable on the iPad with the pen filter? Does Snapshot produce a usable PNG on Windows? | Writing is smooth, pinch zoom works with two fingers, Snapshot downloads a PNG of the selection or whole board. |

## Tokens for the audio test

1. Create a free LiveKit Cloud project, copy the URL, API key and secret into `.env`
   (see `.env.example`).
2. `npm run mint` prints one private link per person. Each link opens `/rtc.html` with the
   URL and token in the fragment, then press **Join**.
3. Re-run to rotate. Never commit `.env`.

## What to record after the test

Paste the pointer log (the **Copy log** button) and your notes into `docs/SPIKE_RESULTS.md`,
one section per page. The stylus result decides whether the real app needs the pen-mode
filter or can rely on `pointerType === "pen"`.
