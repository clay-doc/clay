<script setup lang="ts">
import HighlightedCode from "~/components/HighlightedCode.vue";
import type {Language} from "~/utils/shiki";

// A text field for code, colored as it is typed: the field's own text is
// transparent over a copy in colors, and both grow with the text
const model = defineModel<string>({default: ""});
defineProps<{ language?: Language, id?: string, label?: string }>();
</script>

<template>
  <div class="clay-code-input">
    <pre aria-hidden="true"><HighlightedCode :text="model + '\n'" :language="language"/></pre>
    <textarea :id="id" v-model="model" spellcheck="false" autocapitalize="off" autocomplete="off" :aria-label="label"></textarea>
  </div>
</template>
