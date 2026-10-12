// One hook that owns the LiveKit Room: connection, mic, speaking, screen share (remote or
// self-view), and the chunked data channel. Works "offline" (no link) so the UI can be
// developed and the whiteboard used without a server.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState, Room, RoomEvent, Track,
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

export function useRoom(link: LinkParams | null): RoomApi {
  const room = useMemo(() => new Room({ adaptiveStream: true, dynacast: true }), []);
  const [state, setState] = useState<ConnectionState | "offline">(link ? ConnectionState.Disconnected : "offline");
  const [others, setOthers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareTrack, setShareTrack] = useState<Track | null>(null);
  const [shareIsLocal, setShareIsLocal] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const reassemblers = useRef(new Map<string, Reassembler>());
  const audioHost = useRef<HTMLDivElement | null>(null);

  const identity = link?.identity ?? "student";
  const role: Role = identity === "tutor" ? "tutor" : "student";

  useEffect(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    document.body.appendChild(host);
    audioHost.current = host;

    const refreshOthers = () => setOthers([...room.remoteParticipants.values()].map((p) => p.identity));
    const onTrack = (track: RemoteTrack, _pub: unknown, _p: RemoteParticipant) => {
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
      .on(RoomEvent.Disconnected, () => { setOthers([]); setShareTrack(null); setSharing(false); setMicOn(false); });

    return () => {
      room.disconnect();
      host.remove();
    };
  }, [room]);

  const join = useCallback(async () => {
    setError(null);
    if (!link) return; // offline mode: nothing to connect to
    try {
      await room.connect(link.url, link.token);
      await room.startAudio(); // iOS: must follow a user gesture (the Join tap)
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicOn(true);
      setOthers([...room.remoteParticipants.values()].map((p) => p.identity));
      const devices = await Room.getLocalDevices("audioinput");
      setMicDevices(devices);
      setMicDeviceId(room.getActiveDevice("audioinput") ?? devices[0]?.deviceId ?? "");
    } catch (e) {
      setError((e as Error).message);
      throw e;
    }
  }, [room, link]);

  const leave = useCallback(() => { room.disconnect(); }, [room]);

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
    state, identity, role, others, speaking, error,
    micOn, toggleMic, micDevices, micDeviceId, setMicDevice,
    canShare: canShareScreen && role === "student", sharing, toggleShare, shareTrack, shareIsLocal,
    audioBlocked, unblockAudio, send, subscribe, join, leave,
  };
}
