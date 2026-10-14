<script setup lang="ts">
import type {DocItem} from "#common/nav";
import DirectoryNode from "~/component/DirectoryNode.vue";

const currentDocItem = inject("currentDocItem") as Ref<DocItem>
</script>

<template>
  <div class="flex flex-col items-center p-4 w-full">
    <div class="flex flex-wrap justify-center gap-4">
      <DirectoryNode v-for="d in currentDocItem.children" :link="d.displayLink" :title="d.title" :icon="d.icon" class="w-full sm:w-1/2 md:w-1/3 lg:w-1/4" />
    </div>
  </div>
</template>