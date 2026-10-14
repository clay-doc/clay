<script setup lang="ts">
import ContentLoader from "~/component/ContentLoader.vue";

const structureReady = inject('structureReady') as Ref<boolean>;

// The pane keeps its scroll position across pages; start new pages at the top
// (Markdown.vue then scrolls to a #section or search match if there is one)
const route = useRoute();
const pane = ref<HTMLElement | null>(null);
watch(() => route.path, () => pane.value?.scrollTo({top: 0}));
</script>
<template>
<div class="bg-base-200">
  <div ref="pane" class="bg-base-100 sm:rounded-tl-2xl h-full w-full overflow-scroll">
    <ContentLoader v-if="!structureReady"/>
    <slot v-else/>
  </div>
</div>
</template>
