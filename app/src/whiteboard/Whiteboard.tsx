import "@excalidraw/excalidraw/index.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RoomApi } from "../rtc/useRoom";
import { BoardSync } from "./sync";
import { installPenPressureNormalizer } from "./penmode";
import { debouncedSetter, kvGet } from "../persist/kv";

// The tutor's stylus reports as a pen with a constant 0.12 pressure; Excalidraw only simulates
// width from velocity when pressure is exactly 0.5. Installed once for the page.
installPenPressureNormalizer(true);

const DELETED_TTL_MS = 24 * 60 * 60 * 1000;

interface Props {
  room: RoomApi;
  roomName: string;
  onApi: (api: ExcalidrawImperativeAPI) => void;
  /** Show Excalidraw's stroke/colour/width panel. It is wide; off by default so the board is clear. */
  showProps: boolean;
}

export function Whiteboard({ room, roomName, onApi, showProps }: Props) {
  const sync = useMemo(() => new BoardSync(room.send), [room.send]);
  const othersRef = useRef<string[]>([]);
  const [initial, setInitial] = useState<OrderedExcalidrawElement[] | null>(null);
  const key = `board:${roomName}`;
  const save = useMemo(() => debouncedSetter(key, 1500), [key]);

  // Load last session's board from this device. Deleted markers older than a day are dropped.
  useEffect(() => {
    let alive = true;
    kvGet<OrderedExcalidrawElement[]>(key)
      .then((els) => {
        if (!alive) return;
        const cutoff = Date.now() - DELETED_TTL_MS;
        setInitial((els ?? []).filter((el) => !el.isDeleted || (el.updated ?? 0) > cutoff));
      })
      .catch(() => alive && setInitial([]));
    return () => { alive = false; };
  }, [key]);

  // Inbound element updates.
  useEffect(() => room.subscribe((msg) => {
    if (msg.t === "els" || msg.t === "scene") sync.onRemote(msg.els);
  }), [room, sync]);

  // Give the whole board to anyone new, and again after every (re)connect.
  useEffect(() => {
    const newcomers = room.others.filter((id) => !othersRef.current.includes(id));
    othersRef.current = room.others;
    if (newcomers.length) sync.sendFullScene();
  }, [room.others, sync]);
  useEffect(() => { if (room.epoch > 0) sync.sendFullScene(); }, [room.epoch, sync]);

  if (initial === null) return <div className="whiteboard" />;

  return (
    <div className={`whiteboard${showProps ? "" : " hide-props"}`}>
      <Excalidraw
        excalidrawAPI={(api) => {
          sync.api = api;
          // Elements restored from storage count as already known, so they are not re-broadcast
          // until they change; the full-scene send on join carries them across.
          sync.markKnown(api.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[]);
          onApi(api);
        }}
        onChange={(elements) => {
          sync.onLocalChange(elements);
          save(elements);
        }}
        initialData={{
          elements: initial,
          appState: {
            activeTool: { type: "freedraw", customType: null, locked: true, lastActiveTool: null },
            currentItemStrokeWidth: 1,
            currentItemStrokeColor: room.role === "tutor" ? "#1e1e1e" : "#1d4ed8",
          },
          scrollToContent: true,
        }}
        UIOptions={{
          canvasActions: { loadScene: false, export: false, saveAsImage: false, saveToActiveFile: false, toggleTheme: false, clearCanvas: false },
          tools: { image: false },
        }}
      />
    </div>
  );
}
