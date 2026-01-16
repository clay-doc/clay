<script setup lang="ts">

import {type LinkPart} from "~/assets/structure-loader";
import type {Configuration} from "~/assets/configuration";
import NavbarLoader from "~/component/NavbarLoader.vue";

const config = inject('config') as Ref<Configuration>;
const linkParts = inject("delimitedLinkParts") as Ref<LinkPart[]>;
const structureReady = inject('structureReady') as Ref<boolean>;
const configReady = inject('configReady') as Ref<boolean>;

// On keyboard shortcut cmd+k or ctrl+k, focus the search input
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let superKey = useState<string>("superKey", () => "");

let searchRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  keydownHandler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (searchRef.value) {
        searchRef.value.focus();
      }
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
  <div class="navbar bg-base-200">
    <div class="navbar-start">
      <div v-if="!configReady" class="skeleton h-9 w-32" />
      <NuxtLink v-else to="/" class="btn btn-ghost text-xl h-10">
        <img :src="config.navbar.logo" alt="logo" class="max-h-8 pl-2"/>
        <span class="pr-2">{{config.title}}</span>
      </NuxtLink>
      <div class="breadcrumbs text-md hidden lg:block">
        <ul>
          <li />
          <NavbarLoader v-if="!structureReady" />
          <li v-else v-for="p in linkParts">
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
      <ul class="menu menu-horizontal flex-nowrap px-1 sm:px-4">
        <li v-if="!configReady" class="flex flex-col justify-center">
          <div class="skeleton h-4 w-32" />
        </li>
        <li v-else>
          <NuxtLink :to="config.navbar.source.link" target="_blank">
            <i :class="config.navbar.source.icon"></i>
            {{config.navbar.source.name}}
          </NuxtLink>
        </li>
        <li>
          <details>
            <summary>More</summary>
            <ul class="bg-base-100 p-2 end-0 sm:end-auto z-10">
              <div v-if="!configReady" class="skeleton h-4 w-32" />
              <li v-else v-for="l in config.navbar.links">
                <NuxtLink :to="l.link" target="_blank">
                  <i :class="l.icon + ' text-xs'"></i>
                  {{l.name}}
                </NuxtLink>
              </li>
            </ul>
          </details>
        </li>
      </ul>
      <label class="input h-10 hidden sm:flex">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input ref="searchRef" type="search" class="h-12" placeholder="Search" />
        <kbd class="kbd kbd-sm">{{superKey}} K</kbd>
      </label>
    </div>
    <NuxtLoadingIndicator color="var(--color-primary)" :height="2" :throttle="0" />

  </div>
</template>

<style scoped>

</style>