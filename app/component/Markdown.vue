<script setup lang="ts">
import {shikiMark} from "~/assets/markdown-parser"
import MarkdownLoader from "~/component/MarkdownLoader.vue";
import Error from "~/component/Error.vue";
import { useMarkdownCache } from "~/composables/use-markdown-cache";
import {dropFrontMatterIfExists} from "~/assets/front-matter-extractor";
import linkConcat from "~/assets/link-concat";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/assets/highlight-dom";
const props = defineProps(["url"])

const baseUrl = inject('baseUrl') as Ref<string>;

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
      const response = await fetch(linkConcat(baseUrl.value, "/docs" + props.url + ".md"), { cache: 'no-store' });
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

const route = useRoute();

const contentEl = ref<HTMLElement | null>(null);

// Content renders after navigation, so once it exists: mark the words from a
// search result (?highlight=) and jump to the first one in the #section
async function revealResult() {
  await nextTick();
  const root = contentEl.value;
  if (!root) return;

  clearHighlights(root);
  const highlight = route.query.highlight;
  const terms = typeof highlight === "string" ? highlight.split(" ").filter(Boolean) : [];
  const marks = highlightTerms(root, terms);

  const anchor = route.hash ? document.getElementById(decodeURIComponent(route.hash.slice(1))) : null;
  const mark = firstMarkInSection(root, marks, anchor);
  mark?.classList.add("search-hit-active");
  (mark ?? anchor)?.scrollIntoView({block: mark ? "center" : "start"});
}

onMounted(async () => {
  await loadContent();
  await revealResult();
});
watch(() => [route.hash, route.query.highlight], revealResult);

const router = useRouter();

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  if (target && target.tagName === 'A') {
    const href = target.getAttribute('href');
    if (!href) return;

    if (href.startsWith('http')) {
      target.setAttribute('target', '_blank');
    } else {
      event.preventDefault();
      router.push(href);
    }
  }
}
</script>

<template>
  <div class="prose prose-sm sm:prose p-6">
    <!-- begin content -->
    <MarkdownLoader v-if="!markdownReady" />
    <div v-else-if="content" ref="contentEl" v-html="content" @click="handleClicks" class="w-full"></div>
    <Error v-else :code="errorCode" :message="error"/>
    <!-- end content -->
  </div>
</template>