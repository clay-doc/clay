<script setup lang="ts">
import Markdown from "~/component/Markdown.vue";
import Directory from "~/component/Directory.vue";
import Error from "~/component/Error.vue";
import Landing from "~/component/Landing.vue";
import {type DocItem, type LinkPart} from "#common/nav";
import {normalizePath} from "#common/route-path";
import type {Edition} from "#common/editions";

const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;
const edition = inject('edition') as Ref<Edition>;
const t = useMessages();

const path = computed(() => normalizePath(route.path));
// "/1.x" or "/de" is the start page of another version or language
const isEditionRoot = computed(() => !!edition.value.prefix && path.value === edition.value.prefix);
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
