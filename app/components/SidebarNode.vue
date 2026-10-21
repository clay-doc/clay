<script setup lang="ts">
import {normalizePath} from "#common/route-path";
import {format} from "#common/i18n";

const props = defineProps(["title", "link", "icon", "children", "method", "deprecated", "collapsed"])
const route = useRoute()
const t = useMessages()
const path = computed(() => normalizePath(route.path))
const isActive = computed(() => path.value === props.link)

// A folder's title opens its page; only the arrow shows or hides its entries.
// Folders start open, unless they hold many entries, like an API's schemas,
// and open when a page inside them is shown. Entries of a folder that was
// never open are not drawn at all.
const inside = (current: string) => current.startsWith(props.link + "/")
const open = ref(!props.collapsed || inside(path.value))
const drawn = ref(open.value)
watch(path, current => {
  if (inside(current)) open.value = true
})
watch(open, value => {
  if (value) drawn.value = true
})
</script>

<template>
<li v-if="!props.children">
  <!-- The link says itself which page is current: the router's own idea differs from
       the server's for addresses with a trailing slash, and Vue keeps the server's
       aria-current after hydrating, so the entry would stay highlighted -->
  <NuxtLink v-slot="{href, navigate}" :to="props.link" custom>
    <!-- Long titles end in "…", and show in full as a tooltip -->
    <a :href="href ?? undefined" class="sidebar-link" :class="isActive ? 'menu-active' : ''" :aria-current="isActive ? 'page' : undefined"
       :title="props.title" @click="navigate">
      <!-- API operations show their method instead of an icon -->
      <span v-if="props.method" class="clay-method" :class="'clay-method-' + props.method.toLowerCase()">{{props.method}}</span>
      <i v-else-if="props.icon" :class="props.icon + ' text-xs'"/>
      <span class="min-w-0 truncate" :class="{'line-through opacity-70': props.deprecated}">{{props.title}}</span>
    </a>
  </NuxtLink>
</li>
<li v-else class="relative grid grid-cols-[minmax(0,1fr)] content-start transition-[grid-template-rows] duration-150 ease-out motion-reduce:transition-none"
    :class="open ? 'grid-rows-[auto_1fr]' : 'grid-rows-[auto_0fr]'">
  <NuxtLink v-slot="{href, navigate}" :to="props.link" custom>
    <a :href="href ?? undefined" :class="isActive ? 'menu-active' : ''" class="sidebar-link pr-9" :aria-current="isActive ? 'page' : undefined"
       :title="props.title" @click="navigate">
      <i v-if="props.icon" :class="props.icon"/>
      <span class="min-w-0 truncate">{{props.title}}</span>
    </a>
  </NuxtLink>
  <button type="button" class="btn btn-ghost btn-xs btn-square absolute right-1 top-1.5"
          :aria-expanded="open" :aria-label="format(t.toggleFolder, {title: props.title})" @click="open = !open">
    <i class="fa-solid fa-chevron-right text-xs transition-transform duration-150 motion-reduce:transition-none" :class="open ? 'rotate-90' : ''"/>
  </button>
  <!-- Grid rows from 0fr to 1fr animate the height of the entries; invisible keeps closed ones out of reach -->
  <ul class="min-h-0 overflow-hidden transition-[visibility] duration-150 motion-reduce:transition-none" :class="open ? '' : 'invisible'">
    <template v-if="drawn">
      <SidebarNode v-for="e in props.children" :title="e.title" :icon="e.icon" :link="e.displayLink" :children="e.children"
                   :method="e.method" :deprecated="e.deprecated" :collapsed="e.collapsed"/>
    </template>
  </ul>
</li>
</template>
