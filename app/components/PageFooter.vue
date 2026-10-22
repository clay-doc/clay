<script setup lang="ts">
import {editLink, type Configuration} from "#common/configuration";
import {adjacentPages, type DocItem} from "#common/nav";
import type {Edition} from "#common/editions";
import PageFeedback from "~/components/PageFeedback.vue";

const props = defineProps<{ url: string }>();
const config = inject('config') as Ref<Configuration | undefined>;
const structure = inject('structure') as Ref<DocItem | undefined>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;
const edition = inject('edition') as Ref<Edition>;
const t = useMessages();

// Only for the page shown (a page, or a folder's index.md), not a folder the route stopped at
const doc = computed(() => currentDocItem.value?.displayLink === props.url && (!currentDocItem.value.children || currentDocItem.value.hasIndex)
    ? currentDocItem.value : undefined);
// The file the page is read from, which is the translation in other languages
const edit = computed(() => doc.value?.source ? editLink(config.value, doc.value.source, edition.value.version.dir) : undefined);
const updated = computed(() => {
  const date = doc.value?.updated ? new Date(doc.value.updated) : undefined;
  if (!date || isNaN(date.getTime())) return undefined;
  // A fixed locale and time zone: the server-rendered date must match the browser's
  return {iso: date.toISOString(), text: date.toLocaleDateString(edition.value.language.code, {year: "numeric", month: "long", day: "numeric", timeZone: "UTC"})};
});
const adjacent = computed(() => structure.value ? adjacentPages(structure.value, props.url) : {});
</script>

<template>
  <footer class="not-prose mt-12 flex flex-col gap-6 text-sm">
    <PageFeedback v-if="doc" :url="url"/>
    <div v-if="edit || updated" class="flex flex-wrap justify-between gap-2 opacity-80">
      <a v-if="edit" :href="edit" target="_blank" rel="noopener noreferrer" class="link link-hover">
        <i class="fa-solid fa-pen-to-square mr-1"></i>{{t.editPage}}
      </a>
      <span v-if="updated">{{t.lastUpdated}} <time :datetime="updated.iso">{{updated.text}}</time></span>
    </div>
    <nav v-if="adjacent.previous || adjacent.next" :aria-label="t.previousNext" class="grid grid-cols-2 gap-4">
      <NuxtLink v-if="adjacent.previous" :to="adjacent.previous.displayLink" rel="prev"
                class="card card-border hover:border-primary p-4 col-start-1">
        <span class="opacity-80 text-xs">{{t.previous}}</span>
        <!-- Long titles, like those of some API operations, take three lines at most -->
        <span class="flex items-start gap-1 font-semibold" :title="adjacent.previous.title"><i class="fa-solid fa-arrow-left mt-[0.35em]"></i><span class="line-clamp-3">{{adjacent.previous.title}}</span></span>
      </NuxtLink>
      <NuxtLink v-if="adjacent.next" :to="adjacent.next.displayLink" rel="next"
                class="card card-border hover:border-primary p-4 col-start-2 text-right">
        <span class="opacity-80 text-xs">{{t.next}}</span>
        <span class="flex items-start justify-end gap-1 font-semibold" :title="adjacent.next.title"><span class="line-clamp-3">{{adjacent.next.title}}</span><i class="fa-solid fa-arrow-right mt-[0.35em]"></i></span>
      </NuxtLink>
    </nav>
  </footer>
</template>
