<script setup lang="ts">
const props = defineProps(["title", "icon", "link"])
</script>

<template>
  <NuxtLink :to="link" class="btn btn-block btn-soft max-h-32 min-h-32 max-w-32 min-w-32 rounded-2xl bg-base-200">
    <div class="flex flex-col items-center justify-center gap-2">
      <i :class="props.icon + ' text-3xl'"></i>
      <span>{{props.title}}</span>
    </div>
  </NuxtLink>
</template>