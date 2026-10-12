import { useCallback, useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { LinkParams } from "../App";
import type { RoomApi } from "../rtc/useRoom";
import { Whiteboard } from "../whiteboard/Whiteboard";
import { snapshotToFile } from "../whiteboard/snapshot";
import { SplitPane } from "./SplitPane";
import { SharePane } from "./SharePane";
import { ProblemPane } from "./ProblemPane";

interface Props {
  room: RoomApi;
  link: LinkParams | null;
  onLeave: () => void;
}

type RightTab = "board" | "share";

export function Room({ room, link, onLeave }: Props) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [tab, setTab] = useState<RightTab>("board");
  const [toast, setToast] = useState("");

  const flash = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast(""), 2500); }, []);

  // Auto-switch to the share when one starts, back to the board when it ends.
  useEffect(() => { setTab(room.shareTrack ? "share" : "board"); }, [room.shareTrack]);

  // Snapshots always land on the student's (Windows) machine. If the student is not here,
  // whoever pressed the button saves locally instead.
  const studentPresent = room.role === "student" || room.others.includes("student");
  const iSave = room.role === "student" || !studentPresent;

  const doSnapshot = useCallback(async () => {
    if (!api) return;
    const name = await snapshotToFile(api);
    flash(name ? `Saved ${name}` : "Nothing to snapshot");
    return name;
  }, [api, flash]);

  const onSnapshotClick = async () => {
    if (iSave) await doSnapshot();
    else { room.send({ t: "snapshot", from: room.identity }); flash("Asked the student's PC to save it"); }
  };

  useEffect(() => room.subscribe(async (msg, from) => {
    if (msg.t === "snapshot" && room.role === "student") {
      const name = await doSnapshot();
      if (name) room.send({ t: "snapshot-done", name });
    } else if (msg.t === "snapshot-done") {
      flash(`Saved on the student's PC: ${msg.name}`);
    } else if (msg.t === "ping") {
      room.send({ t: "pong", id: msg.id });
    }
    void from;
  }), [room, doSnapshot, flash]);

  const stateLabel = room.state === "offline" ? "offline (no link)" : room.state;
  const otherLabel = room.others.length ? room.others.join(", ") : "waiting for the other person";

  return (
    <>
      <div className="bar">
        <span className="pill">{room.role} · {link?.room ?? "no room"}</span>
        <span className={`pill ${room.state === "connected" ? "ok" : "warn"}`}>{stateLabel}</span>
        <span className="pill">
          <span className={`dot${[...room.speaking].some((id) => id !== room.identity) ? " speaking" : ""}`} />
          {otherLabel}
        </span>
        <span className="spacer" />
        <button className={room.micOn ? "on" : ""} onClick={room.toggleMic}>
          <span className={`dot${room.speaking.has(room.identity) ? " speaking" : ""}`} style={{ marginRight: 6 }} />
          {room.micOn ? "Mic on" : "Mic off"}
        </button>
        {room.micDevices.length > 1 && (
          <select value={room.micDeviceId} onChange={(e) => room.setMicDevice(e.target.value)} aria-label="Microphone">
            {room.micDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}
          </select>
        )}
        {room.canShare && (
          <button className={room.sharing ? "on" : ""} onClick={room.toggleShare}>{room.sharing ? "Stop share" : "Share Excel"}</button>
        )}
        <button onClick={onSnapshotClick} disabled={!api}>Snapshot</button>
        <button className="danger" onClick={onLeave}>Leave</button>
      </div>

      <SplitPane
        left={
          <>
            <div className="pane-head">Problem</div>
            <div className="pane-body"><ProblemPane /></div>
          </>
        }
        right={
          <>
            <div className="pane-head">
              <button className={`tab${tab === "board" ? " on" : ""}`} onClick={() => setTab("board")}>Whiteboard</button>
              <button className={`tab${tab === "share" ? " on" : ""}`} onClick={() => setTab("share")}>
                {room.shareTrack ? (room.shareIsLocal ? "Your share" : "Shared screen") : "Share"}
              </button>
            </div>
            <div className="pane-body" style={{ display: tab === "board" ? "block" : "none" }}>
              <Whiteboard room={room} onApi={setApi} />
            </div>
            <div className="pane-body" style={{ display: tab === "share" ? "block" : "none" }}>
              <SharePane track={room.shareTrack} isLocal={room.shareIsLocal} canShare={room.canShare} onShare={room.toggleShare} />
            </div>
            {toast && <div className="toast">{toast}</div>}
          </>
        }
      />

      {room.error && <div className="toast" style={{ background: "#dc2626" }}>{room.error}</div>}
      {room.audioBlocked && (
        <div className="audio-blocked">
          <button className="primary" onClick={room.unblockAudio}>Tap to enable audio</button>
        </div>
      )}
    </>
  );
}
