/**
 * Pointer based drag & drop.
 *
 * The macOS WKWebView used by Tauri cannot start native HTML5 drag
 * sessions, so dragging is implemented with plain mouse events.
 *
 * Usage:
 *  - the drag source calls `startDrag(mouseEvent, payload, onDrop)`
 *  - potential drop targets carry `data-drop` attributes:
 *      data-drop="collection"  data-drop-collection="<collection id>"
 *      data-drop="request"     data-drop-collection="<collection id>"
 *                              data-drop-request="<request id>"
 *                              data-drop-index="<index in collection>"
 *      data-drop="root"
 */

export type DragKind = "collection" | "request";
export type DropKind = "collection" | "request" | "root";

export interface DragSource {
  kind: DragKind;
  id: string;
  label?: string;
}

export interface DropTarget {
  kind: DropKind;
  collectionId: string;
  requestId?: string;
  index?: number;
  /** Insert after the referenced request instead of before it. */
  after?: boolean;
}

/** Distance (px) the pointer must travel before a drag actually starts. */
const THRESHOLD = 4;

let ghost: HTMLElement | null = null;
let highlighted: HTMLElement | null = null;
let active = false;
let source: DragSource | null = null;
let handler: ((s: DragSource, t: DropTarget) => void) | null = null;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;
let suppressClick = false;

function createGhost(label: string) {
  const el = document.createElement("div");
  el.className = "drag-ghost";
  el.textContent = label;
  document.body.appendChild(el);
  ghost = el;
}

function moveGhost(x: number, y: number) {
  if (!ghost) return;
  ghost.style.transform = `translate3d(${x + 14}px, ${y + 12}px, 0)`;
}

function clearHighlight() {
  if (highlighted) {
    highlighted.classList.remove("drop-active", "drop-after");
    highlighted = null;
  }
}

/** Resolve the drop target under the pointer. */
function resolveTarget(
  x: number,
  y: number
): { target: DropTarget; el: HTMLElement } | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const box = el.closest("[data-drop]") as HTMLElement | null;
  if (!box) return null;
  const kind = box.dataset.drop as DropKind;
  const raw = box.dataset.dropIndex;
  let index = raw !== undefined && raw !== "" ? Number(raw) : undefined;
  let after = false;
  if (kind === "request" || kind === "collection") {
    // Lower half of the row means "after", upper half means "before".
    const rect = box.getBoundingClientRect();
    after = y > rect.top + rect.height / 2;
    if (kind === "request" && after && index !== undefined) index += 1;
  }
  return {
    target: {
      kind,
      collectionId: box.dataset.dropCollection || "",
      requestId: box.dataset.dropRequest || undefined,
      index,
      after,
    },
    el: box,
  };
}

/** Swallow the click event that follows a finished drag. */
function swallowNextClick() {
  suppressClick = true;
  const onClick = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    document.removeEventListener("click", onClick, true);
  };
  document.addEventListener("click", onClick, true);
  window.setTimeout(() => {
    document.removeEventListener("click", onClick, true);
    suppressClick = false;
  }, 300);
}

/** Start a pointer drag. `onDrop` runs when the pointer is released. */
export function startDrag(
  e: MouseEvent,
  payload: DragSource,
  onDrop: (s: DragSource, t: DropTarget) => void
) {
  if (e.button !== 0) return;
  // Prevent the browser from starting a text selection while dragging.
  e.preventDefault();
  source = payload;
  handler = onDrop;
  active = false;
  startX = e.clientX;
  startY = e.clientY;
  lastX = e.clientX;
  lastY = e.clientY;

  const onMove = (ev: MouseEvent) => {
    if (!source) return;
    lastX = ev.clientX;
    lastY = ev.clientY;
    if (!active) {
      if (
        Math.abs(ev.clientX - startX) < THRESHOLD &&
        Math.abs(ev.clientY - startY) < THRESHOLD
      ) {
        return;
      }
      active = true;
      document.body.classList.add("is-dragging");
      document.getSelection()?.removeAllRanges();
      createGhost(payload.label || payload.id);
    }
    ev.preventDefault();
    // The webview may re-create the selection while the pointer moves.
    document.getSelection()?.removeAllRanges();
    moveGhost(ev.clientX, ev.clientY);
    clearHighlight();
    const hit = resolveTarget(ev.clientX, ev.clientY);
    if (hit) {
      highlighted = hit.el;
      highlighted.classList.add("drop-active");
      if (hit.target.after) highlighted.classList.add("drop-after");
    }
  };

  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    const wasActive = active;
    const current = source;
    const cb = handler;
    clearHighlight();
    ghost?.remove();
    ghost = null;
    document.body.classList.remove("is-dragging");
    source = null;
    handler = null;
    active = false;
    if (!wasActive || !current || !cb) return;
    swallowNextClick();
    const hit = resolveTarget(lastX, lastY);
    if (hit) cb(current, hit.target);
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

/** True right after a drag finished, so a click can be ignored. */
export function isDragClick(): boolean {
  return suppressClick;
}
