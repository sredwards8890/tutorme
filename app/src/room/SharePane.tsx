import { useEffect, useRef, useState } from "react";
import type { Track } from "livekit-client";

interface Props {
  track: Track | null;
  isLocal: boolean;
  canShare: boolean;
  onShare: () => void;
}

/**
 * Shows the screen share: the other side's, or a self-view of our own so the sharer can see it too.
 * Sized with absolute positioning (no percentage-height chain), because Firefox resolved the
 * earlier flex-percentage chain to a zero-height video.
 */
export function SharePane({ track, isLocal, canShare, onShare }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [hidden, setHidden] = useState(false);
  const [info, setInfo] = useState("");

  useEffect(() => {
    const el = video.current;
    if (!el || !track) { setInfo(""); return; }
    const mst = track.mediaStreamTrack;
    // Feed the element directly from the capture track; LiveKit's attach is not needed for display.
    if (mst) el.srcObject = new MediaStream([mst]);
    else track.attach(el);
    el.muted = true;
    el.play().catch(() => { /* a muted video normally autoplays; the caption shows if it did not */ });

    const report = () => {
      const r = el.getBoundingClientRect();
      setInfo(`${el.videoWidth}×${el.videoHeight} frames · box ${Math.round(r.width)}×${Math.round(r.height)} · ${el.paused ? "paused" : "playing"}`);
    };
    el.addEventListener("loadedmetadata", report);
    el.addEventListener("resize", report);
    el.addEventListener("playing", report);
    const t = window.setInterval(report, 2000);
    report();
    return () => {
      el.removeEventListener("loadedmetadata", report);
      el.removeEventListener("resize", report);
      el.removeEventListener("playing", report);
      window.clearInterval(t);
      if (!mst) track.detach(el);
      el.srcObject = null;
    };
  }, [track]);

  const showVideo = !!track && !(isLocal && hidden);

  return (
    <div className="share">
      <video
        ref={video} className="share-video" autoPlay playsInline muted
        style={{ display: showVideo ? "block" : "none" }}
        title={isLocal ? "Your share (self-view)" : "Shared screen"}
      />
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
