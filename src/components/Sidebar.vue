<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  state,
  newRequest,
  newRequestIn,
  selectRequest,
  selectHistory,
  deleteHistory,
  clearHistory,
  replayHistory,
  saveHistoryToCollection,
  flattenCollections,
  currentRequestId,
  addCollection,
  deleteCollection,
  renameCollection,
  duplicateCollection,
  deleteRequest,
  renameRequest,
  findRequestEntry,
  addEnvironment,
  deleteEnvironment,
  setActiveEnv,
  toggleTheme,
  showToast,
} from "../store";
import type { ContextMenuItem, HistoryItem } from "../types";
import { confirmDialog, promptDialog, selectDialog } from "../lib/dialog";
import SettingsModal from "./SettingsModal.vue";
import ContextMenu from "./ContextMenu.vue";
import CollectionNode from "./CollectionNode.vue";
import Icon from "./Icon.vue";
import {
  copyText,
  exportFile,
  safeName,
  toCurl,
  toPostmanCollection,
  toPostmanRequest,
  toRawHttp,
} from "../lib/exporter";

const { t } = useI18n();
const varToken = "{{key}}";

type Section = "collections" | "history" | "environments";
const section = ref<Section>("collections");
const showSettings = ref(false);

interface MenuTarget {
  x: number;
  y: number;
  kind: "collection" | "request" | "history";
  collectionId?: string;
  requestId?: string;
  historyId?: string;
}
const menu = ref<MenuTarget | null>(null);
const historyKeyword = ref("");

/** History entries filtered by name / url. */
const filteredHistory = computed(() => {
  const kw = historyKeyword.value.trim().toLowerCase();
  if (!kw) return state.history;
  return state.history.filter(
    (h) =>
      h.name.toLowerCase().includes(kw) ||
      h.url.toLowerCase().includes(kw) ||
      h.method.toLowerCase().includes(kw)
  );
});

/** Find a collection anywhere in the tree. */
function findCol(id: string) {
  const walk = (list: typeof state.collections): typeof state.collections[number] | null => {
    for (const c of list) {
      if (c.id === id) return c;
      const hit = walk(c.children || []);
      if (hit) return hit;
    }
    return null;
  };
  return walk(state.collections);
}

const menuItems = computed<ContextMenuItem[]>(() => {
  const m = menu.value;
  if (!m) return [];
  if (m.kind === "history") return historyMenuItems(m.historyId);
  const col = m.collectionId ? findCol(m.collectionId) : null;
  if (!col) return [];

  if (m.kind === "collection") {
    return [
      { label: t("sidebar.newRequestIn"), action: () => newRequestIn(col.id) },
      {
        label: t("sidebar.newSubCollection"),
        action: async () => {
          const name = await promptDialog(
            t("dialog.newCollectionMsg"),
            t("dialog.newCollectionPlaceholder"),
            t("dialog.newCollectionTitle")
          );
          if (name && name.trim() && !addCollection(name.trim(), col.id))
            showToast(t("sidebar.nameExists"));
        },
      },
      {
        label: t("menu.exportCollection"),
        action: () =>
          exportFile(
            `${safeName(col.name)}.postman_collection.json`,
            JSON.stringify(toPostmanCollection(col), null, 2)
          ),
      },
      { label: t("menu.duplicate"), action: () => duplicateCollection(col.id) },
      { divider: true },
      {
        label: t("menu.rename"),
        action: async () => {
          const name = await promptDialog(
            t("dialog.renameCollectionMsg"),
            t("dialog.renameCollectionPlaceholder"),
            t("dialog.renameCollectionTitle"),
            col.name
          );
          if (name && name.trim() && !renameCollection(col.id, name.trim()))
            showToast(t("sidebar.nameExists"));
        },
      },
      {
        label: t("common.delete"),
        danger: true,
        action: async () => {
          if (
            await confirmDialog(
              t("dialog.deleteCollectionMsg"),
              t("dialog.deleteCollectionTitle")
            )
          )
            deleteCollection(col.id);
        },
      },
    ];
  }

  const entry = m.requestId ? findRequestEntry(m.requestId) : null;
  if (!entry) return [];
  const cfg = entry.req.config;
  const file = safeName(entry.req.name);
  return [
    { label: t("menu.exportCurl"), action: () => exportFile(`${file}.sh`, toCurl(cfg)) },
    {
      label: t("menu.exportPostman"),
      action: () =>
        exportFile(
          `${file}.postman.json`,
          JSON.stringify(toPostmanRequest(cfg, entry.req.name), null, 2)
        ),
    },
    { label: t("menu.exportHttp"), action: () => exportFile(`${file}.http`, toRawHttp(cfg)) },
    { divider: true },
    {
      label: t("menu.copyCurl"),
      action: async () => {
        await copyText(toCurl(cfg));
        showToast(t("menu.copied"));
      },
    },
    {
      label: t("menu.copyUrl"),
      action: async () => {
        await copyText(cfg.url);
        showToast(t("menu.copied"));
      },
    },
    { divider: true },
    {
      label: t("menu.rename"),
      action: async () => {
        const name = await promptDialog(
          t("menu.renameMsg"),
          t("menu.renamePlaceholder"),
          t("menu.renameTitle"),
          entry.req.name
        );
        if (name && name.trim()) renameRequest(entry.col.id, entry.req.id, name.trim());
      },
    },
    { divider: true },
    {
      label: t("menu.deleteRequest"),
      danger: true,
      action: async () => {
        if (
          await confirmDialog(
            t("dialog.deleteRequestMsg"),
            t("dialog.deleteRequestTitle")
          )
        )
          deleteRequest(entry.col.id, entry.req.id);
      },
    },
  ];
});

