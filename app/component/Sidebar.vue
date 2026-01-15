<script setup lang="ts">
import SidebarNode from "~/component/SidebarNode.vue";
import type { DocItem } from "~/assets/structure-loader";
import SidebarLoader from "~/component/SidebarLoader.vue";

const structureIn = inject('structure') as Ref<DocItem>;
const structureReady = inject('structureReady') as Ref<boolean>;
const structure = computed(() => structureIn.value?.children as DocItem[])
</script>

<template>
  <SidebarLoader class="menu bg-base-200 overflow-auto" v-if="!structureReady" />
  <ul v-else class="menu bg-base-200 overflow-auto">
    <SidebarNode v-for="e in structure" :link="e.displayLink" :icon="e.icon" :title="e.title" :children="e.children"/>
    <!-- Separator for API section -->
    <div class="h-0.5 m-2 bg-base-100 rounded-4xl p-0" />

    <li><a>Item 1</a></li>
    <li>
      <details open>
        <summary>Parent</summary>
        <ul>
          <li><a>Submenu 1</a></li>
          <li><a>Submenu 2</a></li>
          <li>
            <details open>
              <summary>Parent</summary>
              <ul>
                <li><a>Submenu 1</a></li>
                <li><a>Submenu 2</a></li>
              </ul>
            </details>
          </li>
        </ul>
      </details>
    </li>
    <li><a>Item 3</a></li>
  </ul>
</template>