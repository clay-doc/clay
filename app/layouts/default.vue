<script setup lang="ts">
import Navbar from "~/components/Navbar.vue";
import Sidebar from "~/components/Sidebar.vue";
import Content from "~/components/Content.vue";
import SearchModal from "~/components/SearchModal.vue";
import MobileNav from "~/components/MobileNav.vue";

import {hasFontawesomeKit} from "#common/configuration";
import {delimitLinkParts, getCurrentDocItemFromRoute, getLinkPartsFromCurrentRoute} from "#common/nav";
import linkConcat from "#common/link-concat";
import {editionOf, editionPrefix, samePage, stripPrefix, switchEdition} from "#common/editions";
import {format, languageName, messagesFor} from "#common/i18n";
import {themeCss} from "#common/theme";
import {fontFaces} from "#clay-site";

// Config and navigation (see app/composables/use-site.ts)
const site = await useSite();
const versions = computed(() => site.value.versions);
const languages = computed(() => site.value.languages);
const defaultLanguage = computed(() => languages.value[0]!.code);
const route = useRoute();
// The version and language of the page shown, e.g. "/1.x/de"; each has its own navigation
const edition = computed(() => editionOf(route.path, versions.value, languages.value));
const version = computed(() => edition.value.version);
const configuration = computed(() => site.value.configs[edition.value.language.code] ?? site.value.config);
const structure = computed(() => site.value.navs[edition.value.prefix] ?? site.value.nav);
const messages = computed(() => messagesFor(edition.value.language.code, configuration.value.messages?.[edition.value.language.code]));
const siteConfig = site.value.config;

// Read during setup: the head below is resolved later, where Nuxt composables are unavailable
const baseUrl = ref(useRuntimeConfig().app.baseURL);

const FONTAWESOME_FREE_CSS = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
const FONTAWESOME_FREE_SRI = "sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg==";

// Icons load in the head, so they render with the page: the free Font Awesome
// icons as a stylesheet, or a kit's script, which adds its web font stylesheets.
// (Kits have no stylesheet of their own; kits set to SVG replace the icons in
// the page, which Vue does not expect, so web font kits work best.)
const kit = hasFontawesomeKit(siteConfig);
useHead(() => ({
  htmlAttrs: {lang: edition.value.language.code},
  link: [
    ...(siteConfig.favicon ? [{rel: 'icon' as const, href: linkConcat(baseUrl.value, siteConfig.favicon)}] : []),
    ...(kit
      ? [{rel: 'preconnect' as const, href: 'https://ka-f.fontawesome.com', crossorigin: 'anonymous' as const}]
      : [{rel: 'stylesheet' as const, href: FONTAWESOME_FREE_CSS, integrity: FONTAWESOME_FREE_SRI, crossorigin: 'anonymous' as const}]),
  ],
  script: kit ? [{src: `https://kit.fontawesome.com/${siteConfig.fontawesomeKit}.js`, crossorigin: 'anonymous' as const, async: true}] : [],
}));

// The site's own colors, corners and fonts from "theme" in clay.yaml; fonts from
// Google Fonts are published with the site (lib/fonts.ts)
const theme = fontFaces + themeCss(siteConfig.theme);
if (theme) useHead({style: [{key: "clay-theme", innerHTML: theme}]});

// Tags of the site's own from "head" in clay.yaml, in the language of the page.
// Their attributes are whatever the site needs, so they are not typed per tag.
useHead(() => {
  const {script = [], link = [], meta = []} = configuration.value.head ?? {};
  return {
    script: script.map(({code, ...attributes}) => ({...attributes, ...(code === undefined ? {} : {innerHTML: String(code)})})) as never[],
    link: link as never[],
    meta: meta as never[],
  };
});

const pathInEdition = computed(() => stripPrefix(route.path, edition.value.prefix));
const linkParts = computed(() => getLinkPartsFromCurrentRoute(pathInEdition.value, structure.value));
const currentItem = computed(() => getCurrentDocItemFromRoute(pathInEdition.value, structure.value));

