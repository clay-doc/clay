<script setup lang="ts">
import type {DocItem, LinkPart} from "#common/nav";
import DirectoryGrid from "~/component/DirectoryGrid.vue";

const currentDocItem = inject("currentDocItem") as Ref<DocItem>
const linkParts = inject("linkParts") as Ref<LinkPart[]>

useClaySeo(() => ({
  title: currentDocItem.value.title,
  description: `${currentDocItem.value.title}: ${(currentDocItem.value.children ?? []).map(c => c.title).join(", ")}`,
  route: currentDocItem.value.displayLink,
  trail: linkParts.value.map(part => ({title: part.title, route: part.link ?? currentDocItem.value.displayLink})),
}));
</script>

<template>
  <div class="hero h-[80vh]">
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