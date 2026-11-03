import { reactive, watch, computed } from "vue";
import type {
  Collection,
  Environment,
  HistoryItem,
  RequestConfig,
  RequestItem,
  ResponseData,
} from "./types";
import { clone, defaultConfig, uid } from "./lib/format";
import { getData, sendRequest, setData } from "./lib/http";
import { i18n } from "./i18n";
import { decryptIfNeeded, encryptIfNeeded, initEncryption } from "./lib/crypto";

type Theme = "dark" | "light";

export interface OpenTab {
  id: string;
  name: string;
  config: RequestConfig;
  collectionId: string | null;
  requestId: string | null;
  response: ResponseData | null;
  loading: boolean;
  error: string | null;
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: "duplicate"; existingId: string };

interface StoreState {
  loaded: boolean;
  collections: Collection[];
  environments: Environment[];
  activeEnvId: string | null;
  history: HistoryItem[];
  openTabs: OpenTab[];
  activeTabId: string | null;
  theme: Theme;
  locale: string;
  toast: string | null;
}

export const state = reactive<StoreState>({
  loaded: false,
  collections: [],
  environments: [],
  activeEnvId: null,
  history: [],
  openTabs: [],
  activeTabId: null,
  theme: "dark",
  locale: "zh",
  toast: null,
});

let toastTimer: number | undefined;
/** Show a short global toast message. */
export function showToast(msg: string) {
  state.toast = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (state.toast = null), 2000);
}

export function activeEnv(): Environment | null {
  if (!state.activeEnvId) return null;
  return state.environments.find((e) => e.id === state.activeEnvId) ?? null;
}

/* ------------------------------------------------------------------ *
 * Collection tree helpers
 * ------------------------------------------------------------------ */

function newCollection(name: string): Collection {
  return { id: uid(), name, requests: [], children: [] };
}

/** Migrate persisted (possibly old flat) collections into the tree shape. */
function migrateCollection(raw: any): Collection {
  return {
    id: raw?.id || uid(),
    name: raw?.name || "Collection",
    requests: Array.isArray(raw?.requests) ? raw.requests : [],
    children: Array.isArray(raw?.children)
      ? raw.children.map(migrateCollection)
      : [],
  };
}

export function findCollection(
  id: string,
  cols: Collection[] = state.collections
): Collection | null {
  for (const c of cols) {
    if (c.id === id) return c;
    const hit = findCollection(id, c.children || []);
    if (hit) return hit;
  }
  return null;
}

export function findCollectionParent(
  id: string,
  cols: Collection[] = state.collections
): Collection | null {
  for (const c of cols) {
    if ((c.children || []).some((k) => k.id === id)) return c;
    const hit = findCollectionParent(id, c.children || []);
    if (hit) return hit;
  }
  return null;
}

export function findRequestEntry(
  requestId: string,
  cols: Collection[] = state.collections
): { col: Collection; req: RequestItem } | null {
  for (const c of cols) {
    const req = (c.requests || []).find((r) => r.id === requestId);
    if (req) return { col: c, req };
    const hit = findRequestEntry(requestId, c.children || []);
    if (hit) return hit;
  }
  return null;
}

/** All collections as a flat list with their depth (for pickers). */
export function flattenCollections(
  cols: Collection[] = state.collections,
  depth = 0
): { col: Collection; depth: number }[] {
  const out: { col: Collection; depth: number }[] = [];
  for (const c of cols) {
    out.push({ col: c, depth });
    out.push(...flattenCollections(c.children || [], depth + 1));
  }
  return out;
}

function collectRequestIds(col: Collection): string[] {
  const out = (col.requests || []).map((r) => r.id);
  for (const c of col.children || []) out.push(...collectRequestIds(c));
  return out;
}

function isDescendant(col: Collection, maybeChildId: string): boolean {
  for (const c of col.children || []) {
    if (c.id === maybeChildId) return true;
    if (isDescendant(c, maybeChildId)) return true;
  }
  return false;
}

function uniqueName(name: string, siblings: { name: string }[]): string {
  if (!siblings.some((c) => c.name === name)) return name;
  let i = 1;
  let candidate = `${name} (${i})`;
  while (siblings.some((c) => c.name === candidate)) {
    i += 1;
    candidate = `${name} (${i})`;
  }
  return candidate;
}

