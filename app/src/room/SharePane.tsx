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
    track.attach(el);
    return () => { track.detach(el); el.srcObject = null; };
  }, [track]);

  if (!track) {
    return (
      <div className="share-empty">
        <div>
          <p>No screen share yet.</p>
          {canShare ? <button className="primary" onClick={onShare}>Share Excel window</button>
                    : <p>The student can share an Excel window from Windows.</p>}
        </div>
      </div>
    );
  }
  return <video ref={video} className="share-video" autoPlay playsInline muted title={isLocal ? "Your share (self-view)" : "Shared screen"} />;
}
