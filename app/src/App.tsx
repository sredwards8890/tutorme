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

/** Private links carry the LiveKit URL and token in the fragment: /#url=...&token=... */
function readLink(): LinkParams | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  const url = h.get("url");
  const token = h.get("token");
  if (!url || !token) return null;
  const payload = decodeJwtPayload(token);
  return { url, token, identity: payload.sub ?? "?", room: payload.video?.room ?? "?" };
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