function cloneCollection(col: Collection): Collection {
  return {
    id: uid(),
    name: col.name,
    requests: (col.requests || []).map((r) => ({
      id: uid(),
      name: r.name,
      config: clone(r.config),
    })),
    children: (col.children || []).map(cloneCollection),
  };
}

function sameConfig(a: RequestConfig, b: RequestConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function activeTab(): OpenTab | undefined {
  return state.openTabs.find((t) => t.id === state.activeTabId);
}

function ensureActive(): OpenTab {
  let tab = activeTab();
  if (!tab) {
    tab = createTab(defaultConfig(), "未命名请求");
    state.openTabs.push(tab);
    state.activeTabId = tab.id;
  }
  return tab;
}

function createTab(
  config: RequestConfig,
  name: string,
  collectionId: string | null = null,
  requestId: string | null = null
): OpenTab {
  return {
    id: uid(),
    name,
    config: clone(config),
    collectionId,
    requestId,
    response: null,
    loading: false,
    error: null,
  };
}

// --- Computed accessors (active tab mirrors the previous single-request state) ---
export const current = computed<RequestConfig>({
  get: () => activeTab()?.config ?? defaultConfig(),
  set: (v) => {
    ensureActive().config = v;
  },
});
export const currentName = computed<string>({
  get: () => activeTab()?.name ?? "",
  set: (v) => {
    ensureActive().name = v;
  },
});
export const currentRequestId = computed(() => activeTab()?.requestId ?? null);
export const currentCollectionId = computed(() => activeTab()?.collectionId ?? null);
export const response = computed(() => activeTab()?.response ?? null);
export const loading = computed(() => activeTab()?.loading ?? false);
export const error = computed(() => activeTab()?.error ?? null);

// --- Persistence ---
async function loadKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getData(key);
    if (raw) return JSON.parse(await decryptIfNeeded(raw)) as T;
  } catch (e) {
    console.warn("loadKey failed", key, e);
  }
  return fallback;
}

let persistStarted = false;
let saveTimer: number | undefined;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 400);
}

function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  persist();
}

async function persist() {
  try {
    const entries: [string, unknown][] = [
      ["collections", state.collections],
      ["environments", state.environments],
      ["history", state.history],
      ["openTabs", state.openTabs],
      ["activeTabId", state.activeTabId],
      ["theme", state.theme],
      ["locale", state.locale],
      ["activeEnvId", state.activeEnvId],
    ];
    await Promise.all(
      entries.map(async ([key, value]) => {
        const text = JSON.stringify(value);
        await setData(key, await encryptIfNeeded(text));
      })
    );
  } catch (e) {
    console.warn("persist failed", e);
  }
}

function startPersistence() {
  if (persistStarted) return;
  persistStarted = true;
  watch(
    () => [
      state.collections,
      state.environments,
      state.history,
      state.openTabs,
      state.activeTabId,
      state.theme,
      state.activeEnvId,
      state.locale,
    ],
    scheduleSave,
    { deep: true }
  );
  // Flush pending changes when the window is about to close so that
  // reopening always restores the latest tabs/content.
  window.addEventListener("pagehide", () => persist());
  window.addEventListener("beforeunload", () => persist());
}

export async function initStore() {
  await initEncryption();
  const [collections, environments, history, openTabs, activeTabId, theme, activeEnvId, locale] =
    await Promise.all([
      loadKey<Collection[]>("collections", []),
      loadKey<Environment[]>("environments", []),
      loadKey<HistoryItem[]>("history", []),
      loadKey<OpenTab[]>("openTabs", []),
      loadKey<string | null>("activeTabId", null),
      loadKey<Theme>("theme", "dark"),
      loadKey<string | null>("activeEnvId", null),
      loadKey<string>("locale", "zh"),
    ]);

  state.collections =
    collections.length > 0
      ? collections.map(migrateCollection)
      : [newCollection("默认集合")];
  state.environments = environments;
  state.history = history;

  let tabs = openTabs ?? [];
  state.openTabs = tabs;
  state.activeTabId =
    activeTabId && tabs.some((t) => t.id === activeTabId)
      ? activeTabId
      : tabs[0]?.id ?? null;

  state.theme = theme;
  state.activeEnvId = activeEnvId;
  state.locale = locale === "en" ? "en" : "zh";
  state.loaded = true;

  startPersistence();
}

