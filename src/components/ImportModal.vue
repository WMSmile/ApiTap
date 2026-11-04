<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  importCollection,
  importToCurrent,
  mergeIntoCollection,
  flattenCollections,
} from "../store";
import { parseImport, type ImportResult } from "../lib/import";

const emit = defineEmits<{ (e: "close"): void }>();
const { t } = useI18n();

const text = ref("");
const error = ref("");
const collectionName = ref("");
/** "" = create a new collection, otherwise the target collection id. */
const targetCollectionId = ref("");

const detected = computed<ImportResult | null>(() => {
  const raw = text.value.trim();
  if (!raw) return null;
  try {
    return parseImport(raw);
  } catch {
    return null;
  }
});

const targets = computed(() => flattenCollections());

/**
 * The example contains JSON braces. It is passed as an interpolation value
 * instead of being part of the message template, because vue-i18n parses
 * `{...}` inside messages as placeholders and would throw at runtime.
 */
const placeholderText = computed(() =>
  t("import.placeholder", { body: '{"name":"test"}' })
);

const formatLabel = computed(() => {
  const d = detected.value;
  if (!d) return "";
  return t(`import.format.${d.format}`);
});

const requestCount = computed(() => {
  const d = detected.value;
  return d && d.kind === "collection" ? d.requests.length : 0;
});

watch(detected, (d) => {
  if (d && d.kind === "collection" && !collectionName.value.trim()) {
    collectionName.value = d.name;
  }
});

function onImport() {
  const d = detected.value;
  if (!d) {
    error.value = t("import.emptyError");
    return;
  }
  try {
    if (d.kind === "collection") {
      if (d.requests.length === 0) {
        error.value = t("import.noRequests");
        return;
      }
      if (targetCollectionId.value) {
        // Merge into an existing collection.
        mergeIntoCollection(targetCollectionId.value, d.requests);
      } else {
        importCollection(
          collectionName.value.trim() || d.name,
          d.requests,
          null
        );
      }
    } else {
      if (!d.config.url) {
        error.value = t("import.urlError");
        return;
      }
      importToCurrent(d.config);
    }
    emit("close");
  } catch (e) {
    error.value = (e as Error)?.message || t("import.parseError");
  }
}
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal import-modal">
      <div class="modal-title">{{ t("import.title") }}</div>
      <div class="modal-msg">{{ t("import.hint") }}</div>
      <textarea
        v-model="text"
        class="import-text"
        :placeholder="placeholderText"
        spellcheck="false"
      ></textarea>

      <div v-if="detected" class="import-detected">
        <span class="import-badge">{{ formatLabel }}</span>
        <span v-if="requestCount > 0" class="import-count">
          {{ t("import.requestCount", { count: requestCount }) }}
        </span>
      </div>

      <div
        v-if="detected && detected.kind === 'collection'"
        class="import-collection"
      >
        <label>{{ t("import.collectionName") }}</label>
        <input
          v-model="collectionName"
          class="import-name"
          :placeholder="t('import.collectionName')"
          :disabled="!!targetCollectionId"
          spellcheck="false"
        />
      </div>

      <div
        v-if="detected && detected.kind === 'collection'"
        class="import-collection"
      >
        <label>{{ t("import.target") }}</label>
        <select v-model="targetCollectionId" class="import-name">
          <option value="">{{ t("import.newCollection") }}</option>
          <option
            v-for="x in targets"
            :key="x.col.id"
            :value="x.col.id"
          >
            {{ "　".repeat(x.depth) }}{{ x.col.name }}
          </option>
        </select>
      </div>

      <div v-if="error" class="import-error">{{ error }}</div>
      <div class="modal-actions">
        <button @click="emit('close')">{{ t("common.cancel") }}</button>
        <button class="primary" @click="onImport">
          {{
            detected && detected.kind === "collection"
              ? t("import.importToCollection")
              : t("import.importToCurrent")
          }}
        </button>
      </div>
    </div>
  </div>
</template>
