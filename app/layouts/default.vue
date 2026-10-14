<script setup lang="ts">
import Navbar from "~/component/Navbar.vue";
import Sidebar from "~/component/Sidebar.vue";
import Content from "~/component/Content.vue";

import {type Configuration, hasFontawesomeKit} from "~/assets/configuration";
import { shikiHighlighter } from "~/assets/markdown-parser";
import {loadFromYamlConfig} from "~/assets/config-loader";
import {
  delimitLinkParts,
  type DocItem, getCurrentDocItemFromRoute,
  getLinkPartsFromCurrentRoute,
  loadFromYamlStructure
} from "~/assets/structure-loader";
import LoadingFailed from "~/component/LoadingFailed.vue";
import SearchModal from "~/component/SearchModal.vue";
import MobileNav from "~/component/MobileNav.vue";
import {fetchContent} from "~/assets/content-fetch";
import {normalizePath} from "~/assets/route-path";
import linkConcat from "~/assets/link-concat";

const configuration = ref<Configuration | undefined>(undefined)
const structure = ref<DocItem | undefined>(undefined)
const loadingFailure = ref<string | undefined>(undefined)

const config = useRuntimeConfig()
const baseUrl = computed(() => config.public.baseUrl as string || "")

async function loadYamlConfig(): Promise<Configuration> {
  const res = await fetchContent(linkConcat(baseUrl.value, "/clay.yaml"));
  if (!res.ok) {
    loadingFailure.value = `Failed to load config file '/clay.yaml': ${res.status} ${res.statusText}`;
    return Promise.reject(new Error(loadingFailure.value));
  }
  const yamlString = await res.text();
  return loadFromYamlConfig(yamlString);
}

async function loadYamlStructure(): Promise<DocItem> {
  const res = await fetchContent(linkConcat(baseUrl.value, "/clay-structure.yaml"));
  if (!res.ok) {
    loadingFailure.value = `Failed to load structure file 'clay-structure-yaml': ${res.status} ${res.statusText}`;
    return Promise.reject(new Error(loadingFailure.value));
  }
  const yamlString = await res.text();
  return loadFromYamlStructure(yamlString, 'docs');
}

const FONTAWESOME_FREE_CSS = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
const FONTAWESOME_FREE_SRI = "sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg==";

let shikiReady = ref(false)
let structureReady = ref(false)
let configReady = ref(false)

const route = useRoute();

onMounted(async () => {
  configuration.value = await loadYamlConfig()
  if (loadingFailure.value) return;
  configReady.value = true

  structure.value = await loadYamlStructure()
  if (loadingFailure.value) return;
  structureReady.value = true

  // Icons: the configured Font Awesome kit, or the free icons without one
  const icons = hasFontawesomeKit(configuration.value)
      ? {script: [{src: `https://kit.fontawesome.com/${configuration.value.fontawesomeKit}.js`, crossorigin: 'anonymous' as const}], link: []}
      : {script: [], link: [{rel: 'stylesheet', href: FONTAWESOME_FREE_CSS, integrity: FONTAWESOME_FREE_SRI, crossorigin: 'anonymous' as const}]};

  useHead({
    script: icons.script,
    link: [...icons.link, { rel: 'icon', href: linkConcat(baseUrl.value, configuration.value.favicon) }],
    // Same format as the titles Clay Oven writes into each page's HTML
    title: () => {
      const site = configuration.value?.title ?? "";
      const page = linkParts.value.at(-1)?.title;
      return page && page !== site ? `${page} · ${site}` : site;
    },
  });

  await shikiHighlighter.loadLanguage("text")

  // langs are auto-detected by Clay Oven and may include ids Shiki doesn't know
  for (const lang of configuration.value.langs ?? []) {
    try {
      await shikiHighlighter.loadLanguage(lang)
    } catch {
      console.warn(`Unsupported code block language: ${lang}`)
    }
  }

  shikiReady.value = true
})

const linkParts = computed(() => getLinkPartsFromCurrentRoute(normalizePath(route.path), structure.value!!));
const currentItem = computed(() => getCurrentDocItemFromRoute(normalizePath(route.path), structure.value!!));
const delimitedLinkParts = computed(() => delimitLinkParts(linkParts.value, 3))

provide('baseUrl', baseUrl);
provide('config', configuration);
provide('structure', structure);
provide('linkParts', linkParts)
provide('currentDocItem', currentItem)
provide('delimitedLinkParts', delimitedLinkParts)
provide('shikiReady', shikiReady)
provide('structureReady', structureReady)
provide('configReady', configReady)
</script>

<template>
  <LoadingFailed v-if="loadingFailure" :message="loadingFailure"/>
  <div v-else class="grid grid-rows-[4.5rem_1fr] grid-cols-[20rem_1fr] row-end-auto w-screen h-screen">
    <Navbar class="col-span-2"/>
    <Sidebar class="hidden lg:block w-full"/>
    <Content class="h-full w-full col-span-2 lg:col-span-1 overflow-scroll">
      <slot />
    </Content>
    <SearchModal/>
    <MobileNav/>
  </div>
</template>