<script setup lang="ts">
import Error from "~/component/Error.vue";
import TableOfContents from "~/component/TableOfContents.vue";
import PageFooter from "~/component/PageFooter.vue";
import PageList from "~/component/PageList.vue";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/assets/highlight-dom";
import {copyCodeBlock} from "#common/code-copy";
import {remember, restoreTabs, reveal, selectLabel, selectTab, tabKeydown} from "~/assets/tabs";
import {drawDiagrams} from "~/assets/diagrams";
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
const {theme} = useTheme();

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
const tocBox = ref<HTMLDetailsElement | null>(null);
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
  // A hit in a hidden tab or folded details: show it first
  const target = mark ?? anchor;
  if (target) reveal(target);
  (mark ?? anchor)?.scrollIntoView({block: mark ? "center" : "start"});
}

// Components that need the browser: the reader's tabs, and diagrams in the site's theme
function drawComponents() {
  const root = contentEl.value;
  if (!root) return;
  restoreTabs(root);
  drawDiagrams(root, theme.value === "clay-dark", t.value.diagramError);
}

onMounted(() => {
  scrollContainer.value = contentEl.value?.closest<HTMLElement>("#content") ?? null;
  drawComponents();
  revealResult();
});
watch(() => [route.hash, route.query.highlight], revealResult);
watch(() => doc.value?.html, () => nextTick(drawComponents));
watch(theme, () => contentEl.value && drawDiagrams(contentEl.value, theme.value === "clay-dark", t.value.diagramError));

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyButton = target?.closest<HTMLElement>('button.copy-code');
  if (copyButton) {
    copyCodeBlock(copyButton, navigator.clipboard, t.value);
    return;
  }

  const tab = target?.closest<HTMLElement>('[data-tabs] [role=tab]');
  if (tab) {
    pickTab(tab);
    return;
  }

  // Plain clicks on doc links navigate in the app; modified clicks (new tab,
  // new window) and external links are left to the browser
  const link = target?.closest<HTMLAnchorElement>('a[data-route]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  router.push(link.dataset.route!);
}

// A tab picked in one group is picked in all groups that have it, now and on later pages
function pickTab(tab: HTMLElement) {
  const label = tab.textContent?.trim() ?? "";
  selectTab(tab);
  if (contentEl.value) selectLabel(contentEl.value, label);
  remember(label);
}

function handleKeys(event: KeyboardEvent) {
  const tab = tabKeydown(event);
  if (tab) pickTab(tab);
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
        <!-- Narrower screens have no room beside the page: the contents fold up above it -->
        <details v-if="doc.toc.length > 1" ref="tocBox" class="not-prose xl:hidden mb-6 rounded-box border border-base-300 text-sm">
          <summary class="cursor-pointer px-4 py-2 font-semibold">{{t.onThisPage}}</summary>
          <TableOfContents :entries="doc.toc" :scroll-container="scrollContainer" :title="false" class="px-4 pb-3"
                           @navigate="tocBox?.removeAttribute('open')"/>
        </details>
        <div ref="contentEl" v-html="doc.html" @click="handleClicks" @keydown="handleKeys" class="w-full"></div>
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
