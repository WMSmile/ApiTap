<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { state, setTheme, setLocale, showToast } from "../store";
import { isEncryptionOn, setEncryption } from "../lib/crypto";

const { t } = useI18n();
const emit = defineEmits<{ close: [] }>();
const encryptOn = ref(isEncryptionOn());

function pickTheme(theme: "dark" | "light") {
  setTheme(theme);
}
function pickLocale(locale: string) {
  setLocale(locale);
}
async function toggleEncryption() {
  const next = !encryptOn.value;
  await setEncryption(next);
  encryptOn.value = next;
  showToast(next ? t("settings.encryptOn") : t("settings.encryptOff"));
}
function close() {
  emit("close");
}
</script>

<template>
  <div class="modal-mask" @click.self="close">
    <div class="modal settings-modal">
      <div class="modal-title">{{ t("settings.title") }}</div>

      <div class="settings-row">
        <span class="settings-label">{{ t("settings.theme") }}</span>
        <div class="segmented">
          <button
            :class="{ active: state.theme === 'dark' }"
            @click="pickTheme('dark')"
          >
            {{ t("settings.themeDark") }}
          </button>
          <button
            :class="{ active: state.theme === 'light' }"
            @click="pickTheme('light')"
          >
            {{ t("settings.themeLight") }}
          </button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-label">{{ t("settings.language") }}</span>
        <div class="segmented">
          <button
            :class="{ active: state.locale === 'zh' }"
            @click="pickLocale('zh')"
          >
            {{ t("settings.langZh") }}
          </button>
          <button
            :class="{ active: state.locale === 'en' }"
            @click="pickLocale('en')"
          >
            {{ t("settings.langEn") }}
          </button>
        </div>
      </div>

      <div class="settings-row">
        <span class="settings-label">{{ t("settings.encrypt") }}</span>
        <button
          class="switch"
          :class="{ on: encryptOn }"
          @click="toggleEncryption"
          :title="t('settings.encryptHint')"
        >
          <span class="knob"></span>
        </button>
      </div>
      <p class="settings-hint">{{ t("settings.encryptHint") }}</p>

      <div class="modal-actions">
        <button class="primary" @click="close">{{ t("common.done") }}</button>
      </div>
    </div>
  </div>
</template>
