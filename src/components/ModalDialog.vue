<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { dialog, closeDialog } from "../lib/dialog";
import AppSelect from "./AppSelect.vue";

const { t } = useI18n();

function onCancel() {
  closeDialog(dialog.type === "confirm" ? false : null);
}
function onOk() {
  closeDialog(dialog.type === "confirm" ? true : dialog.value);
}
</script>

<template>
  <div class="modal-mask" v-if="dialog.open" @click.self="onCancel">
    <div class="modal">
      <div class="modal-title">{{ dialog.title }}</div>
      <div class="modal-msg">{{ dialog.message }}</div>
      <input
        v-if="dialog.type === 'prompt'"
        v-model="dialog.value"
        class="modal-input"
        :placeholder="dialog.placeholder"
        @keyup.enter="onOk"
        spellcheck="false"
      />
      <div v-if="dialog.type === 'select'" class="modal-select">
        <AppSelect v-model="dialog.value" variant="collection">
          <option v-for="o in dialog.options" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </AppSelect>
      </div>
      <div class="modal-actions">
        <button @click="onCancel">{{ t("common.cancel") }}</button>
        <button class="primary" @click="onOk">{{ t("common.confirm") }}</button>
      </div>
    </div>
  </div>
</template>
