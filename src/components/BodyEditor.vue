<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { BodyType, RequestConfig } from "../types";
import { newKeyValue } from "../lib/format";
import KeyValueEditor from "./KeyValueEditor.vue";

const props = defineProps<{ config: RequestConfig }>();
const { t } = useI18n();

const bodyKey: Record<BodyType, string> = {
  none: "body.none",
  json: "body.json",
  text: "body.text",
  form: "body.form",
};

function setType(t: BodyType) {
  props.config.body.type = t;
  if (t === "form" && props.config.body.form.length === 0) {
    props.config.body.form.push(newKeyValue());
  }
}
</script>

<template>
  <div class="body-editor">
    <div class="body-tabs">
      <button
        v-for="bt in (['none', 'json', 'text', 'form'] as BodyType[])"
        :key="bt"
        :class="{ active: config.body.type === bt }"
        @click="setType(bt)"
      >
        {{ t(bodyKey[bt]) }}
      </button>
    </div>
    <div class="body-content">
      <KeyValueEditor
        v-if="config.body.type === 'form'"
        v-model="config.body.form"
        :key-placeholder="t('tabs.formKey')"
        :value-placeholder="t('tabs.formValue')"
      />
      <textarea
        v-else-if="config.body.type !== 'none'"
        v-model="config.body.raw"
        class="body-text"
        :placeholder="config.body.type === 'json' ? '{\\n  \\n}' : t('body.textPlaceholder')"
        spellcheck="false"
      ></textarea>
      <div v-else class="body-none">
        {{ t("body.noneHint") }}
      </div>
    </div>
  </div>
</template>
