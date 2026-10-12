import { useRef, useState, type ReactNode } from "react";

export type Maximized = "left" | "right" | null;

interface Props {
  left: ReactNode;
  right: ReactNode;
  /** Initial left-pane share of the width, 0..1. */
  initial?: number;
  maximized: Maximized;
}

/** Two panes with a draggable divider (mouse, finger or stylus), or one pane maximized. */
export function SplitPane({ left, right, initial = 0.42, maximized }: Props) {
  const [ratio, setRatio] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !host.current) return;
    const r = host.current.getBoundingClientRect();
    const next = (e.clientX - r.left) / r.width;
    setRatio(Math.min(0.8, Math.max(0.2, next)));
  };
  const end = () => setDragging(false);

  const leftStyle = maximized === "left" ? { flex: 1 } : maximized === "right" ? { display: "none" } : { flex: `0 0 calc(${ratio * 100}% - 5px)` };
  const rightStyle = maximized === "right" ? { flex: 1 } : maximized === "left" ? { display: "none" } : { flex: 1 };

  return (
    <div className="room" ref={host}>
      <div className="pane" style={leftStyle}>{left}</div>
      {!maximized && (
        <div
          className={`divider${dragging ? " dragging" : ""}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerCancel={end}
          aria-label="Resize panes"
          role="separator"
        />
      )}
      <div className="pane" style={rightStyle}>{right}</div>
    </div>
  );
}