/** Right-click menu of a history entry. */
function historyMenuItems(historyId?: string): ContextMenuItem[] {
  const item = state.history.find((h) => h.id === historyId);
  if (!item) return [];
  return [
    { label: t("menu.resend"), action: () => replayHistory(item) },
    {
      label: t("menu.saveToCollection"),
      action: () => onSaveHistoryToCollection(item),
    },
    {
      label: t("menu.copyCurl"),
      action: async () => {
        await copyText(toCurl(item.config));
        showToast(t("menu.copied"));
      },
    },
    { divider: true },
    {
      label: t("common.delete"),
      danger: true,
      action: async () => {
        if (
          await confirmDialog(
            t("dialog.deleteHistoryMsg"),
            t("dialog.deleteHistoryTitle")
          )
        )
          deleteHistory(item.id);
      },
    },
  ];
}

/** Turn a one-off history entry into a saved request. */
async function onSaveHistoryToCollection(item: HistoryItem) {
  const options = flattenCollections().map((c) => ({
    label: "　".repeat(c.depth) + c.col.name,
    value: c.col.id,
  }));
  if (options.length === 0) {
    showToast(t("sidebar.noCollections"));
    return;
  }
  const target = await selectDialog(t("dialog.saveHistoryTitle"), options);
  if (!target) return;
  if (saveHistoryToCollection(item.id, target)) showToast(t("common.saved"));
}

function openHistoryMenu(e: MouseEvent, historyId: string) {
  menu.value = { x: e.clientX, y: e.clientY, kind: "history", historyId };
}

function openMenu(payload: MenuTarget) {
  if (payload.x === 0 && payload.y === 0) return;
  if (menu.value && menu.value.requestId === payload.requestId) {
    menu.value = null;
    return;
  }
  menu.value = payload;
}

async function onAction(payload: {
  action: "new-request" | "new-sub" | "rename" | "duplicate" | "delete";
  collectionId: string;
}) {
  const col = findCol(payload.collectionId);
  if (!col) return;

  if (payload.action === "new-request") {
    newRequestIn(col.id);
  } else if (payload.action === "new-sub") {
    const name = await promptDialog(
      t("dialog.newCollectionMsg"),
      t("dialog.newCollectionPlaceholder"),
      t("dialog.newCollectionTitle")
    );
    if (name && name.trim() && !addCollection(name.trim(), col.id))
      showToast(t("sidebar.nameExists"));
  } else if (payload.action === "rename") {
    const name = await promptDialog(
      t("dialog.renameCollectionMsg"),
      t("dialog.renameCollectionPlaceholder"),
      t("dialog.renameCollectionTitle"),
      col.name
    );
    if (name && name.trim() && !renameCollection(col.id, name.trim()))
      showToast(t("sidebar.nameExists"));
  } else if (payload.action === "duplicate") {
    duplicateCollection(col.id);
  } else if (payload.action === "delete") {
    if (
      await confirmDialog(
        t("dialog.deleteCollectionMsg"),
        t("dialog.deleteCollectionTitle")
      )
    )
      deleteCollection(col.id);
  }
}

function onNewRequest() {
  newRequest();
}

async function onAddCollection() {
  const name = await promptDialog(
    t("dialog.newCollectionMsg"),
    t("dialog.newCollectionPlaceholder"),
    t("dialog.newCollectionTitle")
  );
  if (name && name.trim() && !addCollection(name.trim()))
    showToast(t("sidebar.nameExists"));
}

async function onAddEnvironment() {
  const name = await promptDialog(
    t("dialog.newEnvMsg"),
    t("dialog.newEnvPlaceholder"),
    t("dialog.newEnvTitle")
  );
  if (name && name.trim()) addEnvironment(name.trim());
}

async function onDeleteEnvironment(id: string) {
  if (await confirmDialog(t("dialog.deleteEnvMsg"), t("dialog.deleteEnvTitle")))
    deleteEnvironment(id);
}

async function onDeleteHistory(id: string) {
  if (await confirmDialog(t("dialog.deleteHistoryMsg"), t("dialog.deleteHistoryTitle")))
    deleteHistory(id);
}

function onSelectHistory(id: string) {
  const item = state.history.find((h) => h.id === id);
  if (item) selectHistory(item);
}

/** Re-send a history entry and show the response in the active tab. */
async function onReplayHistory(id: string) {
  const item = state.history.find((h) => h.id === id);
  if (item) await replayHistory(item);
}

