<script setup lang="ts">
import Navbar from "~/component/Navbar.vue";
import Sidebar from "~/component/Sidebar.vue";
import Content from "~/component/Content.vue";

import {type Configuration, DEFAULT_CONFIGURATION} from "~/assets/configuration";
import { shikiHighlighter } from "~/assets/markdown-parser";
import {loadFromYamlConfig} from "~/assets/config-loader";
import {
  delimitLinkParts,
  type DocItem, getCurrentDocItemFromRoute,
  getLinkPartsFromCurrentRoute,
  loadFromYamlStructure
} from "~/assets/structure-loader";

const configuration = ref<Configuration>(DEFAULT_CONFIGURATION)
const structure = ref<DocItem | null>(null)

async function loadYamlConfig(): Promise<Configuration> {
  const data = await fetch("/clay.yaml");
  const yamlString = await data.text();
  return loadFromYamlConfig(yamlString);
}

async function loadYamlStructure(): Promise<DocItem> {
  const data = await fetch("/clay-structure.yaml");
  const yamlString = await data.text();
  return loadFromYamlStructure(yamlString);
}

let shikiReady = ref(false)
let structureReady = ref(false)
let configReady = ref(false)

onMounted(async () => {
  configuration.value = await loadYamlConfig()
  configReady.value = true
  structure.value = await loadYamlStructure()
  structureReady.value = true

  useHead({
    script: [{ src: `https://kit.fontawesome.com/${configuration.value.fontawesomeKit}.js`, crossorigin: 'anonymous'}],
    link: [{ rel: 'icon', type: 'image/png', href: '/' + configuration.value.favicon }],
    title: configuration.value.title,
  });

  const img = new Image();
  img.src = '/' + configuration.value.navbar.logo;

  await shikiHighlighter.loadLanguage("text")

  for (const lang of configuration.value.langs)
    await shikiHighlighter.loadLanguage(lang)

  shikiReady.value = true
})

const route = useRoute();

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
  <div class="grid grid-rows-[4.5rem_1fr] grid-cols-[20rem_1fr] row-end-auto w-screen h-screen">
    <Navbar class="col-span-2"/>
    <Sidebar class="hidden lg:block w-full"/>
    <Content class="h-full w-full col-span-2 lg:col-span-1 overflow-scroll">
      <slot />
    </Content>
  </div>
</template>