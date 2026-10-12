import { useMemo, useState } from "react";
import { Join } from "./join/Join";
import { Room } from "./room/Room";
import { useRoom } from "./rtc/useRoom";

export interface LinkParams {
  url: string;
  token: string;
  identity: string;
  room: string;
}

/**
 * Private links carry the LiveKit URL and token in the fragment: /#url=...&token=...
 * Also accepted: the same pair as a query string, in case a mail client rewrote the link.
 */
function readLink(): LinkParams | null {
  const parsed = parseLinkText(location.hash) ?? parseLinkText(location.search);
  if (!parsed) return null;
  const payload = decodeJwtPayload(parsed.token);
  return { ...parsed, identity: payload.sub ?? "?", room: payload.video?.room ?? "?" };
}

/** Pull url + token out of any text: a fragment, a query string, or a whole pasted link. */
export function parseLinkText(text: string): { url: string; token: string } | null {
  let t = text.trim();
  try { t = decodeURIComponent(t); } catch { /* keep as-is */ }
  const m = t.match(/url=([^&\s]+)[&\s]+token=([^&\s#]+)/);
  if (!m) return null;
  let url = m[1];
  try { url = decodeURIComponent(url); } catch { /* keep as-is */ }
  const token = m[2].replace(/[^A-Za-z0-9._-]/g, "");
  if (!/^wss?:\/\//.test(url) || token.split(".").length !== 3) return null;
  return { url, token };
}

function decodeJwtPayload(jwt: string): { sub?: string; video?: { room?: string } } {
  try {
    const b64 = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

export function App() {
  const link = useMemo(readLink, []);
  const [joined, setJoined] = useState(false);
  const room = useRoom(link);

  if (!joined) {
    return <Join link={link} onJoin={async () => { await room.join(); setJoined(true); }} error={room.error} />;
  }
  return <Room room={room} link={link} onLeave={() => { room.leave(); setJoined(false); }} />;
}
