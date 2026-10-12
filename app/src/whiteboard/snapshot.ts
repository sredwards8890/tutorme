import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Export the selection (or the whole board) as a 2× PNG and save it via the browser's download. */
export async function snapshotToFile(api: ExcalidrawImperativeAPI): Promise<string | null> {
  const all = api.getSceneElements();
  const selectedIds = api.getAppState().selectedElementIds;
  const selected = all.filter((el) => selectedIds[el.id]);
  const elements = selected.length ? selected : all;
  if (!elements.length) return null;

  const blob = await exportToBlob({
    elements,
    appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
    files: api.getFiles(),
    mimeType: "image/png",
    getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
  });

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `tutorme-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return name;
}
