<script setup lang="ts">
import ContentLoader from "~/component/ContentLoader.vue";

const structureReady = inject('structureReady') as Ref<boolean>;
</script>
<template>
<div class="bg-base-200">
  <div class="bg-base-100 sm:rounded-tl-2xl h-full w-full overflow-scroll">
    <ContentLoader v-if="!structureReady"/>
    <slot v-else/>
  </div>
</div>
</template>