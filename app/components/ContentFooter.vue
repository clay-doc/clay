<script setup lang="ts">
import type {Configuration} from "#common/configuration";

// Below every page: the columns of links and the line of text of "footer" in
// clay.yaml, in the language of the page. Without it, pages have no footer.
const config = inject("config") as Ref<Configuration>;
const footer = computed(() => config.value.footer);
const columns = computed(() => (footer.value?.columns ?? []).filter(column => column?.links?.length));
// Links to other sites open in a new tab; others are pages of the site
const external = (link: string) => /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//");
</script>

<template>
  <footer v-if="columns.length || footer?.text" class="clay-footer">
    <div v-if="columns.length" class="clay-footer-columns">
      <nav v-for="column in columns" :key="column.title" :aria-label="column.title">
        <h2 class="footer-title">{{column.title}}</h2>
        <ul>
          <li v-for="link in column.links" :key="link.link">
            <a v-if="external(link.link)" :href="link.link" target="_blank" rel="noopener noreferrer" class="link link-hover">
              <i v-if="link.icon" :class="link.icon" aria-hidden="true"></i>{{link.name}}
            </a>
            <NuxtLink v-else :to="link.link" class="link link-hover">
              <i v-if="link.icon" :class="link.icon" aria-hidden="true"></i>{{link.name}}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </div>
    <p v-if="footer?.text" class="clay-footer-text">{{footer.text}}</p>
  </footer>
</template>
