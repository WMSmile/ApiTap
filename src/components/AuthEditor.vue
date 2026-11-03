<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { AuthType, RequestConfig } from "../types";

const props = defineProps<{ config: RequestConfig }>();
const { t } = useI18n();

const types: AuthType[] = ["none", "bearer", "basic", "apikey"];
const authKey: Record<AuthType, string> = {
  none: "auth.none",
  bearer: "auth.bearer",
  basic: "auth.basic",
  apikey: "auth.apiKey",
};

function setType(type: AuthType) {
  props.config.auth.type = type;
}
</script>

<template>
  <div class="auth-editor">
    <div class="auth-types">
      <button
        v-for="type in types"
        :key="type"
        :class="{ active: config.auth.type === type }"
        @click="setType(type)"
      >
        {{ t(authKey[type]) }}
      </button>
    </div>

    <div class="auth-fields" v-if="config.auth.type === 'bearer'">
      <label>{{ t("auth.token") }}</label>
      <input v-model="config.auth.bearer" :placeholder="t('auth.tokenPlaceholder')" spellcheck="false" />
    </div>

    <div class="auth-fields" v-else-if="config.auth.type === 'basic'">
      <label>{{ t("auth.username") }}</label>
      <input v-model="config.auth.user" :placeholder="t('auth.usernamePlaceholder')" spellcheck="false" />
      <label>{{ t("auth.password") }}</label>
      <input
        v-model="config.auth.pass"
        type="password"
        :placeholder="t('auth.passwordPlaceholder')"
        spellcheck="false"
      />
    </div>

    <div class="auth-fields" v-else-if="config.auth.type === 'apikey'">
      <label>{{ t("auth.key") }}</label>
      <input v-model="config.auth.key" :placeholder="t('auth.keyPlaceholder')" spellcheck="false" />
      <label>{{ t("auth.value") }}</label>
      <input v-model="config.auth.value" :placeholder="t('auth.valuePlaceholder')" spellcheck="false" />
      <label>{{ t("auth.addTo") }}</label>
      <select v-model="config.auth.addTo">
        <option value="header">{{ t("auth.addToHeader") }}</option>
        <option value="query">{{ t("auth.addToQuery") }}</option>
      </select>
    </div>

    <div class="auth-fields" v-else>
      <p class="muted">{{ t("auth.noneHint") }}</p>
    </div>
  </div>
</template>