async function onClearHistory() {
  if (
    await confirmDialog(t("dialog.clearHistoryMsg"), t("dialog.clearHistoryTitle"))
  )
    clearHistory();
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
}

/** Human friendly "x minutes ago" timestamp. */
function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("time.justNow");
  if (min < 60) return t("time.minutesAgo", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("time.hoursAgo", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { n: days });
  return fmtTime(ts);
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="logo">⚡</div>
      <div class="brand-name">ApiTap</div>
      <button
        class="icon-btn"
        @click="toggleTheme"
        :title="t('common.theme')"
      >
        <Icon :name="state.theme === 'dark' ? 'moon' : 'sun'" :size="17" />
      </button>
      <button
        class="icon-btn"
        @click="showSettings = true"
        :title="t('settings.title')"
      >
        <Icon name="gear" :size="17" />
      </button>
    </div>

    <div class="side-actions">
      <button class="primary" @click="onNewRequest">+ {{ t("common.newRequest") }}</button>
    </div>

    <div class="side-tabs">
      <button :class="{ active: section === 'collections' }" @click="section = 'collections'">
        {{ t("sidebar.collections") }}
      </button>
      <button :class="{ active: section === 'history' }" @click="section = 'history'">
        {{ t("sidebar.history") }}
      </button>
      <button :class="{ active: section === 'environments' }" @click="section = 'environments'">
        {{ t("sidebar.environments") }}
      </button>
    </div>

    <div class="side-scroll">
      <!-- Collections -->
      <div v-if="section === 'collections'" class="side-collections" data-drop="root">
        <div class="side-section-head" data-drop="root">
          <span>{{ t("sidebar.collections") }}</span>
          <button @click="onAddCollection" :title="t('sidebar.newCollection')">＋</button>
        </div>
        <div v-if="state.collections.length === 0" class="empty">
          {{ t("sidebar.noCollections") }}
        </div>
        <CollectionNode
          v-for="col in state.collections"
          :key="col.id"
          :collection="col"
          :depth="0"
          @menu="openMenu"
          @action="onAction"
        />
      </div>

      <!-- History -->
      <div v-else-if="section === 'history'">
        <div class="side-section-head">
          <span>{{ t("sidebar.history") }} · {{ state.history.length }}</span>
          <button
            v-if="state.history.length"
            @click="onClearHistory"
            :title="t('sidebar.clearHistory')"
          >
            <Icon name="trash" :size="13" />
          </button>
        </div>
        <div v-if="state.history.length" class="hist-search">
          <input
            v-model="historyKeyword"
            :placeholder="t('sidebar.historySearch')"
            spellcheck="false"
          />
        </div>
        <div v-if="state.history.length === 0" class="empty">{{ t("sidebar.noHistory") }}</div>
        <div v-else-if="filteredHistory.length === 0" class="empty">
          {{ t("sidebar.noHistoryMatch") }}
        </div>
        <div
          v-for="h in filteredHistory"
          :key="h.id"
          class="hist-item"
          @click="onSelectHistory(h.id)"
          @dblclick="onReplayHistory(h.id)"
          @contextmenu.prevent="openHistoryMenu($event, h.id)"
        >
          <span class="method-pill" :class="h.method.toLowerCase()">{{ h.method }}</span>
          <div class="hist-meta">
            <div class="hist-name">{{ h.name }}</div>
            <div class="hist-url" :title="h.url">{{ h.url }}</div>
            <div class="hist-sub">
              <span :class="h.ok ? 'ok' : 'fail'">
                {{ h.ok ? h.status : h.error ? t("sidebar.historyFailed") : h.status }}
              </span>
              <span v-if="h.timeMs">{{ h.timeMs }} ms</span>
              <span>{{ relTime(h.createdAt) }}</span>
            </div>
          </div>
          <button class="req-del" @click.stop="onDeleteHistory(h.id)" :title="t('common.delete')">×</button>
        </div>
      </div>

      <!-- Environments -->
      <div v-else>
        <div class="env-head">
          <span>{{ t("sidebar.envList") }}</span>
          <button @click="onAddEnvironment" title="＋">＋</button>
        </div>
        <div v-if="state.environments.length === 0" class="empty">{{ t("sidebar.noEnvironments") }}</div>
        <div
          v-for="e in state.environments"
          :key="e.id"
          class="env-item"
          :class="{ active: state.activeEnvId === e.id }"
          @click="setActiveEnv(state.activeEnvId === e.id ? null : e.id)"
        >
          <span class="env-dot" :class="{ on: state.activeEnvId === e.id }"></span>
          <span class="env-name">{{ e.name }}</span>
          <span class="env-count">{{ e.variables.length }} {{ t("sidebar.variables") }}</span>
          <button class="req-del" @click.stop="onDeleteEnvironment(e.id)" :title="t('common.delete')">×</button>
        </div>
        <p class="env-tip">{{ t("sidebar.envTip", { token: varToken }) }}</p>
      </div>
    </div>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @close="menu = null"
    />
  </aside>
</template>
