<script setup lang="ts">
import {editLink, type Configuration} from "#common/configuration";
import {adjacentPages, type DocItem} from "#common/nav";

const props = defineProps<{ url: string }>();
const config = inject('config') as Ref<Configuration | undefined>;
const structure = inject('structure') as Ref<DocItem | undefined>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;

// Only for the page shown, not a directory the route stopped at
const doc = computed(() => currentDocItem.value?.displayLink === props.url && !currentDocItem.value.children ? currentDocItem.value : undefined);
const edit = computed(() => doc.value ? editLink(config.value, doc.value.link) : undefined);
const updated = computed(() => {
  const date = doc.value?.updated ? new Date(doc.value.updated) : undefined;
  if (!date || isNaN(date.getTime())) return undefined;
  // A fixed locale and time zone: the server-rendered date must match the browser's
  return {iso: date.toISOString(), text: date.toLocaleDateString(config.value?.lang || "en", {year: "numeric", month: "long", day: "numeric", timeZone: "UTC"})};
});
const adjacent = computed(() => structure.value ? adjacentPages(structure.value, props.url) : {});
</script>

<template>
  <footer class="not-prose mt-12 flex flex-col gap-6 text-sm">
    <div v-if="edit || updated" class="flex flex-wrap justify-between gap-2 opacity-70">
      <a v-if="edit" :href="edit" target="_blank" rel="noopener noreferrer" class="link link-hover">
        <i class="fa-solid fa-pen-to-square mr-1"></i>Edit this page
      </a>
      <span v-if="updated">Last updated: <time :datetime="updated.iso">{{updated.text}}</time></span>
    </div>
    <nav v-if="adjacent.previous || adjacent.next" aria-label="Previous and next page" class="grid grid-cols-2 gap-4">
      <NuxtLink v-if="adjacent.previous" :to="adjacent.previous.displayLink" rel="prev"
                class="card card-border hover:border-primary p-4 col-start-1">
        <span class="opacity-60 text-xs">Previous</span>
        <span class="font-semibold"><i class="fa-solid fa-arrow-left mr-1"></i>{{adjacent.previous.title}}</span>
      </NuxtLink>
      <NuxtLink v-if="adjacent.next" :to="adjacent.next.displayLink" rel="next"
                class="card card-border hover:border-primary p-4 col-start-2 text-right">
        <span class="opacity-60 text-xs">Next</span>
        <span class="font-semibold">{{adjacent.next.title}}<i class="fa-solid fa-arrow-right ml-1"></i></span>
      </NuxtLink>
    </nav>
  </footer>
</template>