// --- Tab management ---
export function newRequest() {
  const tab = createTab(defaultConfig(), "未命名请求");
  state.openTabs.push(tab);
  state.activeTabId = tab.id;
  saveNow();
}

/** Create a new request page already bound to a collection. */
export function newRequestIn(collectionId: string) {
  const tab = createTab(defaultConfig(), "未命名请求", collectionId, null);
  state.openTabs.push(tab);
  state.activeTabId = tab.id;
  saveNow();
}

export function activateTab(id: string) {
  state.activeTabId = id;
  saveNow();
}

export function closeTab(id: string) {
  const idx = state.openTabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  state.openTabs.splice(idx, 1);
  if (state.activeTabId === id) {
    const fallback = state.openTabs[Math.max(0, idx - 1)];
    state.activeTabId = fallback ? fallback.id : null;
  }
  saveNow();
}

export function closeOtherTabs(id: string) {
  const keep = state.openTabs.filter((t) => t.id === id);
  if (keep.length === 0) return;
  state.openTabs = keep;
  state.activeTabId = id;
  saveNow();
}

export function closeAllTabs() {
  state.openTabs = [];
  state.activeTabId = null;
  saveNow();
}

export function renameTab(id: string, name: string) {
  const tab = state.openTabs.find((t) => t.id === id);
  if (!tab) return;
  tab.name = name;
  saveNow();
}

export function closeActiveTab() {
  if (state.activeTabId) closeTab(state.activeTabId);
}

export function selectRequest(collectionId: string, requestId: string) {
  const entry = findRequestEntry(requestId);
  if (!entry) return;
  const existing = state.openTabs.find((t) => t.requestId === requestId);
  if (existing) {
    state.activeTabId = existing.id;
    saveNow();
    return;
  }
  const tab = createTab(
    entry.req.config,
    entry.req.name,
    entry.col.id,
    requestId
  );
  state.openTabs.push(tab);
  state.activeTabId = tab.id;
  saveNow();
}

export function selectHistory(item: HistoryItem): OpenTab {
  // Reuse an already opened tab with the same request instead of piling up.
  const existing = state.openTabs.find((t) => sameConfig(t.config, item.config));
  if (existing) {
    state.activeTabId = existing.id;
    saveNow();
    return existing;
  }
  const tab = createTab(item.config, item.name);
  state.openTabs.push(tab);
  state.activeTabId = tab.id;
  saveNow();
  return tab;
}

/** Open the history entry and send it again right away. */
export async function replayHistory(item: HistoryItem) {
  const tab = selectHistory(item);
  state.activeTabId = tab.id;
  await sendOnTab(tab);
}

/** Save a history entry as a request inside a collection. */
export function saveHistoryToCollection(
  historyId: string,
  collectionId: string
): boolean {
  const item = state.history.find((h) => h.id === historyId);
  const col = findCollection(collectionId);
  if (!item || !col) return false;
  const fallback = item.url || i18n.global.t("common.untitled");
  const base = item.name && item.name !== i18n.global.t("common.untitled")
    ? item.name
    : fallback;
  col.requests.push({
    id: uid(),
    name: uniqueName(base, col.requests),
    config: clone(item.config),
  });
  saveNow();
  return true;
}

export function deleteHistory(id: string) {
  const i = state.history.findIndex((h) => h.id === id);
  if (i >= 0) state.history.splice(i, 1);
  saveNow();
}

export function clearHistory() {
  state.history = [];
  saveNow();
}

export async function runSend() {
  await sendOnTab(ensureActive());
}

async function sendOnTab(tab: OpenTab) {
  if (!tab.config.url.trim()) {
    tab.error = i18n.global.t("store.urlRequired");
    return;
  }
  tab.loading = true;
  tab.error = null;
  try {
    const res = await sendRequest(tab.config, activeEnv());
    tab.response = res;
    addHistory(tab, res);
  } catch (e) {
    const msg =
      typeof e === "string"
        ? e
        : (e as Error)?.message ?? i18n.global.t("store.requestFailed");
    tab.error = msg;
    addHistory(tab, null, msg);
  } finally {
    tab.loading = false;
  }
}

