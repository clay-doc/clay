<script setup lang="ts">

const props = defineProps(["title", "link", "icon", "children"])
const route = useRoute()
const isActive = computed(() => route.path === props.link)
</script>

<template>
<li v-if="!props.children">
  <NuxtLink :to="props.link" :class="isActive ? 'menu-active' : ''">
    <i v-if="props.icon" :class="props.icon + ' text-xs'"/>
    {{props.title}}
  </NuxtLink>
</li>
<li v-else>
  <details open>
    <summary>
      <i v-if="props.icon" :class="props.icon"/>
      {{props.title}}
    </summary>
    <ul>
      <SidebarNode v-for="e in props.children" :title="e.title" :icon="e.icon" :link="e.displayLink" :children="e.children"/>
    </ul>
  </details>
</li>
</template>

<style scoped>

</style>