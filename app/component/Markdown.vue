<script setup lang="ts">
import Error from "~/component/Error.vue";
import TableOfContents from "~/component/TableOfContents.vue";
import PageFooter from "~/component/PageFooter.vue";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/assets/highlight-dom";
import {copyCodeBlock} from "#common/code-copy";
import type {DocItem, LinkPart} from "#common/nav";
import type {TocEntry} from "#common/toc";

const props = defineProps<{ url: string }>();

const router = useRouter();
const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;
const untranslatedNote = inject('untranslatedNote') as Ref<string>;
const t = useMessages();

type RenderedDoc = { html: string, toc: TocEntry[], description: string };

// Rendered on the server at build time; its data is part of the page payload
const {data: doc, error} = await useAsyncData(`clay-page:${props.url}`, () => $fetch<RenderedDoc>(`/api/_clay/page${props.url}`));

useClaySeo(() => ({
  title: currentDocItem.value?.title,
  description: doc.value?.description,
  route: props.url,
  type: "article",
  updated: currentDocItem.value?.updated,
  trail: linkParts.value.map(part => ({title: part.title, route: part.link ?? props.url})),
}));

const contentEl = ref<HTMLElement | null>(null);
const scrollContainer = ref<HTMLElement | null>(null);

// Once the page is shown: mark the words from a search result (?highlight=)
// and jump to the first one in the #section
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

onMounted(() => {
  scrollContainer.value = contentEl.value?.closest<HTMLElement>(".overflow-scroll") ?? null;
  revealResult();
});
watch(() => [route.hash, route.query.highlight], revealResult);

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyButton = target?.closest<HTMLElement>('button.copy-code');
  if (copyButton) {
    copyCodeBlock(copyButton, navigator.clipboard, t.value);
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
      <template v-if="doc">
        <div v-if="currentDocItem?.untranslated" role="note" class="not-prose alert alert-info alert-soft mb-6">
          <i class="fa-solid fa-language"></i>
          <span>{{untranslatedNote}}</span>
        </div>
        <div ref="contentEl" v-html="doc.html" @click="handleClicks" class="w-full"></div>
        <PageFooter :url="url"/>
      </template>
      <Error v-else :code="error?.statusCode ?? 500" :message="error?.statusMessage ?? 'Error'"/>
    </article>
    <aside v-if="doc && doc.toc.length > 1" class="hidden xl:block w-56 shrink-0 ml-auto">
      <TableOfContents :entries="doc.toc" :scroll-container="scrollContainer" class="sticky top-6"/>
    </aside>
  </div>
</template>
