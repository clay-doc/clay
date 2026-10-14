<script setup lang="ts">
import type {DocItem, LinkPart} from "#common/nav";
import DirectoryGrid from "~/component/DirectoryGrid.vue";
import Markdown from "~/component/Markdown.vue";

// A folder's page: its index.md, or its title with cards of its pages
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
  <div v-else class="hero h-[80vh]">
    <div class="hero-content text-center">
      <div>
        <h1 class="text-5xl font-bold pb-12">
          <i :class="currentDocItem.icon"/>
          {{currentDocItem.title}}
        </h1>
        <DirectoryGrid />
      </div>
    </div>
  </div>
</template>
