<script setup lang="ts">
import type MiniSearch from "minisearch";
import {highlight, searchSections, type SearchHit, type SearchSection, type SearchTarget} from "#common/search";
import {useSearchOpen} from "~/composables/use-search";
import {getSearchIndex} from "~/utils/search-index";
import SearchHighlight from "~/components/SearchHighlight.vue";
import type {Edition} from "#common/editions";
import {format} from "#common/i18n";
import {track} from "~/utils/analytics";

const baseUrl = inject('baseUrl') as Ref<string>;
const edition = inject('edition') as Ref<Edition>;
const t = useMessages();
const open = useSearchOpen();
const router = useRouter();

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const query = ref("");
const index = shallowRef<MiniSearch<SearchSection>>();
const status = ref<"loading" | "ready" | "error">("loading");
const selected = ref(0);
const recent = ref<SearchTarget[]>([]);

const hits = computed<SearchHit[]>(() => index.value ? searchSections(index.value, query.value, 50) : []);
const hasQuery = computed(() => query.value.trim() !== "");

// A search that found nothing, once the reader stops typing, tells what the docs lack
let searched = "";
let settle: ReturnType<typeof setTimeout> | undefined;
watch([query, hits], () => {
  clearTimeout(settle);
  const text = query.value.trim();
  if (!text || hits.value.length > 0 || !index.value) return;
  settle = setTimeout(() => {
    if (text !== searched) track("Search without results", {query: text});
    searched = text;
  }, 1500);
});

