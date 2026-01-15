<script setup lang="ts">
import type {DocItem} from "~/assets/structure-loader";
import DirectoryGrid from "~/component/DirectoryGrid.vue";

const currentDocItem = inject("currentDocItem") as Ref<DocItem>
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