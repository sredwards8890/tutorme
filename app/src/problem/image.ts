// Turn a pasted / dropped / picked image into something small enough to send over the data
// channel and crisp enough to read a finance problem from: downscale to 1600 px wide,
// PNG first (text screenshots), JPEG if the PNG is too big.
export interface ProblemImage {
  id: string;
  dataUrl: string;
  w: number;
  h: number;
  at: number;
}

const MAX_W = 1600;
const PNG_LIMIT = 1_500_000; // chars of data URL ≈ bytes

export async function prepareProblemImage(blob: Blob): Promise<ProblemImage> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_W / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let dataUrl = c.toDataURL("image/png");
  if (dataUrl.length > PNG_LIMIT) dataUrl = c.toDataURL("image/jpeg", 0.9);
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, dataUrl, w, h, at: Date.now() };
}

/** First image file in a clipboard / drop payload, if any. */
export function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  for (const item of dt.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  for (const f of dt.files) if (f.type.startsWith("image/")) return f;
  return null;
}

/** Read an image from the system clipboard via the async API (needs HTTPS + a user gesture). */
export async function imageFromClipboard(): Promise<Blob | null> {
  if (!navigator.clipboard?.read) return null;
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return item.getType(type);
  }
  return null;
}
