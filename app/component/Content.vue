<script setup lang="ts">
// The pane keeps its scroll position across pages; start new pages at the top
// (Markdown.vue then scrolls to a #section or search match if there is one)
const route = useRoute();
const pane = ref<HTMLElement | null>(null);
watch(() => route.path, () => pane.value?.scrollTo({top: 0}));
</script>
<template>
<div class="bg-base-200 relative">
  <!-- Focusable, so the skip link can move the keyboard here -->
  <main id="content" ref="pane" tabindex="-1" class="bg-base-100 sm:rounded-tl-2xl h-full w-full overflow-scroll outline-none">
    <slot/>
  </main>
  <!-- The navbar and sidebar cast a shadow onto the page, above everything on it -->
  <div aria-hidden="true" class="content-shadow pointer-events-none absolute inset-0 sm:rounded-tl-2xl"></div>
</div>
</template>
