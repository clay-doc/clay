<script setup lang="ts">
import Error from "~/components/Error.vue";
import TableOfContents from "~/components/TableOfContents.vue";
import PageFooter from "~/components/PageFooter.vue";
import PageList from "~/components/PageList.vue";
import PageActions from "~/components/PageActions.vue";
import {clearHighlights, firstMarkInSection, highlightTerms} from "~/utils/highlight-dom";
import {copyCodeBlock} from "~/utils/code-copy";
import {remember, restoreTabs, reveal, selectLabel, selectTab, tabKeydown} from "~/utils/tabs";
import {drawDiagrams} from "~/utils/diagrams";
import RequestCell from "~/components/RequestCell.vue";
import ApiCredentials from "~/components/ApiCredentials.vue";
import {h, render} from "vue";
import type {CellData} from "#common/openapi";
import {track} from "~/utils/analytics";
import type {DocItem, LinkPart} from "#common/nav";
import {PAGE_ACTIONS, showsPageAction, type Configuration} from "#common/configuration";
import type {TocEntry} from "#common/toc";

// start: the start page of the site or of an edition (docs/index.md)
const props = defineProps<{ url: string, start?: boolean }>();

const router = useRouter();
const route = useRoute();
const linkParts = inject('linkParts') as Ref<LinkPart[]>;
const currentDocItem = inject('currentDocItem') as Ref<DocItem | undefined>;
const untranslatedNote = inject('untranslatedNote') as Ref<string>;
const config = inject('config') as Ref<Configuration | undefined>;
// "pageActions" in clay.yaml can hide every entry of the page menu
const hasActions = computed(() => PAGE_ACTIONS.some(action => showsPageAction(config.value, action)));
const t = useMessages();
const {theme} = useTheme();

type Hero = { title: string, icon?: string, description?: string };
type RenderedDoc = { html: string, toc: TocEntry[], description: string, hero: Hero | null, list: boolean, socialImage: string | null };

// Rendered on the server at build time; its data is part of the page payload.
// The site's start page has the route "/", requested as "/_start".
const pagePath = props.url === "/" ? "/_start" : props.url;
const {data: doc, error} = await useAsyncData(`clay-page:${props.url}`, () => $fetch<RenderedDoc>(`/_clay/page${pagePath}`));

useClaySeo(() => ({
  title: props.start ? undefined : currentDocItem.value?.title,
  description: doc.value?.description,
  route: props.url,
  type: "article",
  updated: currentDocItem.value?.updated,
  image: doc.value?.socialImage ?? undefined,
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

// Components that need the browser: the reader's tabs, diagrams in the site's
// theme, and request cells to fill in and run
function drawComponents() {
  const root = contentEl.value;
  if (!root) return;
  restoreTabs(root);
  drawDiagrams(root, theme.value === "clay-dark", t.value.diagramError);
  mountCells(root);
}

// Request cells replace what the server rendered of them (server/utils/components.ts),
// and the credentials of an API get their form
const baseURL = useRuntimeConfig().app.baseURL;
type Mounted = { el: HTMLElement, data: CellData | { api: string, schemes: CellData["schemes"] } };
let cells: Mounted[] = [];
const drawCell = ({el, data}: Mounted) => render("method" in data
    ? h(RequestCell, {cell: data, t: t.value, baseUrl: baseURL, here: props.url, navigate: (to: string) => router.push(to)})
    : h(ApiCredentials, {api: data.api, schemes: data.schemes, t: t.value, baseUrl: baseURL}), el);
function mountCells(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>(".clay-request[data-request], .clay-credentials[data-credentials]")) {
    if (cells.some(cell => cell.el === el)) continue;
    let data: Mounted["data"];
    try {
      data = JSON.parse(el.dataset.request ?? el.dataset.credentials!);
    } catch {
      continue;
    }
    el.replaceChildren();
    const cell = {el, data};
    drawCell(cell);
    cells.push(cell);
  }
}
function unmountCells() {
  for (const {el} of cells) render(null, el);
  cells = [];
}
// The interface texts change after a page in another language is shown: drawn
// again, the cells take them and keep what the reader entered
watch(t, () => cells.forEach(drawCell));
onBeforeUnmount(unmountCells);

onMounted(() => {
  scrollContainer.value = contentEl.value?.closest<HTMLElement>("#content") ?? null;
  drawComponents();
  revealResult();
});
watch(() => [route.hash, route.query.highlight], revealResult);
watch(() => doc.value?.html, () => nextTick(drawComponents));
// Before the page's HTML is replaced
watch(() => doc.value?.html, unmountCells, {flush: "pre"});
watch(theme, () => contentEl.value && drawDiagrams(contentEl.value, theme.value === "clay-dark", t.value.diagramError));

function handleClicks(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyButton = target?.closest<HTMLElement>('button.copy-code');
  if (copyButton) {
    copyCodeBlock(copyButton, navigator.clipboard, t.value);
    track(copyButton.closest(".clay-prompt") ? "Copy prompt" : "Copy code", {page: props.url});
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
  // Groups of their own, like an operation's responses, are not carried to others
  if (tab.closest("[data-tabs-local]")) return;
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
        <!-- Narrower screens have no room beside the page: the contents and the
             page's actions fold up above it -->
        <details v-if="doc.toc.length > 1 || hasActions" ref="tocBox" class="not-prose xl:hidden mb-6 rounded-box border border-base-300 text-sm">
          <summary class="cursor-pointer px-4 py-2 font-semibold">{{doc.toc.length > 1 ? t.onThisPage : t.pageActions}}</summary>
          <div class="px-4 pb-3">
            <TableOfContents v-if="doc.toc.length > 1" :entries="doc.toc" :scroll-container="scrollContainer" :title="false"
                             @navigate="tocBox?.removeAttribute('open')"/>
            <PageActions v-if="hasActions" :route="url" :class="{'page-actions-below': doc.toc.length > 1}"/>
          </div>
        </details>
        <div ref="contentEl" v-html="doc.html" @click="handleClicks" @keydown="handleKeys" class="w-full"></div>
        <PageList v-if="doc.list"/>
        <PageFooter v-if="!start" :url="url"/>
      </template>
      <Error v-else :code="error?.status ?? 500" :message="error?.statusText ?? 'Error'"/>
    </article>
    <aside v-if="doc" class="hidden xl:block w-56 shrink-0 ml-auto">
      <div class="sticky top-6">
        <TableOfContents v-if="doc.toc.length > 1" :entries="doc.toc" :scroll-container="scrollContainer"/>
        <!-- Below a line under the contents: the page for language models -->
        <PageActions v-if="hasActions" :route="url" :class="{'page-actions-below': doc.toc.length > 1}"/>
      </div>
    </aside>
  </div>
</template>
