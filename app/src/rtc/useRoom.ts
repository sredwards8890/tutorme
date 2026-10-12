// One hook that owns the LiveKit Room: connection (with reconnect), mic, speaking, screen
// share (remote or self-view), and the chunked data channel. Works "offline" (no link) so
// the UI can be developed and the whiteboard used without a server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState, DisconnectReason, Room, RoomEvent, Track,
  type LocalTrackPublication, type Participant, type RemoteParticipant, type RemoteTrack,
} from "livekit-client";
import type { LinkParams } from "../App";
import { encodeChunks, Reassembler, type Msg } from "./messages";

export type Role = "tutor" | "student";
export type Listener = (msg: Msg, from: string) => void;

export interface RoomApi {
  state: ConnectionState | "offline";
  identity: string;
  role: Role;
  others: string[];
  speaking: Set<string>;
  error: string | null;
  /** Increments every time the connection is (re)established; consumers resend their state. */
  epoch: number;
  micOn: boolean;
  toggleMic: () => Promise<void>;
  micDevices: MediaDeviceInfo[];
  micDeviceId: string;
  setMicDevice: (id: string) => Promise<void>;
  canShare: boolean;
  sharing: boolean;
  toggleShare: () => Promise<void>;
  shareTrack: Track | null;
  shareIsLocal: boolean;
  audioBlocked: boolean;
  unblockAudio: () => Promise<void>;
  send: (msg: Msg) => void;
  subscribe: (fn: Listener) => () => void;
  join: () => Promise<void>;
  leave: () => void;
}

export const canShareScreen = typeof navigator.mediaDevices?.getDisplayMedia === "function";
const RETRY_MS = [2000, 4000, 8000, 15000, 30000];

