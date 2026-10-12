import { useRef, useState, type DragEvent } from "react";
import type { ProblemImage } from "../problem/image";
import { imageFromDataTransfer } from "../problem/image";

interface Props {
  current: ProblemImage | null;
  history: ProblemImage[];
  onSelect: (id: string) => void;
  onFile: (file: Blob) => void;
  onPasteClick: () => void;
  canPasteButton: boolean;
}

/** The question being worked on: a pasted screenshot, shown identically on both devices. */
export function ProblemPane({ current, history, onSelect, onFile, onPasteClick, canPasteButton }: Props) {
  const [fit, setFit] = useState(true);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = imageFromDataTransfer(e.dataTransfer);
    if (f) onFile(f);
  };

  const picker = (
    <input
      ref={fileInput} type="file" accept="image/*" style={{ display: "none" }}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
    />
  );

  if (!current) {
    return (
      <div
        className={`problem-empty${over ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="problem-hint">
          <p><b>No problem yet.</b></p>
          <p>Snip the question (Win+Shift+S), then press <b>Ctrl+V</b> anywhere in this room. It appears on both screens.</p>
          <div className="row">
            {canPasteButton && <button className="primary" onClick={onPasteClick}>Paste from clipboard</button>}
            <button onClick={() => fileInput.current?.click()}>Choose image…</button>
          </div>
          <p className="muted">You can also drag an image file in here.</p>
          {picker}
        </div>
      </div>
    );
  }

  return (
    <div className="problem" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className={`problem-scroll${fit ? " fit" : ""}`} onDoubleClick={() => setFit((f) => !f)}>
        <img src={current.dataUrl} width={current.w} height={current.h} alt="Problem" draggable={false} />
      </div>
      <div className="problem-foot">
        <button className="tab" onClick={() => setFit((f) => !f)}>{fit ? "Zoom 1:1" : "Fit"}</button>
        {canPasteButton && <button className="tab" onClick={onPasteClick}>Paste new</button>}
        <button className="tab" onClick={() => fileInput.current?.click()}>Choose…</button>
        {picker}
        <span className="spacer" />
        <div className="thumbs">
          {history.map((p) => (
            <img
              key={p.id} src={p.dataUrl} alt="" draggable={false}
              className={p.id === current.id ? "on" : ""}
              onClick={() => onSelect(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
