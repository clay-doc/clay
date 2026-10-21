<script setup lang="ts">
import type {Configuration} from "#common/configuration";
import linkConcat from "#common/link-concat";

// Below every page: the columns of links and the line of text of "footer" in
// clay.yaml, in the language of the page. Without it, pages have no footer.
// The text goes below the site's logo and title, in a column before the links,
// and below it "Made with ♥ and Clay", unless "madeWithClay" is false.
const config = inject("config") as Ref<Configuration>;
const baseUrl = inject("baseUrl") as Ref<string>;
const {home} = useEditionLinks();
const t = useMessages();
const CLAY_REPO = "https://github.com/clay-doc/clay";
const footer = computed(() => config.value.footer);
const columns = computed(() => (footer.value?.columns ?? []).filter(column => column?.links?.length));
const madeWithClay = computed(() => footer.value?.madeWithClay !== false);
// The message with its places for the heart and the link, e.g. ["Made with ", "{heart}", " and ", "{clay}"]
const credit = computed(() => t.value.madeWithClay.split(/(\{heart\}|\{clay\})/).filter(Boolean));
// Links to other sites open in a new tab; others are pages of the site
const external = (link: string) => /^[a-z][a-z\d+.-]*:/i.test(link) || link.startsWith("//");
</script>

<template>
  <footer v-if="columns.length || footer?.text || footer?.madeWithClay" class="clay-footer">
    <div class="clay-footer-brand">
      <NuxtLink :to="home" class="clay-footer-home">
        <img v-if="config.navbar?.logo" :src="linkConcat(baseUrl, config.navbar.logo)" alt="" height="32" class="max-h-8"/>
        <span>{{config.title}}</span>
      </NuxtLink>
      <p v-if="footer?.text" class="clay-footer-text">{{footer.text}}</p>
      <p v-if="madeWithClay" class="clay-footer-credit">
        <template v-for="part in credit">
          <i v-if="part === '{heart}'" class="fa-solid fa-heart" role="img" :aria-label="t.love"></i>
          <a v-else-if="part === '{clay}'" :href="CLAY_REPO" target="_blank" rel="noopener noreferrer">Clay</a>
          <template v-else>{{part}}</template>
        </template>
      </p>
    </div>
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
  </footer>
</template>
