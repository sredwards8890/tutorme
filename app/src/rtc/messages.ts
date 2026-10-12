// Message types exchanged over the LiveKit data channel, plus a chunked transport.
// LiveKit caps a data packet at ~15 KiB; a long freedraw stroke or a full scene is bigger,
// so every message is JSON → bytes → fixed-size chunks with a 9-byte header, reassembled by id.
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

export type Msg =
  | { t: "els"; els: OrderedExcalidrawElement[] }       // incremental element updates
  | { t: "scene"; els: OrderedExcalidrawElement[] }     // full scene, sent when someone joins
  | { t: "problem"; id: string; dataUrl: string; w: number; h: number; at: number } // the question image
  | { t: "snapshot"; from: string }                      // "please export the board on your machine"
  | { t: "snapshot-done"; name: string }
  | { t: "ping"; id: number }
  | { t: "pong"; id: number };

const MAGIC = 0x7a;
const HEADER = 9;
const CHUNK = 14_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

let nextId = (Math.random() * 0xffffffff) >>> 0;

export function encodeChunks(msg: Msg): Uint8Array<ArrayBuffer>[] {
  const body = enc.encode(JSON.stringify(msg));
  const n = Math.max(1, Math.ceil(body.length / CHUNK));
  const id = nextId = (nextId + 1) >>> 0;
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < n; i++) {
    const slice = body.subarray(i * CHUNK, (i + 1) * CHUNK);
    const buf = new Uint8Array(new ArrayBuffer(HEADER + slice.length));
    const v = new DataView(buf.buffer);
    buf[0] = MAGIC;
    v.setUint32(1, id);
    v.setUint16(5, i);
    v.setUint16(7, n);
    buf.set(slice, HEADER);
    out.push(buf);
  }
  return out;
}

/** One per sender. Returns the message when its last chunk arrives. */
export class Reassembler {
  private parts = new Map<number, { n: number; got: number; chunks: Uint8Array[]; at: number }>();

  push(buf: Uint8Array): Msg | null {
    if (buf.length < HEADER || buf[0] !== MAGIC) return null;
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const id = v.getUint32(1), i = v.getUint16(5), n = v.getUint16(7);
    const body = buf.subarray(HEADER);
    if (n === 1) return parse(body);
    let p = this.parts.get(id);
    if (!p) {
      p = { n, got: 0, chunks: new Array(n), at: Date.now() };
      this.parts.set(id, p);
    }
    if (!p.chunks[i]) { p.chunks[i] = body; p.got++; }
    if (p.got < n) { this.gc(); return null; }
    this.parts.delete(id);
    const total = p.chunks.reduce((s, c) => s + c.length, 0);
    const joined = new Uint8Array(total);
    let off = 0;
    for (const c of p.chunks) { joined.set(c, off); off += c.length; }
    return parse(joined);
  }

  private gc() {
    const cutoff = Date.now() - 30_000;
    for (const [id, p] of this.parts) if (p.at < cutoff) this.parts.delete(id);
  }
}

function parse(bytes: Uint8Array): Msg | null {
  try { return JSON.parse(dec.decode(bytes)) as Msg; } catch { return null; }
}
