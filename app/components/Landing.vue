<script setup lang="ts">
import type {Configuration} from "#common/configuration";
import type {DocItem} from "#common/nav";
import Markdown from "~/components/Markdown.vue";
import PageList from "~/components/PageList.vue";

// Start page of the site, and of each other version and language under its
// prefix: docs/index.md, or the site title with a list of the top-level pages
const props = defineProps<{ route: string }>();
const config = inject('config') as Ref<Configuration>;
const structure = inject('structure') as Ref<DocItem>;

if (!structure.value.hasIndex) useClaySeo(() => ({title: config.value.title, route: props.route}));
</script>

<template>
  <Markdown v-if="structure.hasIndex" :url="route" start/>
  <!-- Laid out like a Markdown page: the site title and the list of pages -->
  <div v-else class="flex gap-10 p-6 sm:pl-9">
    <article class="prose prose-sm sm:prose max-w-none! min-w-0 flex-1">
      <h1>{{config.title}}</h1>
      <PageList/>
    </article>
  </div>
</template>
