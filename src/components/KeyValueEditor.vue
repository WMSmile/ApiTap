<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { KeyValue } from "../types";
import { newKeyValue } from "../lib/format";

const props = defineProps<{
  modelValue: KeyValue[];
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}>();
const { t } = useI18n();

function add() {
  props.modelValue.push(newKeyValue());
}
function remove(id: string) {
  const i = props.modelValue.findIndex((r) => r.id === id);
  if (i >= 0) props.modelValue.splice(i, 1);
}
function toggle(row: KeyValue) {
  if (props.disabled) return;
  row.enabled = !row.enabled;
}
</script>

<template>
  <div class="kv">
    <div v-if="modelValue.length === 0" class="kv-empty">
      {{ t("kv.empty") }}
    </div>
    <div
      v-for="row in modelValue"
      :key="row.id"
      class="kv-row"
      :class="{ off: !row.enabled }"
    >
      <input
        type="checkbox"
        :checked="row.enabled"
        @change="toggle(row)"
        :disabled="disabled"
        :title="t('common.enabled')"
      />
      <input
        class="kv-key"
        v-model="row.key"
        :placeholder="keyPlaceholder || t('tabs.headerKey')"
        :disabled="disabled"
        spellcheck="false"
      />
      <input
        class="kv-val"
        v-model="row.value"
        :placeholder="valuePlaceholder || t('tabs.headerValue')"
        :disabled="disabled"
        spellcheck="false"
      />
      <button class="kv-del" @click="remove(row.id)" :disabled="disabled" :title="t('common.delete')">
        ×
      </button>
    </div>
    <button class="kv-add" @click="add" :disabled="disabled">+ {{ t("common.add") }}</button>
  </div>
</template>
