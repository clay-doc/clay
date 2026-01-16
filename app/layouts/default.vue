<script setup lang="ts">
import Navbar from "~/component/Navbar.vue";
import Sidebar from "~/component/Sidebar.vue";
import Content from "~/component/Content.vue";

import {type Configuration} from "~/assets/configuration";
import { shikiHighlighter } from "~/assets/markdown-parser";
import {loadFromYamlConfig} from "~/assets/config-loader";
import {
  delimitLinkParts,
  type DocItem, getCurrentDocItemFromRoute,
  getLinkPartsFromCurrentRoute,
  loadFromYamlStructure
} from "~/assets/structure-loader";
import LoadingFailed from "~/component/LoadingFailed.vue";

const configuration = ref<Configuration | undefined>(undefined)
const structure = ref<DocItem | undefined>(undefined)
const loadingFailure = ref<string | undefined>(undefined)

async function loadYamlConfig(): Promise<Configuration> {
  const res = await fetch("/clay.yaml");
  if (!res.ok) {
    loadingFailure.value = `Failed to load config file '/clay.yaml': ${res.status} ${res.statusText}`;
    return Promise.reject(new Error(loadingFailure.value));
  }
  const yamlString = await res.text();
  return loadFromYamlConfig(yamlString);
}

async function loadYamlStructure(): Promise<DocItem> {
  const res = await fetch("/clay-structure.yaml");
  if (!res.ok) {
    loadingFailure.value = `Failed to load structure file 'clay-structure-yaml': ${res.status} ${res.statusText}`;
    return Promise.reject(new Error(loadingFailure.value));
  }
  const yamlString = await res.text();
  return loadFromYamlStructure(yamlString, 'docs');
}

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

  useHead({
    script: [{ src: `https://kit.fontawesome.com/${configuration.value.fontawesomeKit}.js`, crossorigin: 'anonymous'}],
    link: [{ rel: 'icon', type: 'image/png', href: configuration.value.favicon }],
    title: configuration.value.title,
  });

  await shikiHighlighter.loadLanguage("text")

  for (const lang of configuration.value.langs)
    await shikiHighlighter.loadLanguage(lang)

  shikiReady.value = true
})

const linkParts = computed(() => getLinkPartsFromCurrentRoute(route.fullPath, structure.value!!));
const currentItem = computed(() => getCurrentDocItemFromRoute(route.fullPath, structure.value!!));
const delimitedLinkParts = computed(() => delimitLinkParts(linkParts.value, 3))

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
  </div>
</template>