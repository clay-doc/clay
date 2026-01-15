<script setup lang="ts">
import {shikiMark} from "~/assets/markdown-parser"
import MarkdownLoader from "~/component/MarkdownLoader.vue";
import Error from "~/component/Error.vue";
import { useMarkdownCache } from "~/composables/use-markdown-cache";
import {dropFrontMatterIfExists} from "~/assets/front-matter-extractor";

const props = defineProps(["url"])

const contentCache = useMarkdownCache();

const content = ref<string | undefined>("")
const error = ref<string | null>(null);
const errorCode = ref<number | null>(null);

const markdownReady = ref(false);

async function loadContent() {
  if (props.url) {
    const cacheKey = props.url;
    if (contentCache.has(cacheKey)) {
      content.value = contentCache.get(cacheKey);
      markdownReady.value = true
    } else {
      const response = await fetch("/docs" + props.url + ".md");
      if (response.ok) {
        const data = await response.text();
        const sanitized = dropFrontMatterIfExists(data)
        const parsed = await shikiMark.parse(sanitized, {gfm: true, breaks: true});
        content.value = parsed;
        markdownReady.value = true
        contentCache.set(cacheKey, parsed);
      } else {
        content.value = undefined
        markdownReady.value = true
        error.value = response.statusText
        errorCode.value = response.status
      }
    }
  }
}

onMounted(loadContent);
const router = useRouter();

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  if (target && target.tagName === 'A') {
    const href = target.getAttribute('href');

    if (href && href.startsWith('/')) {
      event.preventDefault();
      router.push(href);
    } else {
      target.setAttribute('target', '_blank');
    }
  }
}
</script>

<template>
  <div class="prose prose-sm sm:prose p-6">
    <!-- begin content -->
    <MarkdownLoader v-if="!markdownReady" />
    <div v-else-if="content" v-html="content" @click="handleClicks" class="w-full"></div>
    <Error v-else :code="errorCode" :message="error"/>
    <!-- end content -->
  </div>
</template>