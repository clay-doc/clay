<script setup lang="ts">
import SidebarNode from "~/component/SidebarNode.vue";
import type { DocItem } from "~/assets/structure-loader";
import SidebarLoader from "~/component/SidebarLoader.vue";

const structureIn = inject('structure') as Ref<DocItem>;
const structureReady = inject('structureReady') as Ref<boolean>;
const structure = computed(() => structureIn.value?.children as DocItem[])
</script>

<template>
  <SidebarLoader class="menu bg-base-200 overflow-auto" v-if="!structureReady" />
  <ul v-else class="menu bg-base-200 overflow-auto">
    <SidebarNode v-for="e in structure" :link="e.displayLink" :icon="e.icon" :title="e.title" :children="e.children"/>
  </ul>
</template>
