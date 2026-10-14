<script setup lang="ts">
import {normalizePath} from "#common/route-path";
import {format} from "#common/i18n";

const props = defineProps(["title", "link", "icon", "children"])
const route = useRoute()
const t = useMessages()
const path = computed(() => normalizePath(route.path))
const isActive = computed(() => path.value === props.link)

// A folder's title opens its page; only the arrow shows or hides its entries.
// Folders start open, and open when a page inside them is shown.
const open = ref(true)
watch(path, current => {
  if (current.startsWith(props.link + "/")) open.value = true
})
</script>

<template>
<li v-if="!props.children">
  <NuxtLink :to="props.link" :class="isActive ? 'menu-active' : ''">
    <i v-if="props.icon" :class="props.icon + ' text-xs'"/>
    {{props.title}}
  </NuxtLink>
</li>
<li v-else class="relative">
  <NuxtLink :to="props.link" :class="isActive ? 'menu-active' : ''" class="pr-9">
    <i v-if="props.icon" :class="props.icon"/>
    {{props.title}}
  </NuxtLink>
  <button type="button" class="btn btn-ghost btn-xs btn-square absolute right-1 top-1"
          :aria-expanded="open" :aria-label="format(t.toggleFolder, {title: props.title})" @click="open = !open">
    <i class="fa-solid text-xs" :class="open ? 'fa-chevron-down' : 'fa-chevron-right'"/>
  </button>
  <ul v-if="open">
    <SidebarNode v-for="e in props.children" :title="e.title" :icon="e.icon" :link="e.displayLink" :children="e.children"/>
  </ul>
</li>
</template>
