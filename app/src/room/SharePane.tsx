import { useEffect, useRef, useState } from "react";
import type { Track } from "livekit-client";

interface Props {
  track: Track | null;
  isLocal: boolean;
  canShare: boolean;
  onShare: () => void;
}

/**
 * Shows the screen share. The other side's share plays in a <video>. Our own self-view is drawn
 * onto a <canvas> sized by JavaScript from the pane, with the <video> kept as a hidden decode
 * source: on the student's Firefox the <video> element kept a 0×0 box even while playing, for
 * reasons a headless repro on the same machine did not show, so the self-view no longer
 * depends on the video element's layout at all.
 */
export function SharePane({ track, isLocal, canShare, onShare }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hidden, setHidden] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const el = video.current;
    const cv = canvas.current;
    const box = host.current;
    if (!el || !cv || !box || !track) { setInfo(""); return; }

    const mst = track.mediaStreamTrack;
    if (mst) el.srcObject = new MediaStream([mst]);
    else track.attach(el);
    el.muted = true;
    el.play().catch(() => { /* muted video normally autoplays */ });

    // Self-view: copy frames to the canvas, "contain"-fitted, at device resolution.
    let raf = 0;
    const ctx = cv.getContext("2d");
    // Sized from the pane's live rect on every frame (cheap for one element), not only from the
    // ResizeObserver: the pane is hidden behind a tab when the share starts, and observer timing
    // around that transition proved unreliable.
    const fitCanvas = () => {
      const r = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
    };
    const draw = () => {
      fitCanvas();
      if (isLocal && ctx && el.videoWidth && el.videoHeight) {
        const s = Math.min(cv.width / el.videoWidth, cv.height / el.videoHeight);
        const w = el.videoWidth * s, h = el.videoHeight * s;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(el, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
      }
      raf = requestAnimationFrame(draw);
    };
    const ro = new ResizeObserver(fitCanvas);
    ro.observe(box);
    fitCanvas();
    if (isLocal) raf = requestAnimationFrame(draw);

    const report = () => {
      fitCanvas();
      const vr = el.getBoundingClientRect();
      const br = box.getBoundingClientRect();
      setInfo(
        `${el.videoWidth}×${el.videoHeight} frames · ready ${el.readyState} · ${el.paused ? "paused" : "playing"}` +
        ` · video box ${Math.round(vr.width)}×${Math.round(vr.height)} (${el.isConnected ? "attached" : "DETACHED"}, display ${getComputedStyle(el).display})` +
        ` · pane ${Math.round(br.width)}×${Math.round(br.height)} · canvas ${cv.width}×${cv.height}`,
      );
    };
    el.addEventListener("loadedmetadata", report);
    el.addEventListener("playing", report);
    const t = window.setInterval(report, 2000);
    report();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("loadedmetadata", report);
      el.removeEventListener("playing", report);
      window.clearInterval(t);
      if (!mst) track.detach(el);
      el.srcObject = null;
    };
  }, [track, isLocal]);

  const showSelf = !!track && isLocal && !hidden;
  const showRemote = !!track && !isLocal;

  return (
    <div className="share" ref={host}>
      {/* Remote: the video is the display. Local: the video only decodes; the canvas displays. */}
      <video
        ref={video} autoPlay playsInline muted
        className={showRemote ? "share-video" : "share-decoder"}
        title={isLocal ? "Your share (decode source)" : "Shared screen"}
      />
      <canvas ref={canvas} className="share-canvas" style={{ display: showSelf ? "block" : "none" }} title="Your share (self-view)" />
      {!track && (
        <div className="share-empty">
          <div>
            <p>No screen share yet.</p>
            {canShare ? <button className="primary" onClick={onShare}>Share Excel window</button>
                      : <p>The student can share an Excel window from Windows.</p>}
          </div>
        </div>
      )}
      {track && isLocal && hidden && (
        <div className="share-empty"><div><p>Self-view hidden. You are still sharing.</p></div></div>
      )}
      {track && (
        <div className="share-caption">
          <span>{isLocal ? "Self-view" : "Shared screen"} · {info}</span>
          {isLocal && (
            <button className="tab" onClick={() => setHidden((h) => !h)}>{hidden ? "Show self-view" : "Hide self-view"}</button>
          )}
        </div>
      )}
    </div>
  );
}
