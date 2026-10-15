<script setup lang="ts">
import Error from "~/component/Error.vue";
import TableOfContents from "~/component/TableOfContents.vue";
import PageFooter from "~/component/PageFooter.vue";
import PageList from "~/component/PageList.vue";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/assets/highlight-dom";
import {copyCodeBlock} from "#common/code-copy";
import type {DocItem, LinkPart} from "#common/nav";
import type {TocEntry} from "#common/toc";

// start: the start page of the site or of an edition (docs/index.md)
const props = defineProps<{ url: string, start?: boolean }>();

const router = useRouter();
const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;
const untranslatedNote = inject('untranslatedNote') as Ref<string>;
const t = useMessages();

type Hero = { title: string, icon?: string, description?: string };
type RenderedDoc = { html: string, toc: TocEntry[], description: string, hero: Hero | null, list: boolean };

// Rendered on the server at build time; its data is part of the page payload.
// The site's start page has the route "/", requested as "/_start".
const apiPath = props.url === "/" ? "/_start" : props.url;
const {data: doc, error} = await useAsyncData(`clay-page:${props.url}`, () => $fetch<RenderedDoc>(`/api/_clay/page${apiPath}`));

useClaySeo(() => ({
  title: props.start ? undefined : currentDocItem.value?.title,
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
  <!-- More room on the left for the "#" links next to headings -->
  <div class="flex gap-10 p-6 sm:pl-9">
    <article class="prose prose-sm sm:prose max-w-none! min-w-0 flex-1">
      <template v-if="doc">
        <!-- The full text color: the article's own is a softer one for body text -->
        <header v-if="doc.hero" class="not-prose text-base-content text-center py-12">
          <h1 class="text-5xl font-bold">
            <i v-if="doc.hero.icon" :class="doc.hero.icon"/>
            {{doc.hero.title}}
          </h1>
          <p v-if="doc.hero.description" class="pt-6 text-lg opacity-80 max-w-2xl mx-auto">{{doc.hero.description}}</p>
        </header>
        <div v-if="currentDocItem?.untranslated" role="note" class="not-prose alert alert-info alert-soft mb-6">
          <i class="fa-solid fa-language"></i>
          <span>{{untranslatedNote}}</span>
        </div>
        <div ref="contentEl" v-html="doc.html" @click="handleClicks" class="w-full"></div>
        <PageList v-if="doc.list"/>
        <PageFooter v-if="!start" :url="url"/>
      </template>
      <Error v-else :code="error?.statusCode ?? 500" :message="error?.statusMessage ?? 'Error'"/>
    </article>
    <aside v-if="doc && doc.toc.length > 1" class="hidden xl:block w-56 shrink-0 ml-auto">
      <TableOfContents :entries="doc.toc" :scroll-container="scrollContainer" class="sticky top-6"/>
    </aside>
  </div>
</template>