// The results can be narrowed to one top-level section of the docs
const section = ref("");
const sectionOf = (item: SearchTarget) => item.path ? item.path.split(" › ")[0]! : item.pageTitle;
const sections = computed(() => {
  const counts = new Map<string, number>();
  for (const hit of hits.value) counts.set(sectionOf(hit), (counts.get(sectionOf(hit)) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({name, count}));
});
watch(sections, list => {
  if (section.value && !list.some(s => s.name === section.value)) section.value = "";
});
const filtered = computed(() => section.value ? hits.value.filter(hit => sectionOf(hit) === section.value) : hits.value);

// Results by page, in the order of each page's best match
const groups = computed(() => {
  const pages = new Map<string, { link: string, title: string, path: string, hits: SearchHit[] }>();
  for (const hit of filtered.value) {
    let page = pages.get(hit.link);
    if (!page) pages.set(hit.link, page = {link: hit.link, title: hit.pageTitle, path: hit.path, hits: []});
    page.hits.push(hit);
  }
  return [...pages.values()];
});
// In the order shown, for the arrow keys
const items = computed<(SearchTarget | SearchHit)[]>(() => hasQuery.value ? groups.value.flatMap(page => page.hits) : recent.value);
const position = (item: SearchTarget | SearchHit) => items.value.indexOf(item);
const count = computed(() => filtered.value.length === 1 ? t.value.searchResult : format(t.value.searchResults, {count: String(filtered.value.length)}));

watch(items, () => selected.value = 0);
// Results come from the version and language shown
watch(() => edition.value.prefix, () => index.value = undefined);
watch(selected, i => document.getElementById(`search-item-${i}`)?.scrollIntoView({block: "nearest"}));

watch(open, async isOpen => {
  if (!isOpen) {
    dialog.value?.close();
    return;
  }
  query.value = "";
  section.value = "";
  recent.value = loadRecent();
  dialog.value?.showModal();
  await nextTick();
  input.value?.focus();
  await loadIndex();
});

async function loadIndex() {
  if (index.value) return;
  status.value = "loading";
  try {
    index.value = await getSearchIndex(baseUrl.value, edition.value.prefix);
    status.value = "ready";
  } catch {
    status.value = "error";
  }
}

function href(target: SearchTarget) {
  return target.link + (target.anchor ? "#" + target.anchor : "");
}

// Matched words go along as ?highlight= so the page can mark them
function resultLocation(item: SearchTarget | SearchHit) {
  const words = terms(item);
  return {
    path: item.link,
    hash: item.anchor ? "#" + item.anchor : "",
    query: words.length ? {highlight: words.join(" ")} : {}
  };
}

function go(target: SearchTarget | SearchHit | undefined) {
  if (!target) return;
  saveRecent(target);
  open.value = false;
  router.push(resultLocation(target));
}

function onKeydown(e: KeyboardEvent) {
  const count = items.value.length;
  if (e.key === "ArrowDown" && count) {
    e.preventDefault();
    selected.value = (selected.value + 1) % count;
  } else if (e.key === "ArrowUp" && count) {
    e.preventDefault();
    selected.value = (selected.value - 1 + count) % count;
  } else if (e.key === "Enter") {
    e.preventDefault();
    go(items.value[selected.value]);
  }
}

function terms(item: SearchTarget | SearchHit) {
  return "terms" in item ? item.terms : [];
}

// Recent pages are per site; several Clay sites can share one origin (e.g. GitHub Pages)
const recentKey = computed(() => `clay-search-recent:${baseUrl.value}`);

function loadRecent(): SearchTarget[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey.value) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecent(target: SearchTarget) {
  const {link, anchor, pageTitle, heading, path} = target;
  const entry = {link, anchor, pageTitle, heading, path};
  const others = loadRecent().filter(r => href(r) !== href(entry));
  try {
    localStorage.setItem(recentKey.value, JSON.stringify([entry, ...others].slice(0, 6)));
  } catch {
    // Storage unavailable (private mode, blocked site data); recent pages are optional
  }
}
</script>

<template>
  <dialog ref="dialog" class="modal modal-top sm:modal-middle" @close="open = false">
    <div class="modal-box p-0 sm:max-w-3xl flex flex-col h-[min(42rem,85vh)]">
      <label class="input input-lg w-full h-16 px-5 gap-3 rounded-none border-0 border-b border-base-300 shadow-none outline-none! shrink-0">
        <i class="fa-solid fa-magnifying-glass opacity-60"></i>
        <input ref="input" v-model="query" type="search" :placeholder="t.searchDocs"
               :aria-label="t.searchDocs" autocomplete="off" @keydown="onKeydown"/>
      </label>

      <!-- One chip per top-level section with results -->
      <div v-if="hasQuery && sections.length > 1" class="flex flex-wrap gap-2 px-5 py-3 border-b border-base-300 shrink-0">
        <button v-for="chip in [{name: '', count: hits.length}, ...sections]" :key="chip.name" type="button"
                class="btn btn-sm rounded-full font-normal gap-1.5" :class="section === chip.name ? 'btn-primary' : 'btn-ghost border-base-300'"
                :aria-pressed="section === chip.name" @click="section = chip.name; input?.focus()">
          {{chip.name || t.searchAll}}<span class="opacity-60 text-xs">{{chip.count}}</span>
        </button>
      </div>

      <div class="overflow-y-auto grow px-3 py-2">
        <p v-if="status === 'error'" class="p-4 text-error">
          <i class="fa-solid fa-triangle-exclamation mr-2"></i>{{t.searchError}}
        </p>
        <div v-else-if="hasQuery && status === 'loading'" class="flex flex-col gap-3 p-3">
          <div v-for="i in 4" :key="i" class="skeleton h-14 w-full"></div>
        </div>
        <p v-else-if="hasQuery && hits.length === 0" class="p-6 text-center opacity-70">{{format(t.noResults, {query})}}</p>
        <p v-else-if="!hasQuery && recent.length === 0" class="p-6 text-center opacity-70">{{t.typeToSearch}}</p>

        <template v-if="hasQuery">
          <section v-for="page in groups" :key="page.link" class="py-1">
            <p class="flex items-baseline gap-2 px-3 pt-2 pb-1 text-sm font-semibold">
              {{page.title}}<span v-if="page.path" class="text-xs font-normal opacity-60 truncate">{{page.path}}</span>
            </p>
            <ul class="menu w-full p-0 gap-0.5">
              <li v-for="hit in page.hits" :key="hit.id">
                <a :id="`search-item-${position(hit)}`" :href="router.resolve(resultLocation(hit)).href" :class="{'menu-active': position(hit) === selected}"
                   class="grid grid-cols-[1rem_1fr_auto] items-start gap-3 py-2.5" @click.prevent="go(hit)" @mousemove="selected = position(hit)">
                  <i class="fa-solid mt-1 text-xs opacity-60" :class="hit.heading ? 'fa-hashtag' : 'fa-file-lines'"></i>
                  <span class="flex flex-col gap-0.5 min-w-0">
                    <span class="font-medium">
                      <SearchHighlight :segments="highlight(hit.heading || hit.pageTitle, hit.terms)"/>
                    </span>
                    <span v-if="hit.snippet.length" class="text-sm opacity-75 line-clamp-2">
                      <SearchHighlight :segments="hit.snippet"/>
                    </span>
                  </span>
                  <i class="fa-solid fa-arrow-turn-down rotate-90 mt-1 text-xs" :class="position(hit) === selected ? 'opacity-60' : 'opacity-0'"></i>
                </a>
              </li>
            </ul>
          </section>
        </template>
        <template v-else-if="recent.length">
          <p class="px-3 pt-2 pb-1 text-sm font-semibold">{{t.recent}}</p>
          <ul class="menu w-full p-0 gap-0.5">
            <li v-for="(item, i) in recent" :key="href(item)">
              <a :id="`search-item-${i}`" :href="router.resolve(resultLocation(item)).href" :class="{'menu-active': i === selected}"
                 class="grid grid-cols-[1rem_1fr_auto] items-start gap-3 py-2.5" @click.prevent="go(item)" @mousemove="selected = i">
                <i class="fa-solid fa-clock-rotate-left mt-1 text-xs opacity-60"></i>
                <span class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-medium">{{item.heading || item.pageTitle}}</span>
                  <span class="text-xs opacity-60 truncate">{{[item.path, item.heading ? item.pageTitle : ""].filter(Boolean).join(" › ")}}</span>
                </span>
                <i class="fa-solid fa-arrow-turn-down rotate-90 mt-1 text-xs" :class="i === selected ? 'opacity-60' : 'opacity-0'"></i>
              </a>
            </li>
          </ul>
        </template>
      </div>

      <div class="flex items-center gap-4 px-5 py-2.5 border-t border-base-300 text-xs shrink-0">
        <span class="hidden sm:flex items-center gap-1.5 opacity-70"><kbd class="kbd kbd-xs">↑</kbd><kbd class="kbd kbd-xs">↓</kbd>{{t.searchNavigate}}</span>
        <span class="hidden sm:flex items-center gap-1.5 opacity-70"><kbd class="kbd kbd-xs">↵</kbd>{{t.searchOpen}}</span>
        <span class="hidden sm:flex items-center gap-1.5 opacity-70"><kbd class="kbd kbd-xs">Esc</kbd>{{t.searchClose}}</span>
        <span v-if="hasQuery && status === 'ready'" class="ml-auto opacity-70">{{count}}</span>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button :aria-label="t.closeSearch">close</button>
    </form>
  </dialog>
</template>
