<script setup lang="ts">
import Sidebar from "~/components/Sidebar.vue";
import type {Configuration} from "#common/configuration";

// Navigation drawer for screens too narrow for the sidebar
const open = useState<boolean>("navOpen", () => false);
const route = useRoute();
const panel = ref<HTMLElement | null>(null);
const t = useMessages();
const {versions, languages, edition, versionLink, languageLink} = useEditionLinks();
const config = inject('config') as Ref<Configuration>;
// The navbar's links, which it leaves out on phones
const links = computed(() => [config.value.navbar?.source, ...(config.value.navbar?.links ?? [])].filter(link => link?.link));

watch(() => route.path, () => open.value = false);
watch(open, async isOpen => {
  if (!isOpen) {
    document.getElementById("nav-toggle")?.focus();
    return;
  }
  await nextTick();
  panel.value?.querySelector<HTMLElement>("a, summary")?.focus();
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}
</script>

<template>
  <Transition enter-from-class="opacity-0" leave-to-class="opacity-0" enter-active-class="transition-opacity" leave-active-class="transition-opacity">
    <div v-if="open" class="fixed inset-0 z-40 lg:hidden" @keydown="onKeydown">
      <div class="absolute inset-0 bg-black/50" aria-hidden="true" @click="open = false"></div>
      <nav ref="panel" id="mobile-nav" :aria-label="t.documentation"
           class="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-base-200 shadow-xl flex flex-col">
        <div class="flex items-center justify-between p-2 pl-4">
          <span class="font-semibold">{{t.navigation}}</span>
          <button class="btn btn-ghost btn-square btn-sm" :aria-label="t.closeNav" @click="open = false">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div v-if="versions.length > 1 || languages.length > 1" class="flex flex-wrap gap-2 px-4 pb-2">
          <nav v-if="versions.length > 1" :aria-label="t.docsVersion" class="join">
            <NuxtLink v-for="v in versions" :key="v.name" :to="versionLink(v)" class="join-item btn btn-sm"
                      :class="{'btn-active': v.name === edition.version.name}">{{v.label}}</NuxtLink>
          </nav>
          <nav v-if="languages.length > 1" :aria-label="t.language" class="join">
            <NuxtLink v-for="l in languages" :key="l.code" :to="languageLink(l)" :lang="l.code" :hreflang="l.code" class="join-item btn btn-sm"
                      :class="{'btn-active': l.code === edition.language.code}">{{l.label}}</NuxtLink>
          </nav>
        </div>
        <div v-if="links.length" class="flex flex-wrap gap-2 px-4 pb-2 sm:hidden">
          <NuxtLink v-for="l in links" :key="l!.link" :to="l!.link" target="_blank" class="btn btn-sm">
            <i v-if="l!.icon" :class="l!.icon"></i>{{l!.name}}
          </NuxtLink>
        </div>
        <Sidebar class="w-full grow flex-nowrap"/>
      </nav>
    </div>
  </Transition>
</template>