export function useRoom(link: LinkParams | null): RoomApi {
  // No adaptiveStream: it pauses a remote video whose element is hidden or tiny, which bites a
  // share pane that lives behind a tab. Two people on one share do not need the bandwidth savings.
  const room = useMemo(() => new Room({ adaptiveStream: false, dynacast: true }), []);
  const [state, setState] = useState<ConnectionState | "offline">(link ? ConnectionState.Disconnected : "offline");
  const [others, setOthers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareTrack, setShareTrack] = useState<Track | null>(null);
  const [shareIsLocal, setShareIsLocal] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const reassemblers = useRef(new Map<string, Reassembler>());
  const wantConnected = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const retryCount = useRef(0);
  const micOnRef = useRef(false);
  // The event-wiring effect below must run exactly once per Room (its cleanup disconnects), so
  // anything it calls that can change identity is reached through a ref.
  const scheduleRetryRef = useRef<() => void>(() => {});

  const identity = link?.identity ?? "student";
  const role: Role = identity === "tutor" ? "tutor" : "student";

  const refreshOthers = useCallback(() => {
    setOthers([...room.remoteParticipants.values()].map((p) => p.identity));
  }, [room]);

  const connect = useCallback(async () => {
    if (!link) return;
    await room.connect(link.url, link.token);
    retryCount.current = 0;
    refreshOthers();
    setEpoch((e) => e + 1);
  }, [room, link, refreshOthers]);

  const scheduleRetry = useCallback(() => {
    if (!wantConnected.current || retryTimer.current !== null) return;
    const delay = RETRY_MS[Math.min(retryCount.current, RETRY_MS.length - 1)];
    retryCount.current++;
    setError(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s…`);
    retryTimer.current = window.setTimeout(async () => {
      retryTimer.current = null;
      if (!wantConnected.current) return;
      try {
        await connect();
        setError(null);
        if (micOnRef.current) await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        scheduleRetryRef.current();
      }
    }, delay);
  }, [connect, room]);
  useEffect(() => { scheduleRetryRef.current = scheduleRetry; }, [scheduleRetry]);
  useEffect(() => { micOnRef.current = micOn; }, [micOn]);

  useEffect(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    document.body.appendChild(host);

    const onTrack = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        host.appendChild(track.attach());
      } else if (track.source === Track.Source.ScreenShare) {
        setShareTrack(track);
        setShareIsLocal(false);
      }
    };
    const onUntrack = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      if (track.source === Track.Source.ScreenShare) setShareTrack((t) => (t === track ? null : t));
    };
    const onData = (payload: Uint8Array, p?: RemoteParticipant) => {
      const from = p?.identity ?? "?";
      let r = reassemblers.current.get(from);
      if (!r) { r = new Reassembler(); reassemblers.current.set(from, r); }
      const msg = r.push(payload);
      if (msg) for (const fn of listeners.current) fn(msg, from);
    };
    const onLocalPublished = (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.ScreenShare && pub.track) {
        setSharing(true);
        setShareTrack(pub.track);
        setShareIsLocal(true);
      }
    };
    const onLocalUnpublished = (pub: LocalTrackPublication) => {
      if (pub.source === Track.Source.ScreenShare) {
        setSharing(false);
        setShareTrack((t) => (t === pub.track ? null : t));
      }
    };
    const onDisconnected = (reason?: DisconnectReason) => {
      setOthers([]); setShareTrack(null); setSharing(false);
      if (reason === DisconnectReason.CLIENT_INITIATED || !wantConnected.current) { setMicOn(false); return; }
      scheduleRetryRef.current();
    };

    room
      .on(RoomEvent.ConnectionStateChanged, (s) => setState(s))
      .on(RoomEvent.ParticipantConnected, refreshOthers)
      .on(RoomEvent.ParticipantDisconnected, refreshOthers)
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.TrackUnsubscribed, onUntrack)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.ActiveSpeakersChanged, (ps: Participant[]) => setSpeaking(new Set(ps.map((p) => p.identity))))
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.MediaDevicesError, (e: Error) => setError(`Device error: ${e.message}`))
      .on(RoomEvent.Reconnected, () => { setError(null); refreshOthers(); setEpoch((e) => e + 1); })
      .on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      wantConnected.current = false;
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
      room.disconnect();
      host.remove();
    };
    // Runs once per Room: refreshOthers is stable ([room]) and everything else goes through refs.
  }, [room, refreshOthers]);

  const join = useCallback(async () => {
    setError(null);
    if (!link) {
      // Offline mode: nothing to connect to. `?debug=share` fakes a local share from a canvas so
      // the share pane can be inspected in any browser without a LiveKit session.
      if (new URLSearchParams(location.search).get("debug") === "share") {
        const c = document.createElement("canvas");
        c.width = 915; c.height = 1080;
        const g = c.getContext("2d")!;
        g.fillStyle = "#0a0"; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = "#fff"; g.fillRect(100, 100, 700, 300);
        const mst = c.captureStream(5).getVideoTracks()[0];
        const fake = { mediaStreamTrack: mst, attach: () => undefined, detach: () => [] } as unknown as Track;
        setShareTrack(fake);
        setShareIsLocal(true);
        setSharing(true);
      }
      return;
    }
    wantConnected.current = true;
    try {
      await connect();
      await room.startAudio(); // iOS: must follow a user gesture (the Join tap)
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      const devices = await Room.getLocalDevices("audioinput");
      setMicDevices(devices);
      setMicDeviceId(room.getActiveDevice("audioinput") ?? devices[0]?.deviceId ?? "");
    } catch (e) {
      wantConnected.current = false;
      setError((e as Error).message);
      throw e;
    }
  }, [room, link, connect]);

  const leave = useCallback(() => {
    wantConnected.current = false;
    if (retryTimer.current !== null) { window.clearTimeout(retryTimer.current); retryTimer.current = null; }
    room.disconnect();
  }, [room]);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    if (link) await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  }, [room, link, micOn]);

  const setMicDevice = useCallback(async (id: string) => {
    await room.switchActiveDevice("audioinput", id);
    setMicDeviceId(id);
  }, [room]);

  const toggleShare = useCallback(async () => {
    try {
      await room.localParticipant.setScreenShareEnabled(!sharing, { audio: false });
    } catch (e) {
      const msg = (e as Error).message;
      if (!/permission|cancel|abort/i.test(msg)) setError(`Share failed: ${msg}`);
    }
  }, [room, sharing]);

  const unblockAudio = useCallback(async () => { await room.startAudio(); }, [room]);

  const send = useCallback((msg: Msg) => {
    if (!link || room.state !== ConnectionState.Connected) return;
    for (const chunk of encodeChunks(msg)) {
      void room.localParticipant.publishData(chunk, { reliable: true });
    }
  }, [room, link]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  return {
    state, identity, role, others, speaking, error, epoch,
    micOn, toggleMic, micDevices, micDeviceId, setMicDevice,
    canShare: canShareScreen && role === "student", sharing, toggleShare, shareTrack, shareIsLocal,
    audioBlocked, unblockAudio, send, subscribe, join, leave,
  };
}
