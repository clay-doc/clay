<script setup lang="ts">
import type {TocEntry} from "#common/toc";

const props = defineProps<{ entries: TocEntry[], scrollContainer: HTMLElement | null }>();
const route = useRoute();
const router = useRouter();
const active = ref<string | undefined>();
const t = useMessages();

// The last heading scrolled past the top of the content pane is the current one
function updateActive() {
  const pane = props.scrollContainer;
  if (!pane) return;
  const top = pane.getBoundingClientRect().top + 80;
  let current = props.entries[0]?.id;
  for (const entry of props.entries) {
    const heading = document.getElementById(entry.id);
    if (heading && heading.getBoundingClientRect().top <= top) current = entry.id;
  }
  active.value = current;
}

watch(() => props.scrollContainer, (pane, previous) => {
  previous?.removeEventListener("scroll", updateActive);
  pane?.addEventListener("scroll", updateActive, {passive: true});
  updateActive();
}, {immediate: true});
watch(() => props.entries, () => nextTick(updateActive));
onBeforeUnmount(() => props.scrollContainer?.removeEventListener("scroll", updateActive));

function go(id: string) {
  router.push({query: route.query, hash: "#" + id});
}
</script>

<template>
  <nav :aria-label="t.onThisPage" class="text-sm">
    <p class="font-semibold mb-2">{{t.onThisPage}}</p>
    <ul class="border-l border-base-300">
      <li v-for="entry in entries" :key="entry.id">
        <a :href="'#' + entry.id" @click.prevent="go(entry.id)"
           :aria-current="entry.id === active ? 'location' : undefined"
           :class="[entry.level === 3 ? 'pl-6' : 'pl-3', entry.id === active ? 'border-primary text-primary' : 'border-transparent opacity-70 hover:opacity-100']"
           class="block py-1 -ml-px border-l-2">
          {{entry.text}}
        </a>
      </li>
    </ul>
  </nav>
</template>
