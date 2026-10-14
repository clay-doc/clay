<script setup lang="ts">

import {type LinkPart} from "#common/nav";
import type {Configuration} from "#common/configuration";
import linkConcat from "#common/link-concat";
import {useSearchOpen} from "~/composables/use-search";
import {useTheme} from "~/composables/use-theme";

const config = inject('config') as Ref<Configuration>;
const linkParts = inject("delimitedLinkParts") as Ref<LinkPart[]>;
const baseUrl = inject('baseUrl') as Ref<string>;


// On keyboard shortcut cmd+k or ctrl+k toggle the search, "/" opens it
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let superKey = useState<string>("superKey", () => "");

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
    }
  };

  window.addEventListener("keydown", keydownHandler);

  superKey.value = navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl";
});

onUnmounted(() => {
  if (keydownHandler) {
    window.removeEventListener("keydown", keydownHandler);
  }
});

</script>


<template>
  <div class="navbar bg-base-200 pr-4">
    <div class="navbar-start">
      <button id="nav-toggle" class="btn btn-ghost btn-square lg:hidden" aria-label="Open navigation"
              aria-controls="mobile-nav" :aria-expanded="navOpen" @click="navOpen = true">
        <i class="fa-solid fa-bars"></i>
      </button>
      <NuxtLink to="/" class="btn btn-ghost text-xl h-10">
        <img v-if="config.navbar?.logo" :src="linkConcat(baseUrl, config.navbar.logo)" alt="logo" class="max-h-8 pl-2"/>
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

    <div class="navbar-end gap-2">
      <ul class="menu menu-horizontal flex-nowrap px-1">
        <li v-if="config.navbar?.source?.link">
          <NuxtLink :to="config.navbar.source.link" target="_blank">
            <i :class="config.navbar.source.icon"></i>
            {{config.navbar.source.name}}
          </NuxtLink>
        </li>
        <li v-if="config.navbar?.links?.length">
          <details>
            <summary>More</summary>
            <ul class="bg-base-100 p-2 end-0 sm:end-auto z-10">
              <li v-for="l in config.navbar.links">
                <NuxtLink :to="l.link" target="_blank">
                  <i :class="l.icon + ' text-xs'"></i>
                  {{l.name}}
                </NuxtLink>
              </li>
            </ul>
          </details>
        </li>
        <li>
          <!-- Pages are rendered before the theme is known, so CSS picks the icon (tailwind.css) -->
          <button aria-label="Toggle light and dark theme" title="Toggle theme" @click="toggleTheme">
            <!-- As tall as a line of text, so it matches the neighbouring menu items -->
            <span class="flex h-lh items-center">
              <i class="fa-solid fa-sun theme-to-light"></i>
              <i class="fa-solid fa-moon theme-to-dark"></i>
            </span>
          </button>
        </li>
      </ul>
      <button class="btn btn-ghost btn-square sm:hidden" aria-label="Search" @click="searchOpen = true">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <button class="input h-10 hidden sm:flex cursor-pointer" @click="searchOpen = true">
        <i class="fa-solid fa-magnifying-glass"></i>
        <span class="grow text-left opacity-60">Search</span>
        <kbd class="kbd kbd-sm">{{superKey}} K</kbd>
      </button>
    </div>
    <NuxtLoadingIndicator color="var(--color-primary)" :height="2" :throttle="0" />

  </div>
</template>

<style scoped>

</style>