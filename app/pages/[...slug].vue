<script setup lang="ts">
import Markdown from "~/component/Markdown.vue";
import Directory from "~/component/Directory.vue";
import Error from "~/component/Error.vue";
import {type DocItem, type LinkPart} from "#common/nav";
import {normalizePath} from "#common/route-path";

const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;

const path = computed(() => normalizePath(route.path));
// The route must lead exactly to a page or directory of the docs
const item = computed(() => currentDocItem.value?.displayLink === path.value ? currentDocItem.value : undefined);
const isDirectory = computed(() => linkParts.value.at(-1)?.isDirectory);

// Unknown routes show a 404 page; static hosts serve the generated 404.html
if (import.meta.server && !item.value) {
  setResponseStatus(useRequestEvent()!, 404, "Page Not Found");
}
useHead(() => item.value ? {} : {title: "Page Not Found"});
</script>

<template>
  <Error v-if="!item" :code="404" message="Page Not Found"/>
  <Directory v-else-if="isDirectory"/>
  <Markdown v-else :url="path" class="min-w-full"/>
</template>
