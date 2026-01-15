<script setup lang="ts">
import type {DocItem} from "~/assets/structure-loader";
import DirectoryNode from "~/component/DirectoryNode.vue";

const currentDocItem = inject("currentDocItem") as Ref<DocItem>
const structureReady = inject('structureReady') as Ref<boolean>;
</script>

<template>
  <div class="flex flex-col items-center p-4 w-full">
    <div v-if="structureReady" class="flex flex-wrap justify-center gap-4">
      <DirectoryNode v-for="d in currentDocItem.children" :link="d.displayLink" :title="d.title" :icon="d.icon" class="w-full sm:w-1/2 md:w-1/3 lg:w-1/4" />
    </div>
  </div>
</template>