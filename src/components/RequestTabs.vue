<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { RequestConfig } from "../types";
import KeyValueEditor from "./KeyValueEditor.vue";
import BodyEditor from "./BodyEditor.vue";
import AuthEditor from "./AuthEditor.vue";

const props = defineProps<{ config: RequestConfig }>();
const { t } = useI18n();

type Tab = "params" | "headers" | "body" | "auth";
const tab = ref<Tab>("params");

function count(list: { enabled: boolean; key: string }[]): number {
  return list.filter((i) => i.enabled && i.key).length;
}
</script>

<template>
  <div class="req-tabs">
    <div class="tab-bar">
      <button :class="{ active: tab === 'params' }" @click="tab = 'params'">
        {{ t("tabs.params") }} <span class="badge">{{ count(config.params) }}</span>
      </button>
      <button :class="{ active: tab === 'headers' }" @click="tab = 'headers'">
        {{ t("tabs.headers") }} <span class="badge">{{ count(config.headers) }}</span>
      </button>
      <button :class="{ active: tab === 'body' }" @click="tab = 'body'">
        {{ t("tabs.body") }}
      </button>
      <button :class="{ active: tab === 'auth' }" @click="tab = 'auth'">
        {{ t("tabs.auth") }}
      </button>
    </div>
    <div class="tab-body">
      <KeyValueEditor
        v-show="tab === 'params'"
        v-model="config.params"
        :key-placeholder="t('tabs.paramKey')"
        :value-placeholder="t('tabs.paramValue')"
      />
      <KeyValueEditor
        v-show="tab === 'headers'"
        v-model="config.headers"
        :key-placeholder="t('tabs.headerKey')"
        :value-placeholder="t('tabs.headerValue')"
      />
      <BodyEditor v-show="tab === 'body'" :config="config" />
      <AuthEditor v-show="tab === 'auth'" :config="config" />
    </div>
  </div>
</template>
