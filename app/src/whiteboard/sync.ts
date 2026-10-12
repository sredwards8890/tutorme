// Two-peer whiteboard sync over the data channel.
// Outbound: on every Excalidraw change, send only elements whose version is newer than the
// last version we sent or received. Inbound: merge with Excalidraw's own reconcileElements
// (newest version wins, ties broken by versionNonce) and update the scene without touching
// undo history. The "known versions" map is what stops echo loops.
import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { Msg } from "../rtc/messages";

const FLUSH_MS = 80;

export class BoardSync {
  private known = new Map<string, number>();
  private pending = new Map<string, OrderedExcalidrawElement>();
  private timer: number | null = null;
  api: ExcalidrawImperativeAPI | null = null;

  constructor(private send: (msg: Msg) => void) {}

  /** Excalidraw onChange handler. */
  onLocalChange = (elements: readonly OrderedExcalidrawElement[]) => {
    let changed = false;
    for (const el of elements) {
      if ((this.known.get(el.id) ?? -1) < el.version) {
        this.known.set(el.id, el.version);
        this.pending.set(el.id, el);
        changed = true;
      }
    }
    if (changed && this.timer === null) {
      this.timer = window.setTimeout(this.flush, FLUSH_MS);
    }
  };

  private flush = () => {
    this.timer = null;
    if (!this.pending.size) return;
    const els = [...this.pending.values()];
    this.pending.clear();
    this.send({ t: "els", els });
  };

  /** Push everything (including deleted markers) so a newly joined peer catches up. */
  sendFullScene() {
    if (!this.api) return;
    const els = this.api.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[];
    for (const el of els) this.known.set(el.id, Math.max(this.known.get(el.id) ?? -1, el.version));
    this.send({ t: "scene", els });
  }

  /** Data-channel handler for "els" and "scene". */
  onRemote(els: OrderedExcalidrawElement[]) {
    if (!this.api) return;
    for (const el of els) this.known.set(el.id, Math.max(this.known.get(el.id) ?? -1, el.version));
    const local = this.api.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[];
    const merged = reconcileElements(local, els as RemoteExcalidrawElement[], this.api.getAppState());
    this.api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
  }
}
