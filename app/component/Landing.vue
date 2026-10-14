<script setup lang="ts">
import type {Configuration} from "#common/configuration";
import DirectoryGrid from "~/component/DirectoryGrid.vue";

// Start page of the site, and of each older version under its prefix
const props = defineProps<{ route: string }>();
const config = inject('config') as Ref<Configuration>;

useClaySeo(() => ({title: config.value.title, description: config.value.index?.description, route: props.route}));
</script>

<template>
  <div class="hero h-[80vh]">
    <div class="hero-content text-center">
      <div>
        <h1 class="text-5xl font-bold">
          <i v-if="config.index?.icon" :class="config.index.icon"/>
          {{config.index?.title || config.title}}
         </h1>
        <p class="py-6 pb-12">
          {{config.index?.description}}
        </p>
        <DirectoryGrid />
      </div>
    </div>
  </div>
</template>
