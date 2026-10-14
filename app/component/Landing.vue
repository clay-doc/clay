<script setup lang="ts">
import type {Configuration} from "#common/configuration";
import type {DocItem} from "#common/nav";
import DirectoryGrid from "~/component/DirectoryGrid.vue";
import Markdown from "~/component/Markdown.vue";

// Start page of the site, and of each other version and language under its
// prefix: docs/index.md, or the site title with cards of the top-level pages
const props = defineProps<{ route: string }>();
const config = inject('config') as Ref<Configuration>;
const structure = inject('structure') as Ref<DocItem>;

if (!structure.value.hasIndex) useClaySeo(() => ({title: config.value.title, route: props.route}));
</script>

<template>
  <Markdown v-if="structure.hasIndex" :url="route" start/>
  <div v-else class="hero h-[80vh]">
    <div class="hero-content text-center">
      <div>
        <h1 class="text-5xl font-bold pb-12">{{config.title}}</h1>
        <DirectoryGrid />
      </div>
    </div>
  </div>
</template>
