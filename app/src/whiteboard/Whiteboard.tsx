import "@excalidraw/excalidraw/index.css";
import { useEffect, useMemo, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { RoomApi } from "../rtc/useRoom";
import { BoardSync } from "./sync";
import { installPenPressureNormalizer } from "./penmode";

// The tutor's stylus reports as a pen with a constant 0.12 pressure; Excalidraw only simulates
// width from velocity when pressure is exactly 0.5. Installed once for the page.
installPenPressureNormalizer(true);

interface Props {
  room: RoomApi;
  onApi: (api: ExcalidrawImperativeAPI) => void;
}

export function Whiteboard({ room, onApi }: Props) {
  const sync = useMemo(() => new BoardSync(room.send), [room.send]);
  const othersRef = useRef<string[]>([]);

  // Inbound element updates.
  useEffect(() => room.subscribe((msg) => {
    if (msg.t === "els" || msg.t === "scene") sync.onRemote(msg.els);
  }), [room, sync]);

  // When someone new appears, give them the whole board.
  useEffect(() => {
    const newcomers = room.others.filter((id) => !othersRef.current.includes(id));
    othersRef.current = room.others;
    if (newcomers.length) sync.sendFullScene();
  }, [room.others, sync]);

  return (
    <div className="whiteboard">
      <Excalidraw
        excalidrawAPI={(api) => { sync.api = api; onApi(api); }}
        onChange={(elements) => sync.onLocalChange(elements)}
        initialData={{
          appState: {
            activeTool: { type: "freedraw", customType: null, locked: true, lastActiveTool: null },
            currentItemStrokeWidth: 1,
            currentItemStrokeColor: room.role === "tutor" ? "#1e1e1e" : "#1d4ed8",
          },
        }}
        UIOptions={{
          canvasActions: { loadScene: false, export: false, saveAsImage: false, saveToActiveFile: false, toggleTheme: false },
          tools: { image: false },
        }}
      />
    </div>
  );
}
