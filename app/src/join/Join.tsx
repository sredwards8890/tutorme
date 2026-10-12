import { useState } from "react";
import { parseLinkText, type LinkParams } from "../App";

interface Props {
  link: LinkParams | null;
  onJoin: () => Promise<void>;
  error: string | null;
}

export function Join({ link, onJoin, error }: Props) {
  const [busy, setBusy] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pasteError, setPasteError] = useState("");
  const who = link ? (link.identity === "tutor" ? "Tutor" : "Student") : null;

  const join = async () => {
    setBusy(true);
    try { await onJoin(); } catch { /* error is shown from the room hook */ } finally { setBusy(false); }
  };

  // Fallback for a link that arrived mangled: paste the whole thing and we rebuild the URL.
  const usePasted = () => {
    const p = parseLinkText(pasted);
    if (!p) { setPasteError("That text does not contain a usable link. It needs both url= and token=."); return; }
    location.replace(`${location.pathname}#url=${encodeURIComponent(p.url)}&token=${encodeURIComponent(p.token)}`);
    location.reload();
  };

  return (
    <div className="join">
      <h1>TutorMe</h1>
      {link ? (
        <>
          <p>Joining room <b>{link.room}</b> as <b>{who}</b>. Your microphone turns on when you join.</p>
          <button className="primary" onClick={join} disabled={busy}>{busy ? "Joining…" : "Join"}</button>
        </>
      ) : (
        <>
          <p>This page needs a private link that includes the room and token.</p>
          <p>If your link opened this page without joining, paste the whole link here:</p>
          <textarea
            rows={4}
            value={pasted}
            onChange={(e) => { setPasted(e.target.value); setPasteError(""); }}
            placeholder="https://…/tutorme/#url=wss://…&token=…"
            style={{ fontSize: 14, padding: 10, borderRadius: 10, border: "1px solid var(--line)" }}
          />
          <button className="primary" onClick={usePasted} disabled={!pasted.trim()}>Use this link</button>
          {pasteError && <p className="error">{pasteError}</p>}
          <p>Without a link you can still open the room offline to try the whiteboard.</p>
          <button onClick={join}>Open offline</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
