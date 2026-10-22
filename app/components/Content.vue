<script setup lang="ts">
// The pane keeps its scroll position across pages; start new pages at the top.
// A page opened at a #section or search match is scrolled by Markdown.vue
// instead: both happen as the page appears, and a scroll to the top here
// could come last and undo it.
const route = useRoute();
const pane = ref<HTMLElement | null>(null);
watch(() => route.path, () => {
  if (route.hash || route.query.highlight) return;
  pane.value?.scrollTo({top: 0});
});
</script>
<template>
<div class="bg-base-200 relative">
  <!-- Focusable, so the skip link can move the keyboard here -->
  <main id="content" ref="pane" tabindex="-1" class="bg-base-100 sm:rounded-tl-2xl h-full w-full overflow-auto outline-none">
    <slot/>
  </main>
  <!-- The navbar and sidebar cast a shadow onto the page, above everything on it -->
  <div aria-hidden="true" class="content-shadow pointer-events-none absolute inset-0 sm:rounded-tl-2xl"></div>
</div>
</template>
