<script setup lang="ts">
import { computed } from "vue";
import { escapeHtml, highlightJson, tryParseJson } from "../lib/format";

const props = defineProps<{ code: string }>();

const parsed = computed(() => tryParseJson(props.code));
const html = computed(() => {
  if (parsed.value.ok) {
    return highlightJson(JSON.stringify(parsed.value.value, null, 2));
  }
  return escapeHtml(props.code);
});
</script>

<template>
  <pre class="json" v-html="html"></pre>
</template>
