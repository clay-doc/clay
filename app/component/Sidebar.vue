<script setup lang="ts">
import SidebarNode from "~/component/SidebarNode.vue";
import type { DocItem } from "#common/nav";

const structureIn = inject('structure') as Ref<DocItem>;
const structure = computed(() => structureIn.value?.children as DocItem[])
</script>

<template>
  <ul class="menu bg-base-200 overflow-auto">
    <SidebarNode v-for="e in structure" :link="e.displayLink" :icon="e.icon" :title="e.title" :children="e.children"/>
  </ul>
</template>
