import { useEffect, useMemo, useState } from "react";
import { Join } from "./join/Join";
import { Room } from "./room/Room";
import { useRoom } from "./rtc/useRoom";

export interface LinkParams {
  url: string;
  token: string;
  identity: string;
  room: string;
}

const SAVED_LINK = "tutorme.link";

/**
 * Private links carry the LiveKit URL and token in the fragment: /#url=...&token=...
 * Also accepted: the same pair as a query string (a mail client may rewrite the link), and a
 * copy saved in localStorage so a home-screen launch without the fragment still joins.
 */
function readLink(): LinkParams | null {
  const fromUrl = parseLinkText(location.hash) ?? parseLinkText(location.search);
  if (fromUrl) {
    try { localStorage.setItem(SAVED_LINK, JSON.stringify(fromUrl)); } catch { /* ignore */ }
    return withIdentity(fromUrl);
  }
  try {
    const saved = localStorage.getItem(SAVED_LINK);
    if (saved) {
      const p = JSON.parse(saved) as { url: string; token: string };
      if (p.url && p.token && !tokenExpired(p.token)) return withIdentity(p);
    }
  } catch { /* ignore */ }
  return null;
}

function withIdentity(p: { url: string; token: string }): LinkParams {
  const payload = decodeJwtPayload(p.token);
  return { ...p, identity: payload.sub ?? "?", room: payload.video?.room ?? "?" };
}

function tokenExpired(token: string): boolean {
  const exp = decodeJwtPayload(token).exp;
  return typeof exp === "number" && exp * 1000 < Date.now();
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

function decodeJwtPayload(jwt: string): { sub?: string; exp?: number; video?: { room?: string } } {
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

  // `?debug=...` opens the room without a tap so headless browsers can screenshot it.
  const debug = new URLSearchParams(location.search).get("debug");
  useEffect(() => {
    if (debug && !link && !joined) { void room.join().then(() => setJoined(true)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debug, link]);

  if (!joined) {
    return <Join link={link} onJoin={async () => { await room.join(); setJoined(true); }} error={room.error} />;
  }
  return <Room room={room} link={link} onLeave={() => { room.leave(); setJoined(false); }} />;
}