function addHistory(tab: OpenTab, res: ResponseData | null, error?: string) {
  const item: HistoryItem = {
    id: uid(),
    name: tab.name || tab.config.url || i18n.global.t("common.untitled"),
    method: tab.config.method,
    url: tab.config.url,
    status: res?.status ?? 0,
    ok: res?.ok ?? false,
    timeMs: res?.timeMs ?? 0,
    createdAt: Date.now(),
    config: clone(tab.config),
    error,
  };
  state.history.unshift(item);
  if (state.history.length > 200) state.history.length = 200;
}

export function importToCurrent(config: RequestConfig) {
  const tab = ensureActive();
  tab.config = config;
  tab.response = null;
  tab.error = null;
  saveNow();
}

export function importCollection(
  name: string,
  requests: { name: string; config: RequestConfig }[],
  parentId: string | null = null
) {
  const col: Collection = {
    id: uid(),
    name: name || "Imported",
    requests: requests.map((r) => ({
      id: uid(),
      name: r.name || "Request",
      config: r.config,
    })),
    children: [],
  };
  if (parentId) {
    const parent = findCollection(parentId);
    if (parent) parent.children.push(col);
    else state.collections.push(col);
  } else {
    state.collections.push(col);
  }
  saveNow();
  return col.id;
}

/** Merge imported requests into an existing collection. */
export function mergeIntoCollection(
  collectionId: string,
  requests: { name: string; config: RequestConfig }[]
) {
  const col = findCollection(collectionId);
  if (!col) return 0;
  for (const r of requests) {
    col.requests.push({
      id: uid(),
      name: r.name || "Request",
      config: r.config,
    });
  }
  saveNow();
  return requests.length;
}

/** Save the active request into a collection. */
export function saveCurrent(
  collectionId?: string,
  overwrite = false
): SaveResult {
  const tab = ensureActive();
  const cid = collectionId ?? tab.collectionId ?? state.collections[0]?.id;
  if (!cid) return { ok: false } as SaveResult;
  const col = findCollection(cid);
  if (!col) return { ok: false } as SaveResult;

  const config = clone(tab.config);
  const name = tab.name || "未命名请求";
  const existing = tab.requestId ? findRequestEntry(tab.requestId) : null;

  if (existing) {
    // Move the request when the target collection changed.
    if (existing.col.id !== col.id) {
      const from = existing.col.requests.findIndex(
        (r) => r.id === existing.req.id
      );
      if (from >= 0) existing.col.requests.splice(from, 1);
      existing.req.name = name;
      existing.req.config = config;
      col.requests.push(existing.req);
    } else {
      existing.req.name = name;
      existing.req.config = config;
    }
    tab.requestId = existing.req.id;
    tab.collectionId = col.id;
    saveNow();
    return { ok: true };
  }

  const dup = col.requests.find((r) => r.name === name);
  if (dup && !overwrite) {
    return { ok: false, reason: "duplicate", existingId: dup.id };
  }
  if (dup) {
    dup.name = name;
    dup.config = config;
    tab.requestId = dup.id;
  } else {
    const item: RequestItem = { id: uid(), name, config };
    col.requests.push(item);
    tab.requestId = item.id;
  }
  tab.collectionId = col.id;
  saveNow();
  return { ok: true };
}

/** Create a collection. Returns false when the name already exists. */
export function addCollection(
  name: string,
  parentId: string | null = null
): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const siblings = parentId
    ? findCollection(parentId)?.children || []
    : state.collections;
  if (siblings.some((c) => c.name === trimmed)) return false;
  const col = newCollection(trimmed);
  if (parentId) {
    const parent = findCollection(parentId);
    if (!parent) return false;
    parent.children.push(col);
  } else {
    state.collections.push(col);
  }
  saveNow();
  return true;
}

export function renameCollection(id: string, name: string): boolean {
  const col = findCollection(id);
  if (!col) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const parent = findCollectionParent(id);
  const siblings = parent ? parent.children : state.collections;
  if (siblings.some((c) => c.id !== id && c.name === trimmed)) return false;
  col.name = trimmed;
  saveNow();
  return true;
}

