<script setup lang="ts">
import Markdown from "~/component/Markdown.vue";
import Directory from "~/component/Directory.vue";
import Error from "~/component/Error.vue";
import Landing from "~/component/Landing.vue";
import {type DocItem, type LinkPart} from "#common/nav";
import {normalizePath} from "#common/route-path";

const route = useRoute();
const resolvePath = inject('resolvePath') as (path: string) => { prefix: string, structure: DocItem, linkParts: LinkPart[], currentItem: DocItem | undefined };

// This page's own route, not the router's: while the next page loads, this one
// stays on screen and must keep showing its own content
const own = computed(() => resolvePath(route.path));
const linkParts = computed(() => own.value.linkParts);
const currentDocItem = computed(() => own.value.currentItem);
provide('structure', computed(() => own.value.structure));
provide('linkParts', linkParts);
provide('currentDocItem', currentDocItem);
const t = useMessages();

const path = computed(() => normalizePath(route.path));
// "/1.x" or "/de" is the start page of another version or language
const isEditionRoot = computed(() => !!own.value.prefix && path.value === own.value.prefix);
// The route must lead exactly to a page or directory of the docs
const item = computed(() => currentDocItem.value?.displayLink === path.value ? currentDocItem.value : undefined);
const isDirectory = computed(() => linkParts.value.at(-1)?.isDirectory);

// Unknown routes show a 404 page; static hosts serve the generated 404.html
if (import.meta.server && !item.value && !isEditionRoot.value) {
  setResponseStatus(useRequestEvent()!, 404, "Page Not Found");
}
useHead(() => item.value || isEditionRoot.value ? {} : {title: t.value.notFound});
</script>

<template>
  <Landing v-if="isEditionRoot" :route="path"/>
  <Error v-else-if="!item" :code="404" :message="t.notFound"/>
  <Directory v-else-if="isDirectory"/>
  <Markdown v-else :url="path" class="min-w-full"/>
</template>
