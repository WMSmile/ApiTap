<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { HttpMethod } from "../types";
import { state, current, loading, runSend, activeEnv } from "../store";
import AppSelect from "./AppSelect.vue";

const { t } = useI18n();
const varToken = "{{key}}";

const methods: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const envId = computed(() => state.activeEnvId ?? "");

function onEnvChange(value: string) {
  state.activeEnvId = value === "" ? null : value;
}
</script>

<template>
  <div class="urlbar">
    <AppSelect v-model="current.method" variant="method" :title="t('urlbar.method')">
      <option v-for="m in methods" :key="m" :value="m">{{ m }}</option>
    </AppSelect>
    <input
      class="url-input"
      v-model="current.url"
      :placeholder="t('urlbar.urlPlaceholder')"
      @keyup.enter="runSend"
      spellcheck="false"
    />
    <AppSelect
      :model-value="envId"
      variant="env"
      :title="t('sidebar.environments')"
      @update:model-value="onEnvChange"
    >
      <option value="">{{ t("urlbar.noEnv") }}</option>
      <option v-for="e in state.environments" :key="e.id" :value="e.id">
        {{ e.name }}
      </option>
    </AppSelect>
    <button class="send-btn" @click="runSend" :disabled="loading">
      {{ loading ? t("urlbar.sending") : t("urlbar.send") }}
    </button>
  </div>
  <div v-if="activeEnv()" class="env-hint">
    {{ t("urlbar.envHint", { name: activeEnv()!.name, token: varToken }) }}
  </div>
</template>
