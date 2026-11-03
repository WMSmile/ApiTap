<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { response, error } from "../store";
import { escapeHtml, formatBytes, formatTime, tryParseJson } from "../lib/format";
import JsonViewer from "./JsonViewer.vue";

const { t } = useI18n();

type Tab = "pretty" | "raw" | "headers";
const tab = ref<Tab>("pretty");
const copied = ref(false);

const res = response;
const isJson = computed(() => (res.value ? tryParseJson(res.value.body).ok : false));

async function copyBody() {
  if (!res.value) return;
  try {
    await navigator.clipboard.writeText(res.value.body);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = res.value.body;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect";
  if (status >= 400 && status < 500) return "client";
  if (status >= 500) return "server";
  return "info";
}
</script>

<template>
  <section class="response">
    <div class="resp-head">
      <div class="resp-status" v-if="res">
        <span class="status-pill" :class="statusClass(res.status)">
          {{ res.status }} {{ res.statusText }}
        </span>
        <span class="meta">{{ formatTime(res.timeMs) }}</span>
        <span class="meta">{{ formatBytes(res.size) }}</span>
      </div>
      <div class="resp-status" v-else-if="error">
        <span class="status-pill client">{{ t("common.error") }}</span>
        <span class="meta error-text">{{ error }}</span>
      </div>
      <div class="resp-status empty" v-else>{{ t("response.empty") }}</div>

      <div class="resp-tabs" v-if="res">
        <button :class="{ active: tab === 'pretty' }" @click="tab = 'pretty'">{{ t("response.pretty") }}</button>
        <button :class="{ active: tab === 'raw' }" @click="tab = 'raw'">{{ t("response.raw") }}</button>
        <button :class="{ active: tab === 'headers' }" @click="tab = 'headers'">
          {{ t("response.respHeaders") }}
        </button>
        <button class="copy-btn" @click="copyBody">
          {{ copied ? t("common.copied") : t("common.copy") }}
        </button>
      </div>
    </div>

    <div class="resp-body" v-if="res">
      <JsonViewer v-if="tab === 'pretty' && isJson" :code="res.body" />
      <pre v-else-if="tab === 'pretty'" class="raw-text">{{ res.body }}</pre>
      <pre v-else-if="tab === 'raw'" class="raw-text">{{ res.body }}</pre>
      <table v-else class="headers-table">
        <thead>
          <tr><th>{{ t("response.header") }}</th><th>{{ t("response.value") }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(h, i) in res.headers" :key="i">
            <td class="h-key">{{ h[0] }}</td>
            <td class="h-val">{{ h[1] }}</td>
          </tr>
          <tr v-if="res.headers.length === 0">
            <td colspan="2" class="muted">{{ t("response.noHeaders") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
