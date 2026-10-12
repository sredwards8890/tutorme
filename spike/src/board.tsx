// Spike 3: Excalidraw on the iPad with the pen-mode filter, plus Snapshot to PNG.
import "./style.css";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { PenModeFilter, installPenModeFilter, installPenPressureNormalizer } from "./penmode";

// Installed once at module load so Excalidraw never sees the stylus's raw constant pressure.
const pressure = installPenPressureNormalizer(true);

function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [penMode, setPenMode] = useState(true);
  const [maxSize, setMaxSize] = useState(30);
  const [constantWidth, setConstantWidth] = useState(true);
  const [stats, setStats] = useState({ accepted: 0, rejected: 0, lastReason: "" });
  const [toast, setToast] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const filter = useRef(new PenModeFilter({ enabled: true, maxContactSize: 30, pinchWindowMs: 150 }));

  useEffect(() => {
    filter.current.opts.enabled = penMode;
    filter.current.opts.maxContactSize = maxSize;
    filter.current.reset();
  }, [penMode, maxSize]);

  useEffect(() => { pressure.setEnabled(constantWidth); }, [constantWidth]);

  useEffect(() => {
    if (!wrapRef.current) return;
    return installPenModeFilter(wrapRef.current, filter.current, (ev, decision, reason) => {
      if (ev.type !== "pointerdown") return;
      setStats((s) => ({
        accepted: s.accepted + (decision === "accept" ? 1 : 0),
        rejected: s.rejected + (decision === "reject" ? 1 : 0),
        lastReason: `${ev.pointerType} raw p=${pressure.rawPressure(ev).toFixed(2)} seen p=${ev.pressure.toFixed(2)} → ${decision} (${reason})`,
      }));
    });
  }, []);

  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(""), 2500); };

  const snapshot = async () => {
    if (!api) return;
    const all = api.getSceneElements();
    const selectedIds = api.getAppState().selectedElementIds;
    const selected = all.filter((el) => selectedIds[el.id]);
    const elements = selected.length ? selected : all;
    if (!elements.length) { flash("Nothing to snapshot"); return; }
    const blob = await exportToBlob({
      elements,
      appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
      files: api.getFiles(),
      mimeType: "image/png",
      getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
    });
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const name = `tutorme-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.png`;
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    flash(`Saved ${name} (${selected.length ? "selection" : "whole board"})`);
  };

  return (
    <>
      <div className="bar">
        <button className={penMode ? "on" : ""} onClick={() => setPenMode((p) => !p)}>Pen mode: {penMode ? "ON" : "OFF"}</button>
        <label>Max contact <input type="range" min={5} max={80} value={maxSize} onChange={(e) => setMaxSize(+e.target.value)} /> {maxSize}px</label>
        <button className={constantWidth ? "on" : ""} onClick={() => setConstantWidth((c) => !c)} title="Ignore the stylus's constant 0.12 pressure so strokes get normal width">
          Width: {constantWidth ? "simulated" : "raw pressure"}
        </button>
        <button className="on" onClick={snapshot}>Snapshot PNG</button>
        <button onClick={() => api?.resetScene()}>Clear</button>
        <span className="pill">accepted {stats.accepted}</span>
        <span className="pill">rejected {stats.rejected}</span>
        <span className="pill">{stats.lastReason || "touch the board"}</span>
      </div>
      <div className="fill" ref={wrapRef}>
        <Excalidraw
          excalidrawAPI={setApi}
          initialData={{ appState: { activeTool: { type: "freedraw", customType: null, locked: true, lastActiveTool: null }, currentItemStrokeWidth: 1 } }}
          UIOptions={{ canvasActions: { loadScene: false, export: false, saveAsImage: false } }}
        />
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
