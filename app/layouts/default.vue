<script setup lang="ts">
import Navbar from "~/component/Navbar.vue";
import Sidebar from "~/component/Sidebar.vue";
import Content from "~/component/Content.vue";
import SearchModal from "~/component/SearchModal.vue";
import MobileNav from "~/component/MobileNav.vue";

import {hasFontawesomeKit} from "#common/configuration";
import {delimitLinkParts, getCurrentDocItemFromRoute, getLinkPartsFromCurrentRoute} from "#common/nav";
import {normalizePath} from "#common/route-path";
import linkConcat from "#common/link-concat";

// Config and navigation (see app/composables/use-site.ts)
const site = await useSite();
const configuration = computed(() => site.value.config);
const structure = computed(() => site.value.nav);
const siteConfig = configuration.value;

const baseUrl = computed(() => useRuntimeConfig().app.baseURL);
const route = useRoute();

const FONTAWESOME_FREE_CSS = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
const FONTAWESOME_FREE_SRI = "sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg==";

useHead({
  link: [
    ...(siteConfig.favicon ? [{rel: 'icon', href: linkConcat(baseUrl.value, siteConfig.favicon)}] : []),
    // Without a kit, the free Font Awesome icons are used
    ...(hasFontawesomeKit(siteConfig) ? [] : [{rel: 'stylesheet', href: FONTAWESOME_FREE_CSS, integrity: FONTAWESOME_FREE_SRI, crossorigin: 'anonymous' as const}]),
  ],
});

// A kit replaces icons in the DOM, so it only loads after hydration
onMounted(() => {
  if (hasFontawesomeKit(siteConfig)) {
    useHead({script: [{src: `https://kit.fontawesome.com/${siteConfig.fontawesomeKit}.js`, crossorigin: 'anonymous'}]});
  }
});

const linkParts = computed(() => getLinkPartsFromCurrentRoute(normalizePath(route.path), structure.value));
const currentItem = computed(() => getCurrentDocItemFromRoute(normalizePath(route.path), structure.value));
const delimitedLinkParts = computed(() => delimitLinkParts(linkParts.value, 3))

provide('baseUrl', baseUrl);
provide('config', configuration);
provide('structure', structure);
provide('linkParts', linkParts)
provide('currentDocItem', currentItem)
provide('delimitedLinkParts', delimitedLinkParts)
</script>

<template>
  <div class="grid grid-rows-[4.5rem_1fr] grid-cols-[20rem_1fr] row-end-auto w-screen h-screen">
    <Navbar class="col-span-2"/>
    <Sidebar class="hidden lg:block w-full"/>
    <Content class="h-full w-full col-span-2 lg:col-span-1 overflow-scroll">
      <slot />
    </Content>
    <SearchModal/>
    <MobileNav/>
  </div>
</template>
