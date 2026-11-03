<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { ContextMenuItem } from "../types";

const props = defineProps<{
  x: number;
  y: number;
  items: ContextMenuItem[];
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const menu = ref<HTMLElement | null>(null);
const pos = ref({ left: props.x, top: props.y });

function onDocClick(e: MouseEvent) {
  if (menu.value && !menu.value.contains(e.target as Node)) emit("close");
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  // Bubble phase: trigger buttons stop propagation, so they can toggle the menu.
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKey);
  requestAnimationFrame(() => {
    const el = menu.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = props.x;
    let top = props.y;
    if (left + r.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - r.width - 8);
    }
    if (top + r.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - r.height - 8);
    }
    pos.value = { left, top };
  });
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKey);
});

function run(item: ContextMenuItem) {
  if (item.disabled || item.divider) return;
  item.action?.();
  emit("close");
}
</script>

<template>
  <div
    ref="menu"
    class="ctx-menu"
    :style="{ left: pos.left + 'px', top: pos.top + 'px' }"
    @contextmenu.prevent
  >
    <template v-for="(item, i) in items" :key="i">
      <div v-if="item.divider" class="ctx-divider"></div>
      <button
        v-else
        class="ctx-item"
        :class="{ danger: item.danger }"
        :disabled="item.disabled"
        @click="run(item)"
      >
        {{ item.label }}
      </button>
    </template>
  </div>
</template>
