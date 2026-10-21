<script setup lang="ts">
import SidebarNode from "~/components/SidebarNode.vue";
import type { DocItem } from "#common/nav";

const structureIn = inject('structure') as Ref<DocItem>;
const structure = computed(() => structureIn.value?.children as DocItem[])
// The APIs (OpenAPI), each below a line under the docs
const apis = computed(() => structureIn.value?.apis ?? [])
const route = useRoute();

// One highlight for the active entry, a tint with a rule at its left edge, that
// travels from entry to entry instead of vanishing from the old and appearing at
// the new. It is placed against the list's content, so it scrolls with the entries.
const list = ref<HTMLElement | null>(null);
const marker = ref<HTMLElement | null>(null);
let placed = false; // whether the mark shows, so the next move can slide
let layer = 0; // how deep in folders the marked entry is
let frame = 0;
let parking: ReturnType<typeof setTimeout> | undefined;
let following = 0; // until when to follow the entries every frame

// Written onto the element directly: a placement without sliding needs its
// position and the suppressed transition in the same frame. It slides only
// between entries on the same layer of folders; to another layer, and when it
// first shows, it jumps there and its rule grows from the middle. While folders
// move the entries, it tracks them frame by frame.
function measure(follow: boolean) {
  const ul = list.value, bar = marker.value;
  if (!ul || !bar) return;
  const active = ul.querySelector<HTMLElement>("a.menu-active");
  let top = 0, bottom = 0, left = 0, width = 0;
  if (active && getComputedStyle(active).visibility === "visible") {
    ({top, bottom, left, width} = active.getBoundingClientRect());
    // Only the part a closing folder has not hidden yet
    for (let el = active.parentElement; el && el !== ul; el = el.parentElement) {
      if (getComputedStyle(el).overflowY !== "hidden") continue;
      const box = el.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
    }
  }
  if (bottom - top < 1) {
    // Faded where it is: there is no entry to move to. Once faded, it goes to the
    // top without a height, or the list would still scroll down to where it was,
    // e.g. after switching to a version with a shorter navigation.
    bar.style.opacity = "0";
    bar.classList.remove("placed");
    placed = false;
    clearTimeout(parking);
    parking = setTimeout(() => {
      if (placed) return;
      bar.style.transition = "none";
      bar.style.translate = "0px 0px";
      bar.style.height = "0px";
      void bar.offsetHeight;
      bar.style.transition = "";
    }, 200);
    return;
  }
  let depth = 0;
  for (let el = active!.parentElement; el && el !== ul; el = el.parentElement) if (el.nodeName === "UL") depth++;
  const slide = placed && !follow && depth === layer;
  layer = depth;
  const box = ul.getBoundingClientRect();
  if (!slide) bar.style.transition = "none";
  bar.style.translate = `${left - box.left - ul.clientLeft + ul.scrollLeft}px ${top - box.top - ul.clientTop + ul.scrollTop}px`;
  bar.style.width = `${width}px`;
  bar.style.height = `${bottom - top}px`;
  if (!slide) {
    void bar.offsetHeight;
    bar.style.transition = "";
  }
  if (!slide && !follow) {
    // Restarts the animation
    bar.classList.remove("grow");
    void bar.offsetHeight;
    bar.classList.add("grow");
  }
  bar.style.opacity = "1";
  bar.classList.add("placed");
  placed = true;
}

// Measures once on the next frame, or on every frame while folders open and close
function schedule(follow = 0) {
  following = Math.max(following, performance.now() + follow);
  cancelAnimationFrame(frame);
  const tick = () => {
    const follow = performance.now() < following;
    measure(follow);
    if (follow) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

watch(() => route.path, () => schedule());
let classes: MutationObserver | null = null;
// The window, or the reader dragging the sidebar wider (SidebarResizer.vue)
let sized: ResizeObserver | null = null;
onMounted(() => {
  schedule();
  void document.fonts?.ready.then(() => schedule());
  sized = new ResizeObserver(() => schedule());
  if (list.value) sized.observe(list.value);
  // Folders open and close by the classes of their list items and lists, and
  // move the entries below them (links change theirs when the route does)
  classes = new MutationObserver(records => {
    if (records.some(({target}) => target !== marker.value && (target.nodeName === "LI" || target.nodeName === "UL"))) schedule(250);
  });
  if (list.value) classes.observe(list.value, {subtree: true, attributes: true, attributeFilter: ["class"]});
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  clearTimeout(parking);
  classes?.disconnect();
  sized?.disconnect();
});
</script>
<template>
  <!-- isolate: the highlight sits between the list's background and its entries.
       pb-24: the last entries scroll clear of the address browsers show at the
       bottom of the window for the link under the pointer -->
  <ul ref="list" class="menu bg-base-200 overflow-y-auto overflow-x-hidden relative isolate pb-24">
    <li ref="marker" aria-hidden="true" class="sidebar-marker"></li>
    <SidebarNode v-for="e in structure" :link="e.displayLink" :icon="e.icon" :title="e.title" :children="e.children"/>
    <template v-for="api in apis" :key="api.displayLink">
      <li aria-hidden="true" class="sidebar-separator"></li>
      <SidebarNode :link="api.displayLink" :icon="api.icon" :title="api.title" :children="api.children" :collapsed="api.collapsed"/>
    </template>
  </ul>
</template>
