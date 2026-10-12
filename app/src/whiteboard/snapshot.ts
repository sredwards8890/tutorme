import { exportToBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function download(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/**
 * Export the selection (or the whole board) as a 2× PNG and save it via the browser's download.
 * `wholeBoard` ignores the selection.
 */
export async function snapshotToFile(api: ExcalidrawImperativeAPI, wholeBoard = false): Promise<string | null> {
  const all = api.getSceneElements();
  const selectedIds = api.getAppState().selectedElementIds;
  const selected = wholeBoard ? [] : all.filter((el) => selectedIds[el.id]);
  const elements = selected.length ? selected : all;
  if (!elements.length) return null;

  const blob = await exportToBlob({
    elements,
    appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff", exportWithDarkMode: false },
    files: api.getFiles(),
    mimeType: "image/png",
    getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
  });
  const name = `tutorme-${stamp()}.png`;
  download(blob, name);
  return name;
}

/**
 * Archive the whole board for a new session: a PNG to look at plus an .excalidraw file that can
 * be reopened at excalidraw.com if they ever want to edit it again. Returns the file names.
 */
export async function archiveBoard(api: ExcalidrawImperativeAPI): Promise<string[]> {
  const names: string[] = [];
  const png = await snapshotToFile(api, true);
  if (png) names.push(png);
  const elements = api.getSceneElements();
  if (elements.length) {
    const json = serializeAsJSON(elements, api.getAppState(), api.getFiles(), "local");
    const name = `tutorme-${stamp()}.excalidraw`;
    download(new Blob([json], { type: "application/json" }), name);
    names.push(name);
  }
  return names;
}
