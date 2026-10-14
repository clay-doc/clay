<script setup lang="ts">
import type MiniSearch from "minisearch";
import type {DocItem} from "~/assets/structure-loader";
import {highlight, searchSections, type SearchHit, type SearchSection, type SearchTarget} from "~/assets/search-index";
import {getSearchIndex, useSearchOpen} from "~/composables/use-search";
import SearchHighlight from "~/component/SearchHighlight.vue";

const baseUrl = inject('baseUrl') as Ref<string>;
const structure = inject('structure') as Ref<DocItem | undefined>;
const open = useSearchOpen();
const router = useRouter();

const dialog = ref<HTMLDialogElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const query = ref("");
const index = shallowRef<MiniSearch<SearchSection>>();
const status = ref<"loading" | "ready" | "error">("loading");
const selected = ref(0);
const recent = ref<SearchTarget[]>([]);

const hits = computed<SearchHit[]>(() => index.value ? searchSections(index.value, query.value) : []);
const hasQuery = computed(() => query.value.trim() !== "");
const items = computed<(SearchTarget | SearchHit)[]>(() => hasQuery.value ? hits.value : recent.value);

watch(items, () => selected.value = 0);
watch(selected, i => document.getElementById(`search-item-${i}`)?.scrollIntoView({block: "nearest"}));

watch(open, async isOpen => {
  if (!isOpen) {
    dialog.value?.close();
    return;
  }
  query.value = "";
  recent.value = loadRecent();
  dialog.value?.showModal();
  await nextTick();
  input.value?.focus();
  await loadIndex();
});
watch(structure, () => open.value && loadIndex());

async function loadIndex() {
  if (index.value || !structure.value) return;
  status.value = "loading";
  try {
    index.value = await getSearchIndex(baseUrl.value, structure.value);
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
    <div class="modal-box p-0 sm:max-w-2xl flex flex-col max-h-[80vh]">
      <label class="input input-lg w-full rounded-none border-0 border-b border-base-300 shadow-none outline-none! shrink-0">
        <i class="fa-solid fa-magnifying-glass opacity-60"></i>
        <input ref="input" v-model="query" type="search" placeholder="Search documentation"
               aria-label="Search documentation" autocomplete="off" @keydown="onKeydown"/>
        <kbd class="kbd kbd-sm">Esc</kbd>
      </label>

      <div class="overflow-y-auto p-2">
        <p v-if="status === 'error'" class="p-4 text-error">
          <i class="fa-solid fa-triangle-exclamation mr-2"></i>The search index could not be loaded.
        </p>
        <div v-else-if="hasQuery && status === 'loading'" class="flex flex-col gap-3 p-3">
          <div v-for="i in 3" :key="i" class="skeleton h-12 w-full"></div>
        </div>
        <p v-else-if="hasQuery && hits.length === 0" class="p-4 opacity-70">No results for “{{query}}”</p>
        <p v-else-if="!hasQuery && recent.length === 0" class="p-4 opacity-70">Type to search all pages.</p>

        <p v-if="!hasQuery && recent.length" class="px-3 pt-1 pb-2 text-xs uppercase tracking-wide opacity-60">Recent</p>
        <ul v-if="items.length" class="menu w-full p-0">
          <li v-for="(item, i) in items" :key="href(item)">
            <a :id="`search-item-${i}`" :href="router.resolve(resultLocation(item)).href" :class="{'menu-active': i === selected}"
               class="flex flex-col items-start gap-0.5" @click.prevent="go(item)" @mousemove="selected = i">
              <span v-if="item.path" class="text-xs opacity-60 truncate w-full">{{item.path}}</span>
              <span class="font-semibold">
                <SearchHighlight :segments="highlight(item.pageTitle, terms(item))"/>
                <template v-if="item.heading">
                  <span class="opacity-50 mx-1">›</span>
                  <SearchHighlight :segments="highlight(item.heading, terms(item))"/>
                </template>
              </span>
              <span v-if="'snippet' in item && item.snippet.length" class="text-sm opacity-80 line-clamp-2">
                <SearchHighlight :segments="item.snippet"/>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button aria-label="Close search">close</button>
    </form>
  </dialog>
</template>
