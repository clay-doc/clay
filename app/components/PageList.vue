<script setup lang="ts">
import type {DocItem} from "#common/nav";

// The pages and subfolders of the current folder as a bulleted list of links,
// set apart by a line and a heading: below the text of an index.md with
// "list: true", and on folder and start pages without index.md text
const currentDocItem = inject("currentDocItem") as Ref<DocItem>
const t = useMessages()
</script>

<template>
  <hr>
  <h2>{{t.pagesInSection}}</h2>
  <ul>
    <li v-for="item in currentDocItem.children" :key="item.displayLink">
      <NuxtLink :to="item.displayLink">{{item.title}}</NuxtLink>
    </li>
  </ul>
</template>
