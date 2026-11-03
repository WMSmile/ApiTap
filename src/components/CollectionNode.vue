<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Collection, RequestItem } from "../types";
import {
  state,
  currentRequestId,
  findCollection,
  findCollectionParent,
  moveCollection,
  moveRequest,
  selectRequest,
} from "../store";
import { isDragClick, startDrag } from "../lib/dragdrop";
import type { DragSource, DropTarget } from "../lib/dragdrop";
import Icon from "./Icon.vue";

const props = defineProps<{ collection: Collection; depth: number }>();
const emit = defineEmits<{
  (e: "menu", payload: {
    x: number;
    y: number;
    kind: "collection" | "request";
    collectionId: string;
    requestId?: string;
  }): void;
  (e: "action", payload: {
    action:
      | "new-request"
      | "new-sub"
      | "rename"
      | "duplicate"
      | "delete";
    collectionId: string;
  }): void;
}>();

const { t } = useI18n();
const collapsed = ref(false);

function openColMenu(e: MouseEvent) {
  emit("menu", {
    x: e.clientX,
    y: e.clientY,
    kind: "collection",
    collectionId: props.collection.id,
  });
}

function openReqMenu(e: MouseEvent, requestId: string) {
  const el = e.currentTarget as HTMLElement | null;
  let x = e.clientX;
  let y = e.clientY;
  if (el && el.classList.contains("req-more")) {
    const r = el.getBoundingClientRect();
    x = r.left - 100;
    y = r.bottom + 4;
  }
  emit("menu", {
    x,
    y,
    kind: "request",
    collectionId: props.collection.id,
    requestId,
  });
}

function onMouseDownCol(e: MouseEvent) {
  startDrag(
    e,
    { kind: "collection", id: props.collection.id, label: props.collection.name },
    handleDrop
  );
}

function onMouseDownReq(e: MouseEvent, req: RequestItem) {
  startDrag(e, { kind: "request", id: req.id, label: req.name }, handleDrop);
}

/**
 * Collection -> collection: nest as a child, or reorder next to it when
 * both live on the same level.
 * Request -> collection: append.
 * Request -> request: insert before / after it.
 * Collection -> root: move back to the top level.
 */
function handleDrop(src: DragSource, target: DropTarget) {
  if (target.kind === "root") {
    if (src.kind === "collection")
      moveCollection(src.id, null, state.collections.length);
    return;
  }

  if (target.kind === "collection") {
    const tgt = findCollection(target.collectionId);
    if (!tgt) return;
    if (src.kind === "collection") {
      const srcParent = findCollectionParent(src.id);
      const tgtParent = findCollectionParent(tgt.id);
      if (srcParent === tgtParent) {
        const siblings = srcParent ? srcParent.children : state.collections;
        const idx = siblings.findIndex((c) => c.id === tgt.id);
        if (idx < 0) return;
        const at = target.after ? idx + 1 : idx;
        moveCollection(src.id, srcParent ? srcParent.id : null, at);
      } else {
        const at = target.after ? tgt.children.length : 0;
        moveCollection(src.id, tgt.id, at);
      }
      return;
    }
    moveRequest(src.id, tgt.id, tgt.requests.length);
    return;
  }

  if (src.kind === "request") {
    const col = findCollection(target.collectionId);
    if (!col) return;
    const index = target.index ?? col.requests.length;
    moveRequest(src.id, col.id, index);
  }
}

function onSelectRequest(collectionId: string, requestId: string) {
  if (isDragClick()) return;
  selectRequest(collectionId, requestId);
}
</script>

<template>
  <div class="col">
    <div
      class="col-head"
      data-drop="collection"
      :data-drop-collection="collection.id"
      @contextmenu.prevent="openColMenu"
    >
      <button
        class="col-toggle"
        @mousedown.stop
        @click="collapsed = !collapsed"
        :title="collapsed ? t('sidebar.expand') : t('sidebar.collapse')"
      >
        <Icon :name="collapsed ? 'chevronRight' : 'chevronDown'" :size="13" />
      </button>
      <span
        class="col-name"
        :style="{ paddingLeft: depth * 10 + 'px' }"
        @mousedown="onMouseDownCol"
        >{{ collection.name }}</span
      >
      <span class="col-count">{{ collection.requests.length }}</span>
      <span class="col-ops">
        <button
          @mousedown.stop
          @click.stop="emit('action', { action: 'new-request', collectionId: collection.id })"
          :title="t('sidebar.newRequestIn')"
        >
          <Icon name="plus" :size="13" />
        </button>
        <button
          @mousedown.stop
          @click.stop="emit('action', { action: 'new-sub', collectionId: collection.id })"
          :title="t('sidebar.newSubCollection')"
        >
          <Icon name="folderPlus" :size="13" />
        </button>
        <button
          @mousedown.stop
          @click.stop="emit('action', { action: 'rename', collectionId: collection.id })"
          :title="t('menu.rename')"
        >
          <Icon name="pencil" :size="13" />
        </button>
        <button
          class="danger"
          @mousedown.stop
          @click.stop="emit('action', { action: 'delete', collectionId: collection.id })"
          :title="t('common.delete')"
        >
          <Icon name="trash" :size="13" />
        </button>
      </span>
    </div>

    <template v-if="!collapsed">
      <div v-if="collection.requests.length === 0" class="col-empty">
        {{ t("sidebar.noRequests") }}
      </div>
      <div
        v-for="(req, i) in collection.requests"
        :key="req.id"
        class="req-item"
        :class="{ active: currentRequestId === req.id }"
        data-drop="request"
        :data-drop-collection="collection.id"
        :data-drop-request="req.id"
        :data-drop-index="i"
        @mousedown="onMouseDownReq($event, req)"
        @click="onSelectRequest(collection.id, req.id)"
        @contextmenu.prevent="openReqMenu($event, req.id)"
      >
        <span class="method-pill" :class="req.config.method.toLowerCase()">
          {{ req.config.method }}
        </span>
        <span class="req-name">{{ req.name }}</span>
        <button
          class="req-more"
          @mousedown.stop
          :title="t('menu.more')"
          @click.stop="openReqMenu($event, req.id)"
        >
          <Icon name="more" :size="14" />
        </button>
      </div>

      <CollectionNode
        v-for="child in collection.children"
        :key="child.id"
        :collection="child"
        :depth="depth + 1"
        @menu="(p) => emit('menu', p)"
        @action="(p) => emit('action', p)"
      />
    </template>
  </div>
</template>