export function deleteCollection(id: string) {
  const col = findCollection(id);
  if (!col) return;
  const reqIds = collectRequestIds(col);
  const parent = findCollectionParent(id);
  if (parent) {
    const i = parent.children.findIndex((c) => c.id === id);
    if (i >= 0) parent.children.splice(i, 1);
  } else {
    const i = state.collections.findIndex((c) => c.id === id);
    if (i >= 0) state.collections.splice(i, 1);
  }
  for (const rid of reqIds) {
    const tab = state.openTabs.find((t) => t.requestId === rid);
    if (tab) closeTab(tab.id);
  }
  saveNow();
}

/** Duplicate a collection including all nested content. */
export function duplicateCollection(id: string): string | null {
  const col = findCollection(id);
  if (!col) return null;
  const parent = findCollectionParent(id);
  const siblings = parent ? parent.children : state.collections;
  const idx = siblings.findIndex((c) => c.id === id);
  const copy = cloneCollection(col);
  copy.name = uniqueName(col.name, siblings);
  if (parent) parent.children.splice(idx + 1, 0, copy);
  else state.collections.splice(idx + 1, 0, copy);
  saveNow();
  return copy.id;
}

/** Move a collection to another parent (null = root) and position. */
export function moveCollection(
  id: string,
  targetParentId: string | null,
  index: number
) {
  const col = findCollection(id);
  if (!col) return;
  if (targetParentId === id) return;
  if (targetParentId && isDescendant(col, targetParentId)) return;
  const parent = findCollectionParent(id);
  const from = parent ? parent.children : state.collections;
  const fi = from.findIndex((c) => c.id === id);
  if (fi < 0) return;
  const to = targetParentId
    ? findCollection(targetParentId)?.children ?? null
    : state.collections;
  if (!to) return;
  // Adjust the target index before removing the item, otherwise moving an
  // entry to the end of its own list would land one slot too early.
  let pos = index;
  if (to === from && fi < pos) pos -= 1;
  from.splice(fi, 1);
  pos = Math.max(0, Math.min(pos, to.length));
  to.splice(pos, 0, col);
  saveNow();
}

/** Move a request into a collection at the given position. */
export function moveRequest(
  requestId: string,
  toCollectionId: string,
  index: number
) {
  const entry = findRequestEntry(requestId);
  if (!entry) return;
  const target = findCollection(toCollectionId);
  if (!target) return;
  const fi = entry.col.requests.findIndex((r) => r.id === requestId);
  if (fi < 0) return;
  // Adjust the target index before removing the request, otherwise moving a
  // request to the end of its own collection would land one slot too early.
  let pos = index;
  if (target === entry.col && fi < pos) pos -= 1;
  entry.col.requests.splice(fi, 1);
  pos = Math.max(0, Math.min(pos, target.requests.length));
  target.requests.splice(pos, 0, entry.req);
  const tab = state.openTabs.find((t) => t.requestId === requestId);
  if (tab) tab.collectionId = toCollectionId;
  saveNow();
}

export function renameRequest(
  collectionId: string,
  requestId: string,
  name: string
) {
  const entry = findRequestEntry(requestId);
  if (!entry) return;
  entry.req.name = name;
  // Keep an opened tab in sync with the renamed request.
  const tab = state.openTabs.find((t) => t.requestId === requestId);
  if (tab) tab.name = name;
  saveNow();
}

export function deleteRequest(collectionId: string, requestId: string) {
  const entry = findRequestEntry(requestId);
  if (!entry) return;
  const i = entry.col.requests.findIndex((r) => r.id === requestId);
  if (i >= 0) entry.col.requests.splice(i, 1);
  const tab = state.openTabs.find((t) => t.requestId === requestId);
  if (tab) closeTab(tab.id);
  saveNow();
}

export function addEnvironment(name: string) {
  state.environments.push({ id: uid(), name, variables: [] });
}

export function deleteEnvironment(id: string) {
  const i = state.environments.findIndex((e) => e.id === id);
  if (i >= 0) state.environments.splice(i, 1);
  if (state.activeEnvId === id) state.activeEnvId = null;
}

export function setActiveEnv(id: string | null) {
  state.activeEnvId = id;
}

export function setTheme(t: Theme) {
  state.theme = t;
}

export function setLocale(l: string) {
  state.locale = l === "en" ? "en" : "zh";
}

export function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
}
