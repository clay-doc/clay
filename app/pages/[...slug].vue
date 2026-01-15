<script setup lang="ts">
import Markdown from "~/component/Markdown.vue";
import {type LinkPart} from "~/assets/structure-loader";
import MarkdownLoader from "~/component/MarkdownLoader.vue";
import Directory from "~/component/Directory.vue";
import ContentLoader from "~/component/ContentLoader.vue";

const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const shikiReady = inject('shikiReady') as Ref<boolean>;
const isDirectory = computed(() => linkParts.value[linkParts.value.length - 1]?.isDirectory);
</script>

<template>
  <Directory v-if="isDirectory"/>
  <MarkdownLoader v-else-if="!shikiReady" />
  <Markdown v-else :url="route.fullPath" class="min-w-full"/>
</template>

<style scoped>

</style>