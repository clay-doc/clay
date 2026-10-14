<script setup lang="ts">
import {shikiMark} from "~/assets/markdown-parser"
import MarkdownLoader from "~/component/MarkdownLoader.vue";
import Error from "~/component/Error.vue";
import TableOfContents, {type TocEntry} from "~/component/TableOfContents.vue";
import PageFooter from "~/component/PageFooter.vue";
import { useMarkdownCache } from "~/composables/use-markdown-cache";
import {dropFrontMatterIfExists} from "~/assets/front-matter-extractor";
import linkConcat from "~/assets/link-concat";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/assets/highlight-dom";
import {copyCodeBlock} from "~/assets/code-copy";
import {rewriteDocHtml} from "~/assets/doc-links";
import {sanitizeHtml} from "~/assets/sanitize";
import {fetchContent} from "~/assets/content-fetch";
const props = defineProps(["url"])

const baseUrl = inject('baseUrl') as Ref<string>;
const router = useRouter();

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
      const response = await fetchContent(linkConcat(baseUrl.value, "/docs" + props.url + ".md"));
      if (response.ok) {
        const data = await response.text();
        const body = dropFrontMatterIfExists(data)
        const rendered = sanitizeHtml(await shikiMark.parse(body, {gfm: true, breaks: true}));
        const parsed = rewriteDocHtml(rendered, props.url, baseUrl.value, route => router.resolve(route).href);
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
const scrollContainer = ref<HTMLElement | null>(null);
const toc = ref<TocEntry[]>([]);

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

async function buildToc() {
  await nextTick();
  scrollContainer.value = contentEl.value?.closest<HTMLElement>(".overflow-scroll") ?? null;
  toc.value = [...contentEl.value?.querySelectorAll<HTMLElement>("h2[id], h3[id]") ?? []]
      .map(heading => ({id: heading.id, text: heading.textContent?.trim() ?? "", level: heading.tagName === "H3" ? 3 : 2}));
}

onMounted(async () => {
  await loadContent();
  await buildToc();
  await revealResult();
});
watch(() => [route.hash, route.query.highlight], revealResult);

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyButton = target?.closest<HTMLElement>('button.copy-code');
  if (copyButton) {
    copyCodeBlock(copyButton);
    return;
  }

  // Plain clicks on doc links navigate in the app; modified clicks (new tab,
  // new window) and external links are left to the browser
  const link = target?.closest<HTMLAnchorElement>('a[data-route]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.push(link.dataset.route!);
}
</script>

<template>
  <div class="flex gap-10 p-6">
    <article class="prose prose-sm sm:prose max-w-none! min-w-0 flex-1">
      <!-- begin content -->
      <MarkdownLoader v-if="!markdownReady" />
      <template v-else-if="content">
        <div ref="contentEl" v-html="content" @click="handleClicks" class="w-full"></div>
        <PageFooter :url="url"/>
      </template>
      <Error v-else :code="errorCode" :message="error"/>
      <!-- end content -->
    </article>
    <aside v-if="toc.length > 1" class="hidden xl:block w-56 shrink-0 ml-auto">
      <TableOfContents :entries="toc" :scroll-container="scrollContainer" class="sticky top-6"/>
    </aside>
  </div>
</template>
