<script setup lang="ts">
import {highlight, type Language} from "~/utils/shiki";

// Text in the colors of the code blocks (app/utils/shiki.ts); plain until Shiki has loaded
const props = defineProps<{ text: string, language?: Language }>();
const lines = computed(() => highlight(props.text, props.language));
</script>

<template>
  <code v-if="lines" class="clay-shiki"><template v-for="(line, i) in lines" :key="i"><template v-if="i">{{"\n"}}</template><span
      v-for="(token, j) in line" :key="j" :style="token.htmlStyle">{{token.content}}</span></template></code>
  <code v-else>{{text}}</code>
</template>
