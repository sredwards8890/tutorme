// Spike 2: LiveKit audio, Windows screen share rendered on the other device, data-channel round trip.
import "./style.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Room, RoomEvent, Track, ConnectionQuality,
  type RemoteTrack, type RemoteParticipant, type Participant,
} from "livekit-client";

function paramsFromHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ""));
  return { url: h.get("url") ?? "", token: h.get("token") ?? "" };
}

const canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === "function";
const enc = new TextEncoder();
const dec = new TextDecoder();

function App() {
  const initial = paramsFromHash();
  const [url, setUrl] = useState(initial.url);
  const [token, setToken] = useState(initial.token);
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [state, setState] = useState("disconnected");
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [remote, setRemote] = useState<string[]>([]);
  const [quality, setQuality] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const pings = useRef(new Map<number, number>());

  const add = (s: string) => setLog((l) => [...l.slice(-60), `${new Date().toLocaleTimeString()} ${s}`]);

  useEffect(() => {
    const onTrack = (track: RemoteTrack, _pub: unknown, p: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        audioHost.current?.appendChild(el);
        add(`audio from ${p.identity}`);
      } else if (track.source === Track.Source.ScreenShare && videoRef.current) {
        track.attach(videoRef.current);
        add(`screen share from ${p.identity}`);
      }
    };
    const onUntrack = (track: RemoteTrack) => { track.detach().forEach((el) => el.remove()); add("track removed"); };
    const onData = (payload: Uint8Array, p?: RemoteParticipant) => {
      const msg = JSON.parse(dec.decode(payload));
      if (msg.t === "ping") {
        room.localParticipant.publishData(enc.encode(JSON.stringify({ t: "pong", id: msg.id })), { reliable: true });
      } else if (msg.t === "pong") {
        const sent = pings.current.get(msg.id);
        if (sent) add(`round trip to ${p?.identity}: ${(performance.now() - sent).toFixed(0)} ms`);
      }
    };
    const refreshRemote = () => setRemote([...room.remoteParticipants.values()].map((p) => p.identity));
    room
      .on(RoomEvent.ConnectionStateChanged, (s) => { setState(s); add(`state: ${s}`); })
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.TrackUnsubscribed, onUntrack)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.ActiveSpeakersChanged, (ps: Participant[]) => setSpeakers(ps.map((p) => p.identity)))
      .on(RoomEvent.ParticipantConnected, refreshRemote)
      .on(RoomEvent.ParticipantDisconnected, refreshRemote)
      .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
        if (p === room.localParticipant) setQuality(q);
      })
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) {
          setSharing(true);
          // Self-view: the sharer sees the same window the other side sees, so tabbing back
          // into the app still shows Excel next to the whiteboard / problem.
          if (videoRef.current && pub.track) pub.track.attach(videoRef.current);
          add("sharing: self-view attached");
        }
      })
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) {
          setSharing(false);
          pub.track?.detach().forEach((el) => { if (el instanceof HTMLVideoElement) el.srcObject = null; });
        }
      });
    return () => { room.disconnect(); };
  }, [room]);

  const join = async () => {
    try {
      await room.connect(url, token);
      await room.startAudio(); // required on iOS after a user gesture
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      setRemote([...room.remoteParticipants.values()].map((p) => p.identity));
      add(`joined as ${room.localParticipant.identity}`);
    } catch (e) {
      add(`join failed: ${(e as Error).message}`);
    }
  };
  const toggleMic = async () => {
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };
  const toggleShare = async () => {
    try {
      await room.localParticipant.setScreenShareEnabled(!sharing, { audio: false });
    } catch (e) {
      add(`share failed: ${(e as Error).message}`);
    }
  };
  const ping = () => {
    const id = Date.now();
    pings.current.set(id, performance.now());
    room.localParticipant.publishData(enc.encode(JSON.stringify({ t: "ping", id })), { reliable: true });
  };

  const connected = state === "connected";
  return (
    <>
      <div className="bar">
        {!connected ? (
          <>
            <input type="url" placeholder="wss://…livekit.cloud" value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 240 }} />
            <input type="text" placeholder="token" value={token} onChange={(e) => setToken(e.target.value)} style={{ width: 200 }} />
            <button className="on" onClick={join} disabled={!url || !token}>Join</button>
          </>
        ) : (
          <>
            <button className={micOn ? "on" : ""} onClick={toggleMic}>{micOn ? "Mic on" : "Mic off"}</button>
            {canShareScreen && (
              <button className={sharing ? "on" : ""} onClick={toggleShare}>{sharing ? "Stop share" : "Share window"}</button>
            )}
            <button onClick={ping}>Ping</button>
            <button className="danger" onClick={() => room.disconnect()}>Leave</button>
          </>
        )}
        <span className="pill">{state}</span>
        {quality && <span className="pill">quality: {quality}</span>}
        {!canShareScreen && <span className="pill">no screen share on this device (expected on iPad)</span>}
      </div>
      <div className="summary">
        Others: {remote.length ? remote.join(", ") : "nobody yet"} · Speaking: {speakers.join(", ") || "–"}
      </div>
      <div className="fill row" style={{ gap: 0 }}>
        <div className="fill" style={{ flex: 2 }}>
          <video ref={videoRef} autoPlay playsInline muted />
        </div>
        <div className="fill" style={{ flex: 1, maxWidth: "40%" }}>
          <div className="log">{log.join("\n")}</div>
        </div>
      </div>
      <div ref={audioHost} />
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
