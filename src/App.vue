<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  state,
  initStore,
  saveCurrent,
  showToast,
  newRequest,
  current,
  currentName,
  currentCollectionId,
  flattenCollections,
  activateTab,
  closeTab,
  closeOtherTabs,
  closeAllTabs,
  renameTab,
} from "./store";
import { i18n, setVueLocale } from "./i18n";
import { useI18n } from "vue-i18n";
import type { ContextMenuItem } from "./types";
import Sidebar from "./components/Sidebar.vue";
import UrlBar from "./components/UrlBar.vue";
import RequestTabs from "./components/RequestTabs.vue";
import ResponsePanel from "./components/ResponsePanel.vue";
import ModalDialog from "./components/ModalDialog.vue";
import ImportModal from "./components/ImportModal.vue";
import ContextMenu from "./components/ContextMenu.vue";
import AppSelect from "./components/AppSelect.vue";
import {
  copyText,
  exportFile,
  safeName,
  toCurl,
  toPostmanRequest,
  toRawHttp,
} from "./lib/exporter";
import { confirmDialog, promptDialog } from "./lib/dialog";

const showImport = ref(false);
const menu = ref<{ x: number; y: number; id: string } | null>(null);

const menuItems = computed<ContextMenuItem[]>(() => {
  void i18n.global.locale.value; // recompute when the locale changes
  const m = menu.value;
  if (!m) return [];
  const tab = state.openTabs.find((x) => x.id === m.id);
  if (!tab) return [];
  const cfg = tab.config;
  const label = tab.name || t("common.untitled");
  const file = safeName(label);
  return [
    {
      label: t("menu.exportCurl"),
      action: () => exportFile(`${file}.sh`, toCurl(cfg)),
    },
    {
      label: t("menu.exportPostman"),
      action: () =>
        exportFile(
          `${file}.postman.json`,
          JSON.stringify(toPostmanRequest(cfg, label), null, 2)
        ),
    },
    {
      label: t("menu.exportHttp"),
      action: () => exportFile(`${file}.http`, toRawHttp(cfg)),
    },
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
          label
        );
        if (name && name.trim()) renameTab(tab.id, name.trim());
      },
    },
    { divider: true },
    {
      label: t("menu.close"),
      danger: true,
      action: () => closeTab(tab.id),
    },
    {
      label: t("menu.closeOthers"),
      disabled: state.openTabs.length < 2,
      action: () => closeOtherTabs(tab.id),
    },
    {
      label: t("menu.closeAll"),
      disabled: state.openTabs.length < 2,
      action: () => closeAllTabs(),
    },
  ];
});

function openTabMenu(e: MouseEvent, id: string) {
  menu.value = { x: e.clientX, y: e.clientY, id };
}

function onTabMouseUp(e: MouseEvent, id: string) {
  if (e.button === 1) {
    e.preventDefault();
    closeTab(id);
  }
}

/** Target collection used when saving the current request. */
const targetCollectionId = ref("");
const collectionOptions = computed(() => flattenCollections());

function syncTargetCollection() {
  const bound = currentCollectionId.value;
  targetCollectionId.value = bound ?? state.collections[0]?.id ?? "";
}

watch(
  () => state.activeTabId,
  () => syncTargetCollection(),
  { immediate: true }
);
watch(
  () => currentCollectionId.value,
  () => syncTargetCollection()
);
watch(
  () => state.collections.length,
  () => syncTargetCollection()
);

async function onSave() {
  const result = saveCurrent(targetCollectionId.value || undefined);
  if (result.ok) {
    showToast(t("common.saved"));
    return;
  }
  if (result.reason === "duplicate") {
    const overwrite = await confirmDialog(
      t("dialog.duplicateRequestMsg"),
      t("dialog.duplicateRequestTitle")
    );
    if (!overwrite) return;
    const again = saveCurrent(targetCollectionId.value || undefined, true);
    if (again.ok) showToast(t("common.saved"));
  }
}

function applyTheme() {
  const el = document.documentElement;
  el.setAttribute("data-theme", state.theme);
  el.style.colorScheme = state.theme;
}

onMounted(() => {
  initStore().then(() => {
    setVueLocale(state.locale as "zh" | "en");
    applyTheme();
  });
});

watch(() => state.theme, applyTheme);
watch(
  () => state.locale,
  (l) => setVueLocale(l as "zh" | "en")
);

const { t } = useI18n();
</script>

<template>
  <div class="app" v-if="state.loaded" :data-theme="state.theme">
    <Sidebar />
    <main class="main">
      <div class="tab-strip">
        <div
          v-for="tab in state.openTabs"
          :key="tab.id"
          :class="['tab', { active: tab.id === state.activeTabId }]"
          @click="activateTab(tab.id)"
          @contextmenu.prevent="openTabMenu($event, tab.id)"
          @mousedup="onTabMouseUp($event, tab.id)"
        >
          <span class="tab-method" :class="tab.config.method.toLowerCase()">
            {{ tab.config.method }}
          </span>
          <span class="tab-name">{{ tab.name || t("common.untitled") }}</span>
          <button
            class="tab-close"
            @click.stop="closeTab(tab.id)"
            :title="t('common.close')"
          >
            ×
          </button>
        </div>
        <button class="tab-new" @click="newRequest" :title="t('common.newRequest')">+</button>
      </div>

      <template v-if="state.openTabs.length > 0">
        <div class="req-area">
          <div class="req-header">
            <input
              class="req-name"
              v-model="currentName"
              :placeholder="t('common.requestName')"
              spellcheck="false"
            />
            <div class="req-actions">
              <button @click="showImport = true" :title="t('common.import')">
                {{ t("common.import") }}
              </button>
              <AppSelect
                v-if="state.collections.length > 1"
                v-model="targetCollectionId"
                variant="collection"
                :title="t('common.saveTo')"
              >
                <option
                  v-for="x in collectionOptions"
                  :key="x.col.id"
                  :value="x.col.id"
                >
                  {{ "　".repeat(x.depth) }}{{ x.col.name }}
                </option>
              </AppSelect>
              <button @click="onSave" :title="t('common.save')">
                {{ t("common.save") }}
              </button>
            </div>
          </div>
          <UrlBar />
          <RequestTabs :config="current" />
        </div>
        <ResponsePanel />
      </template>

      <div v-else class="empty-state">
        <div class="empty-logo">⚡</div>
        <div class="empty-title">{{ t("empty.title") }}</div>
        <div class="empty-desc">{{ t("empty.desc") }}</div>
        <div class="empty-actions">
          <button class="primary" @click="newRequest">{{ t("empty.newRequest") }}</button>
          <button @click="showImport = true">{{ t("empty.import") }}</button>
        </div>
        <ul class="empty-hints">
          <li>{{ t("empty.hintContext") }}</li>
          <li>{{ t("empty.hintMiddle") }}</li>
          <li>{{ t("empty.hintExport") }}</li>
        </ul>
      </div>
    </main>
    <ModalDialog />
    <ImportModal v-if="showImport" @close="showImport = false" />
    <ContextMenu
      v-if="menu"
      :x="menu.x"
      :y="menu.y"
      :items="menuItems"
      @close="menu = null"
    />
    <div v-if="state.toast" class="toast">{{ state.toast }}</div>
  </div>
  <div class="boot" v-else>
    <div class="boot-logo">⚡</div>
    <div>{{ t("app.loading") }}</div>
  </div>
</template>
