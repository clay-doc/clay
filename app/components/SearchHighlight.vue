<script setup lang="ts">
import type {Segment} from "#common/search";

defineProps<{ segments: Segment[] }>()
</script>

<template>
  <template v-for="s in segments"><mark v-if="s.match" class="bg-primary/25 text-inherit rounded-sm">{{s.text}}</mark><template v-else>{{s.text}}</template></template>
</template>
