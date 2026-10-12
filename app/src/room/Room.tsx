import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { LinkParams } from "../App";
import type { RoomApi } from "../rtc/useRoom";
import { Whiteboard } from "../whiteboard/Whiteboard";
import { snapshotToFile } from "../whiteboard/snapshot";
import { imageFromClipboard, imageFromDataTransfer, prepareProblemImage, type ProblemImage } from "../problem/image";
import { debouncedSetter, kvGet } from "../persist/kv";
import { SplitPane, type Maximized } from "./SplitPane";
import { SharePane } from "./SharePane";
import { ProblemPane } from "./ProblemPane";

interface Props {
  room: RoomApi;
  link: LinkParams | null;
  onLeave: () => void;
}

type RightTab = "board" | "share";
const HISTORY = 6;
const HINT_KEY = "tutorme.installHintDismissed";
const canClipboardRead = typeof navigator.clipboard?.read === "function";

function isIpadBrowser(): boolean {
  const ua = navigator.userAgent;
  const iPadLike = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    || window.matchMedia("(display-mode: standalone)").matches;
  return iPadLike && !standalone;
}

export function Room({ room, link, onLeave }: Props) {
  const roomName = link?.room ?? "offline";
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [tab, setTab] = useState<RightTab>("board");
  const [max, setMax] = useState<Maximized>(null);
  const [showProps, setShowProps] = useState(false);
  const [toast, setToast] = useState("");
  const [problems, setProblems] = useState<ProblemImage[]>([]);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(() => {
    try { return isIpadBrowser() && !localStorage.getItem(HINT_KEY); } catch { return false; }
  });
  const othersRef = useRef<string[]>([]);
  const saveProblems = useMemo(() => debouncedSetter(`problems:${roomName}`, 500), [roomName]);

  const flash = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast(""), 2500); }, []);

  // Auto-switch to the share when one starts, back to the board when it ends.
  useEffect(() => { setTab(room.shareTrack ? "share" : "board"); }, [room.shareTrack]);

  // ---- Problem image -------------------------------------------------------------------
  const current = problems.find((p) => p.id === problemId) ?? null;

  useEffect(() => {
    kvGet<{ list: ProblemImage[]; id: string | null }>(`problems:${roomName}`)
      .then((saved) => { if (saved?.list?.length) { setProblems(saved.list); setProblemId(saved.id ?? saved.list[0].id); } })
      .catch(() => { /* storage unavailable */ });
  }, [roomName]);
  useEffect(() => { if (problems.length) saveProblems({ list: problems, id: problemId }); }, [problems, problemId, saveProblems]);

  const addProblem = useCallback((p: ProblemImage, broadcast: boolean) => {
    setProblems((list) => [p, ...list.filter((x) => x.id !== p.id)].slice(0, HISTORY));
    setProblemId(p.id);
    if (broadcast) room.send({ t: "problem", id: p.id, dataUrl: p.dataUrl, w: p.w, h: p.h, at: p.at });
  }, [room]);

  const setProblemFromBlob = useCallback(async (blob: Blob) => {
    try {
      const p = await prepareProblemImage(blob);
      addProblem(p, true);
      flash("Problem shared");
    } catch (e) {
      flash(`Could not read that image: ${(e as Error).message}`);
    }
  }, [addProblem, flash]);

  // Ctrl+V anywhere in the room. Captured before Excalidraw so the image goes to the problem
  // pane rather than onto the canvas.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFromDataTransfer(e.clipboardData);
      if (!f) return;
      e.preventDefault();
      e.stopPropagation();
      void setProblemFromBlob(f);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, [setProblemFromBlob]);

  const pasteFromClipboard = useCallback(async () => {
    try {
      const blob = await imageFromClipboard();
      if (!blob) { flash("No image on the clipboard. Snip first (Win+Shift+S), then try again."); return; }
      await setProblemFromBlob(blob);
    } catch {
      flash("Clipboard access was refused. Press Ctrl+V instead.");
    }
  }, [flash, setProblemFromBlob]);

  // ---- Snapshot: always lands on the student's (Windows) machine ----------------------
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

  // ---- Clear board (both sides) ---------------------------------------------------------
  const clearBoard = () => {
    if (!api) return;
    if (!window.confirm("Clear the whiteboard for both of you? Snapshots you saved are not affected.")) return;
    room.send({ t: "clear" });
    clearLocal(api);
    flash("Board cleared");
  };

  // ---- Inbound messages ----------------------------------------------------------------
  useEffect(() => room.subscribe(async (msg) => {
    if (msg.t === "problem") {
      addProblem({ id: msg.id, dataUrl: msg.dataUrl, w: msg.w, h: msg.h, at: msg.at }, false);
    } else if (msg.t === "clear") {
      if (api) clearLocal(api);
      flash("The other person cleared the board");
    } else if (msg.t === "snapshot" && room.role === "student") {
      const name = await doSnapshot();
      if (name) room.send({ t: "snapshot-done", name });
    } else if (msg.t === "snapshot-done") {
      flash(`Saved on the student's PC: ${msg.name}`);
    } else if (msg.t === "ping") {
      room.send({ t: "pong", id: msg.id });
    }
  }), [room, api, addProblem, doSnapshot, flash]);

  // Newcomers and reconnects get the current problem (the whiteboard sends its own scene).
  const sendProblem = useCallback(() => {
    if (current) room.send({ t: "problem", id: current.id, dataUrl: current.dataUrl, w: current.w, h: current.h, at: current.at });
  }, [room, current]);
  useEffect(() => {
    const newcomers = room.others.filter((id) => !othersRef.current.includes(id));
    othersRef.current = room.others;
    if (newcomers.length) sendProblem();
  }, [room.others, sendProblem]);
  useEffect(() => { if (room.epoch > 1) sendProblem(); }, [room.epoch, sendProblem]);

  const dismissHint = () => { setShowHint(false); try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ } };

  const stateLabel = room.state === "offline" ? "offline (no link)" : room.state;
  const otherLabel = room.others.length ? room.others.join(", ") : "waiting for the other person";
  const maxBtn = (side: Maximized) => (
    <button className="icon" title={max === side ? "Restore split" : "Maximize"} onClick={() => setMax((m) => (m === side ? null : side))}>
      {max === side ? "⤡" : "⤢"}
    </button>
  );

  return (
    <>
      <div className="bar">
        <span className="pill">{room.role} · {roomName}</span>
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
        <button onClick={clearBoard} disabled={!api}>Clear board</button>
        <button className="danger" onClick={onLeave}>Leave</button>
      </div>

      {showHint && (
        <div className="hint">
          <span>Tip: add TutorMe to your Home Screen for full screen. Tap the Share icon, then <b>Add to Home Screen</b>.</span>
          <span className="spacer" />
          <button className="tab" onClick={dismissHint}>Got it</button>
        </div>
      )}

      <SplitPane
        maximized={max}
        left={
          <>
            <div className="pane-head">
              Problem
              <span className="spacer" style={{ flex: 1 }} />
              {maxBtn("left")}
            </div>
            <div className="pane-body">
              <ProblemPane
                current={current}
                history={problems}
                onSelect={setProblemId}
                onFile={(f) => void setProblemFromBlob(f)}
                onPasteClick={() => void pasteFromClipboard()}
                canPasteButton={canClipboardRead}
              />
            </div>
          </>
        }
        right={
          <>
            <div className="pane-head">
              <button className={`tab${tab === "board" ? " on" : ""}`} onClick={() => setTab("board")}>Whiteboard</button>
              <button className={`tab${tab === "share" ? " on" : ""}`} onClick={() => setTab("share")}>
                {room.shareTrack ? (room.shareIsLocal ? "Your share" : "Shared screen") : "Share"}
              </button>
              <span className="spacer" style={{ flex: 1 }} />
              {tab === "board" && (
                <button className={`icon${showProps ? " on" : ""}`} title="Pen colour and width" onClick={() => setShowProps((s) => !s)}>🎨</button>
              )}
              {maxBtn("right")}
            </div>
            <div className="pane-body" style={{ display: tab === "board" ? "block" : "none" }}>
              <Whiteboard room={room} roomName={roomName} onApi={setApi} showProps={showProps} />
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

/** Mark every element deleted with a version bump so the change path broadcasts it. */
function clearLocal(api: ExcalidrawImperativeAPI) {
  const now = Date.now();
  const els = api.getSceneElementsIncludingDeleted();
  api.updateScene({
    elements: els.map((el) => el.isDeleted ? el : ({
      ...el, isDeleted: true, version: el.version + 1, versionNonce: (Math.random() * 0x7fffffff) | 0, updated: now,
    })),
  });
}
