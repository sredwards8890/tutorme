import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

interface Props {
  track: Track | null;
  isLocal: boolean;
  canShare: boolean;
  onShare: () => void;
}

/** Shows the screen share: the other side's, or a self-view of our own so the sharer can see it too. */
export function SharePane({ track, isLocal, canShare, onShare }: Props) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el || !track) return;
    // Attach through LiveKit, then make sure the element really has the stream and is playing;
    // a hidden-at-attach-time element can otherwise sit black.
    track.attach(el);
    const mst = track.mediaStreamTrack;
    if (mst && !(el.srcObject instanceof MediaStream && el.srcObject.getTracks().includes(mst))) {
      el.srcObject = new MediaStream([mst]);
    }
    el.play().catch(() => { /* autoplay can be refused until a gesture; muted video normally plays */ });
    return () => { track.detach(el); el.srcObject = null; };
  }, [track]);

  return (
    <div className="share">
      <video
        ref={video} className="share-video" autoPlay playsInline muted
        style={{ display: track ? "block" : "none" }}
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
    </div>
  );
}
