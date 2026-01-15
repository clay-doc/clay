<script setup lang="ts">
import type {Configuration} from "~/assets/configuration";
import DirectoryGrid from "~/component/DirectoryGrid.vue";

const config = inject('config') as Ref<Configuration>;
</script>

<template>
  <div class="hero h-[80vh]">
    <div class="hero-content text-center">
      <div>
        <h1 class="text-5xl font-bold">
          <i :class="config.index.icon"/>
          {{config.index.title}}
         </h1>
        <p class="py-6 pb-12">
          {{config.index.description}}
        </p>
        <DirectoryGrid />
      </div>
    </div>
  </div>
</template>
