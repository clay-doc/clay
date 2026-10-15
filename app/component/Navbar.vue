<script setup lang="ts">

import {type LinkPart} from "#common/nav";
import type {Configuration} from "#common/configuration";
import linkConcat from "#common/link-concat";
import {useSearchOpen} from "~/composables/use-search";
import {useTheme} from "~/composables/use-theme";

const config = inject('config') as Ref<Configuration>;
const linkParts = inject("delimitedLinkParts") as Ref<LinkPart[]>;
const baseUrl = inject('baseUrl') as Ref<string>;
const t = useMessages();
const {versions, languages, edition, versionLink, languageLink, home} = useEditionLinks();

// Dropdowns (<details>) close after following one of their links, on a click
// elsewhere, on Escape, when another dropdown opens and after navigating
const navbar = ref<HTMLElement | null>(null);
const route = useRoute();

function closeMenus(except?: Element | null) {
  navbar.value?.querySelectorAll("details[open]").forEach(menu => {
    if (menu !== except) menu.removeAttribute("open");
  });
}

function closeMenu(event: MouseEvent) {
  (event.target as HTMLElement).closest("details")?.removeAttribute("open");
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Element;
  closeMenus(navbar.value?.contains(target) ? target.closest("details") : null);
}

watch(() => route.path, () => closeMenus());


// On keyboard shortcut cmd+k or ctrl+k toggle the search, "/" opens it
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let superKey = useState<string>("superKey", () => "");

// The source link and the other links of clay.yaml, side by side as icons
const links = computed(() => [config.value.navbar?.source, ...(config.value.navbar?.links ?? [])].filter(link => link?.link));

const searchOpen = useSearchOpen();
const navOpen = useState<boolean>("navOpen", () => false);
const {toggle: toggleTheme} = useTheme();

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

onMounted(() => {
  keydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchOpen.value = !searchOpen.value;
    } else if (e.key === "/" && !searchOpen.value && !isTyping(e.target)) {
      e.preventDefault();
      searchOpen.value = true;
    } else if (e.key === "Escape") {
      closeMenus();
    }
  };

  window.addEventListener("keydown", keydownHandler);
  document.addEventListener("pointerdown", onPointerDown);

  superKey.value = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";
});

onUnmounted(() => {
  if (keydownHandler) {
    window.removeEventListener("keydown", keydownHandler);
  }
  document.removeEventListener("pointerdown", onPointerDown);
});

</script>


<template>
  <div ref="navbar" class="navbar bg-base-200 pr-4">
    <div class="navbar-start">
      <button id="nav-toggle" class="btn btn-ghost btn-square lg:hidden" :aria-label="t.openNav"
              aria-controls="mobile-nav" :aria-expanded="navOpen" @click="navOpen = true">
        <i class="fa-solid fa-bars"></i>
      </button>
      <NuxtLink :to="home" class="btn btn-ghost text-xl h-10">
        <!-- height: logos stay small while the stylesheet is still loading -->
        <img v-if="config.navbar?.logo" :src="linkConcat(baseUrl, config.navbar.logo)" alt="logo" height="32" class="max-h-8 pl-2"/>
        <span class="pr-2">{{config.title}}</span>
      </NuxtLink>
      <div class="breadcrumbs text-md hidden lg:block">
        <ul>
          <li />
          <li v-for="p in linkParts">
            <NuxtLink v-if="p.link" :to="p.link" class="no-underline">
              <i v-if="p.icon" :class="p.icon + ' text-xs'"/>
              <span class="hover:underline!">{{p.title}}</span>
            </NuxtLink>
            <span v-else class="cursor-default no-underline">{{p.title}}</span>
          </li>
        </ul>
      </div>
    </div>

    <div class="navbar-end">
      <!-- Every item shows what it does in a tooltip; dropdowns hide theirs while open (tailwind.css) -->
      <ul class="menu menu-horizontal flex-nowrap items-center px-1">
        <!-- On narrow screens the switchers and links are in the navigation drawer (MobileNav.vue) -->
        <li v-if="versions.length > 1" class="hidden lg:block tooltip tooltip-bottom" :data-tip="t.docsVersion">
          <details>
            <summary :aria-label="t.docsVersion"><i class="fa-solid fa-code-branch text-xs"></i>{{edition.version.label}}</summary>
            <ul class="bg-base-100 p-2 end-0 sm:end-auto z-10">
              <li v-for="v in versions" :key="v.name">
                <NuxtLink :to="versionLink(v)" :class="{'menu-active': v.name === edition.version.name}"
                          @click="closeMenu">{{v.label}}</NuxtLink>
              </li>
            </ul>
          </details>
        </li>
        <li v-if="languages.length > 1" class="hidden lg:block tooltip tooltip-bottom" :data-tip="t.language">
          <details>
            <summary :aria-label="t.language"><i class="fa-solid fa-language"></i>{{edition.language.label}}</summary>
            <ul class="bg-base-100 p-2 end-0 sm:end-auto z-10">
              <li v-for="l in languages" :key="l.code">
                <NuxtLink :to="languageLink(l)" :lang="l.code" :hreflang="l.code" :class="{'menu-active': l.code === edition.language.code}"
                          @click="closeMenu">{{l.label}}</NuxtLink>
              </li>
            </ul>
          </details>
        </li>
        <li v-for="l in links" :key="l!.link" class="hidden sm:block tooltip tooltip-bottom" :data-tip="l!.name">
          <NuxtLink :to="l!.link" target="_blank" :aria-label="l!.name">
            <span class="flex h-lh items-center">
              <i v-if="l!.icon" :class="l!.icon"></i>
              <template v-else>{{l!.name}}</template>
            </span>
          </NuxtLink>
        </li>
        <li class="tooltip tooltip-bottom navbar-tooltip-end" :data-tip="t.toggleTheme">
          <!-- Pages are rendered before the theme is known, so CSS picks and animates the icon (tailwind.css) -->
          <button :aria-label="t.toggleTheme" @click="toggleTheme">
            <!-- As tall as a line of text, so it matches the neighbouring menu items -->
            <span class="grid h-lh place-items-center">
              <i class="fa-solid fa-sun theme-to-light"></i>
              <i class="fa-solid fa-moon theme-to-dark"></i>
            </span>
          </button>
        </li>
        <li>
          <!-- The tooltip shows the shortcut as keys, so it is HTML and sits in the button -->
          <button :aria-label="t.search" @click="searchOpen = true" class="tooltip tooltip-bottom navbar-tooltip-end">
            <span class="flex h-lh items-center"><i class="fa-solid fa-magnifying-glass"></i></span>
            <span class="tooltip-content flex items-center gap-1 whitespace-nowrap">
              {{t.search}}<template v-if="superKey"><kbd class="kbd kbd-sm ml-1 bg-transparent border-current/40 text-inherit">{{superKey}}</kbd><kbd class="kbd kbd-sm bg-transparent border-current/40 text-inherit">K</kbd></template>
            </span>
          </button>
        </li>
      </ul>
    </div>
    <NuxtLoadingIndicator color="var(--color-primary)" :height="2" :throttle="0" />

  </div>
</template>

<style scoped>

</style>