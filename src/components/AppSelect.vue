<script setup lang="ts">
import Icon from "./Icon.vue";

const props = defineProps<{
  modelValue: string;
  title?: string;
  /** Optional CSS modifier for sizing. */
  variant?: "default" | "method" | "env" | "collection";
}>();

const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();

function onChange(e: Event) {
  emit("update:modelValue", (e.target as HTMLSelectElement).value);
}
</script>

<template>
  <div class="select-wrap" :class="variant ? `is-${variant}` : ''" :title="title">
    <select
      class="select-field"
      :value="props.modelValue"
      @change="onChange"
      @mousedown.stop
    >
      <slot />
    </select>
    <Icon name="chevronDown" :size="13" class="select-caret" />
  </div>
</template>
