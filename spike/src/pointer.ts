// Spike 1: log raw pointer events from the stylus and draw with the pen-mode filter applied.
import "./style.css";
import { PenModeFilter } from "./penmode";

const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="bar">
    <button id="pen" class="on">Pen mode: ON</button>
    <label>Max contact <input id="size" type="range" min="5" max="80" value="30" /> <span id="sizeV">30</span>px</label>
    <label>Pinch window <input id="pinch" type="range" min="0" max="500" step="25" value="150" /> <span id="pinchV">150</span>ms</label>
    <button id="clear">Clear</button>
    <button id="copy">Copy log</button>
  </div>
  <div class="summary" id="summary">No events yet. Draw with the stylus, then rest your palm and draw again.</div>
  <div class="fill row" style="gap:0">
    <div class="fill"><canvas class="draw" id="c"></canvas></div>
    <div class="fill side"><div class="log" id="log"></div></div>
  </div>
`;

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const logEl = document.getElementById("log")!;
const summaryEl = document.getElementById("summary")!;
const penBtn = document.getElementById("pen") as HTMLButtonElement;
const sizeIn = document.getElementById("size") as HTMLInputElement;
const pinchIn = document.getElementById("pinch") as HTMLInputElement;

const filter = new PenModeFilter({ enabled: true, maxContactSize: 30, pinchWindowMs: 150 });

function fit() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}
fit();
// Refit whenever the canvas box changes (log pane growing, Safari toolbar collapsing, rotation).
// Without this the backing store keeps its first-layout width and strokes land left of the tip.
new ResizeObserver(fit).observe(canvas);

// Summary stats
const types = new Map<string, number>();
let pressureMin = Infinity, pressureMax = -Infinity, sizeMin = Infinity, sizeMax = -Infinity;
let rejected = 0, accepted = 0;
function summarize() {
  const t = [...types.entries()].map(([k, v]) => `<span class="pill">${k}: ${v}</span>`).join("");
  const p = isFinite(pressureMin) ? `${pressureMin.toFixed(2)}–${pressureMax.toFixed(2)}` : "n/a";
  const s = isFinite(sizeMin) ? `${sizeMin.toFixed(0)}–${sizeMax.toFixed(0)}px` : "n/a";
  summaryEl.innerHTML = `${t}<span class="pill">pressure ${p}</span><span class="pill">contact ${s}</span>` +
    `<span class="pill">accepted ${accepted}</span><span class="pill">rejected ${rejected}</span>` +
    `<span class="pill">maxTouchPoints ${navigator.maxTouchPoints}</span>`;
}

const lines: string[] = [];
function log(s: string) {
  lines.push(s);
  if (lines.length > 300) lines.shift();
  logEl.textContent = lines.join("\n");
  logEl.scrollTop = logEl.scrollHeight;
}

const last = new Map<number, { x: number; y: number }>();
const colors = ["#111", "#2563eb", "#16a34a", "#9333ea", "#ea580c"];

function onPointer(ev: PointerEvent) {
  const { decision, reason } = filter.decide(ev);
  const size = Math.max(ev.width || 0, ev.height || 0);
  if (ev.type === "pointerdown") {
    types.set(ev.pointerType, (types.get(ev.pointerType) ?? 0) + 1);
    if (decision === "accept") accepted++; else rejected++;
  }
  if (ev.pointerType !== "mouse" || ev.buttons) {
    pressureMin = Math.min(pressureMin, ev.pressure); pressureMax = Math.max(pressureMax, ev.pressure);
    sizeMin = Math.min(sizeMin, size); sizeMax = Math.max(sizeMax, size);
  }
  if (ev.type !== "pointermove" || ev.buttons) {
    log(`${ev.type.padEnd(13)} id=${ev.pointerId} ${ev.pointerType.padEnd(5)} p=${ev.pressure.toFixed(2)} ` +
      `w=${(ev.width || 0).toFixed(0)} h=${(ev.height || 0).toFixed(0)} tilt=${ev.tiltX},${ev.tiltY} ` +
      `${ev.isPrimary ? "primary" : ""} -> ${decision} (${reason})`);
  }
  summarize();

  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left, y = ev.clientY - r.top;
  if (decision === "reject") {
    if (ev.type === "pointerdown") {
      ctx.fillStyle = "rgba(220,38,38,0.5)";
      ctx.beginPath(); ctx.arc(x, y, Math.max(6, size / 2), 0, Math.PI * 2); ctx.fill();
    }
    ev.preventDefault();
    return;
  }
  ev.preventDefault();
  if (ev.type === "pointerdown") {
    last.set(ev.pointerId, { x, y });
    canvas.setPointerCapture(ev.pointerId);
  } else if (ev.type === "pointermove" && ev.buttons) {
    const p = last.get(ev.pointerId);
    if (p) {
      ctx.strokeStyle = colors[ev.pointerId % colors.length];
      ctx.lineWidth = ev.pointerType === "pen" ? 1 + ev.pressure * 6 : 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(x, y); ctx.stroke();
      last.set(ev.pointerId, { x, y });
    }
  } else if (ev.type === "pointerup" || ev.type === "pointercancel") {
    last.delete(ev.pointerId);
  }
}
for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"] as const) {
  canvas.addEventListener(t, onPointer, { passive: false });
}
// Block Safari's own touch gestures on the canvas so nothing scrolls or zooms while drawing.
for (const t of ["touchstart", "touchmove", "gesturestart"]) {
  canvas.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}

penBtn.onclick = () => {
  filter.opts.enabled = !filter.opts.enabled;
  penBtn.textContent = `Pen mode: ${filter.opts.enabled ? "ON" : "OFF"}`;
  penBtn.classList.toggle("on", filter.opts.enabled);
  filter.reset();
};
sizeIn.oninput = () => { filter.opts.maxContactSize = +sizeIn.value; document.getElementById("sizeV")!.textContent = sizeIn.value; };
pinchIn.oninput = () => { filter.opts.pinchWindowMs = +pinchIn.value; document.getElementById("pinchV")!.textContent = pinchIn.value; };
document.getElementById("clear")!.onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); lines.length = 0; logEl.textContent = ""; };
document.getElementById("copy")!.onclick = async () => {
  const text = `UA: ${navigator.userAgent}\nmaxTouchPoints: ${navigator.maxTouchPoints}\n` + lines.join("\n");
  // navigator.clipboard needs HTTPS; over plain http on the LAN fall back to a selected textarea + execCommand.
  if (window.isSecureContext && navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); log("[copied to clipboard]"); return; } catch { /* fall through */ }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand("copy");
  ta.remove();
  log(ok ? "[copied to clipboard]" : "[copy blocked; select the log text manually]");
};
log(`UA: ${navigator.userAgent}`);