// The navigation, breadcrumb parts and page or folder of any path. Pages use it
// for their own route: the router moves on as soon as a navigation starts, while
// the old page stays on screen until the next one has loaded.
function resolvePath(path: string) {
  const {prefix} = editionOf(path, versions.value, languages.value);
  const nav = site.value.navs[prefix] ?? site.value.nav;
  const inEdition = stripPrefix(path, prefix);
  return {prefix, structure: nav, linkParts: getLinkPartsFromCurrentRoute(inEdition, nav), currentItem: getCurrentDocItemFromRoute(inEdition, nav)};
}
const delimitedLinkParts = computed(() => delimitLinkParts(linkParts.value, 3))

// The prefix of the same version in another language, and of the latest version in this language
const prefixFor = (versionName: string, language: string) => editionPrefix(versionName, language, defaultLanguage.value);
const latest = computed(() => versions.value[0]!);
const latestLink = computed(() => switchEdition(route.path, edition.value.prefix, prefixFor("", edition.value.language.code), site.value.navs));

// Translations of the page for search engines (hreflang); untranslated pages
// point them to their original instead
const alternates = computed(() => {
  if (languages.value.length < 2) return [];
  const isStart = pathInEdition.value === "/";
  return languages.value.flatMap(language => {
    const prefix = prefixFor(version.value.name, language.code);
    if (isStart) return [{language: language.code, route: prefix || "/"}];
    const item = samePage(route.path, edition.value.prefix, prefix, site.value.navs);
    return item && !item.untranslated ? [{language: language.code, route: item.displayLink}] : [];
  });
});
const canonicalRoute = computed(() => currentItem.value?.untranslated
    ? switchEdition(route.path, edition.value.prefix, prefixFor(version.value.name, defaultLanguage.value), site.value.navs)
    : undefined);
const untranslatedNote = computed(() => format(messages.value.untranslated, {
  language: languageName(defaultLanguage.value, edition.value.language.code),
}));

function skipToContent() {
  document.getElementById("content")?.focus();
}

provide('baseUrl', baseUrl);
provide('config', configuration);
provide('structure', structure);
provide('linkParts', linkParts)
provide('currentDocItem', currentItem)
provide('resolvePath', resolvePath)
provide('delimitedLinkParts', delimitedLinkParts)
provide('edition', edition)
provide('versions', versions)
provide('languages', languages)
provide('navs', computed(() => site.value.navs))
provide('messages', messages)
provide('alternates', alternates)
provide('canonicalRoute', canonicalRoute)
provide('untranslatedNote', untranslatedNote)
</script>

<template>
  <div class="grid grid-rows-[4.5rem_1fr] grid-cols-[20rem_1fr] row-end-auto w-screen h-screen">
    <!-- The first stop for the keyboard: past the navbar and sidebar to the page. It
         waits above the window rather than in "sr-only", which Font Awesome's
         stylesheet defines too, out of reach of Tailwind's "focus:not-sr-only" -->
    <a href="#content" class="btn btn-sm btn-primary absolute top-4 left-4 z-50 -translate-y-24 focus:translate-y-0"
       @click.prevent="skipToContent">{{messages.skipToContent}}</a>
    <Navbar class="col-span-2"/>
    <Sidebar class="hidden lg:block w-full"/>
    <Content class="h-full w-full col-span-2 lg:col-span-1 overflow-hidden">
      <div v-if="version.name" role="status" class="alert alert-warning alert-soft rounded-none sm:rounded-tl-2xl">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <span>
          {{format(messages.olderVersion, {version: version.label})}}
          <NuxtLink :to="latestLink" class="link font-semibold">{{format(messages.latestVersion, {version: latest.label})}}</NuxtLink>
        </span>
      </div>
      <slot />
    </Content>
    <SearchModal/>
    <MobileNav/>
  </div>
</template>
