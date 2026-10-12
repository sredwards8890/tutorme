import { useState } from "react";
import type { LinkParams } from "../App";

interface Props {
  link: LinkParams | null;
  onJoin: () => Promise<void>;
  error: string | null;
}

export function Join({ link, onJoin, error }: Props) {
  const [busy, setBusy] = useState(false);
  const who = link ? (link.identity === "tutor" ? "Tutor" : "Student") : null;

  const join = async () => {
    setBusy(true);
    try { await onJoin(); } catch { /* error is shown from the room hook */ } finally { setBusy(false); }
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
          <p>This page needs a private link that includes the room and token. Ask for your link.</p>
          <p>Without one you can still open the room offline to try the whiteboard.</p>
          <button onClick={join}>Open offline</button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
