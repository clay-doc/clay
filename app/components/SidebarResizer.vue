<script setup lang="ts">
// The edge between the sidebar and the page: dragged, or moved with the arrow
// keys, it makes the sidebar wider or narrower; a double click returns it to
// its width. The width is kept in the browser and set before the first paint
// (nuxt.config.ts), as the theme is.
const STORAGE_KEY = "clay-sidebar";
const DEFAULT = 320;
const MIN = 224;
const t = useMessages();
const width = ref(DEFAULT);
const max = () => Math.max(MIN, Math.min(640, Math.round(window.innerWidth / 2)));

function apply(value: number, save: boolean) {
  width.value = Math.min(max(), Math.max(MIN, Math.round(value)));
  document.documentElement.style.setProperty("--clay-sidebar", `${width.value}px`);
  if (!save) return;
  try {
    localStorage.setItem(STORAGE_KEY, String(width.value));
  } catch {
    // no storage: the width lasts for this page
  }
}

function reset() {
  width.value = DEFAULT;
  document.documentElement.style.removeProperty("--clay-sidebar");
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing kept
  }
}

onMounted(() => {
  const set = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--clay-sidebar"));
  if (set) width.value = set;
});

function drag(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  document.documentElement.classList.add("clay-resizing");
  const move = (e: PointerEvent) => apply(e.clientX, false);
  const stop = () => {
    handle.removeEventListener("pointermove", move);
    document.documentElement.classList.remove("clay-resizing");
    apply(width.value, true);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", stop, {once: true});
  handle.addEventListener("pointercancel", stop, {once: true});
}

function key(event: KeyboardEvent) {
  const step = event.shiftKey ? 64 : 16;
  const next = {ArrowLeft: width.value - step, ArrowRight: width.value + step, Home: MIN, End: max()}[event.key];
  if (next === undefined) return;
  event.preventDefault();
  apply(next, true);
}
</script>

<template>
  <div role="separator" aria-orientation="vertical" tabindex="0" class="sidebar-resizer"
       :aria-label="t.resizeNav" :aria-valuenow="width" :aria-valuemin="MIN" :aria-valuemax="640"
       @pointerdown.prevent="drag" @keydown="key" @dblclick="reset"></div>
</template>
