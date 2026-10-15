<script setup lang="ts">
import type {DocItem, LinkPart} from "#common/nav";
import Markdown from "~/component/Markdown.vue";
import PageList from "~/component/PageList.vue";
import PageFooter from "~/component/PageFooter.vue";

// A folder's page: its index.md, or its title with a list of its pages
const currentDocItem = inject("currentDocItem") as Ref<DocItem>
const linkParts = inject("linkParts") as Ref<LinkPart[]>

if (!currentDocItem.value.hasIndex) {
  useClaySeo(() => ({
    title: currentDocItem.value.title,
    description: `${currentDocItem.value.title}: ${(currentDocItem.value.children ?? []).map(c => c.title).join(", ")}`,
    route: currentDocItem.value.displayLink,
    trail: linkParts.value.map(part => ({title: part.title, route: part.link ?? currentDocItem.value.displayLink})),
  }));
}
</script>

<template>
  <Markdown v-if="currentDocItem.hasIndex" :url="currentDocItem.displayLink" class="min-w-full"/>
  <!-- Laid out like a Markdown page: a title and the list of pages -->
  <div v-else class="flex gap-10 p-6 sm:pl-9">
    <article class="prose prose-sm sm:prose max-w-none! min-w-0 flex-1">
      <h1>{{currentDocItem.title}}</h1>
      <PageList/>
      <PageFooter :url="currentDocItem.displayLink"/>
    </article>
  </div>
</template>
