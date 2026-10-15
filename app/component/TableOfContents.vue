<script setup lang="ts">
import type {TocEntry} from "#common/toc";

const props = defineProps<{ entries: TocEntry[], scrollContainer: HTMLElement | null }>();
const route = useRoute();
const router = useRouter();
const t = useMessages();
// The entries whose sections show in the content pane
const visible = ref<string[]>([]);
const list = ref<HTMLElement | null>(null);
// The part of the rail next to those entries, in pixels from the top of the list
const rail = ref({top: 0, height: 0});

// A section runs from its heading to the next one, the last to the end of the page
function updateVisible() {
  const pane = props.scrollContainer;
  if (!pane) return;
  const {top, bottom} = pane.getBoundingClientRect();
  const headings = props.entries.map(entry => document.getElementById(entry.id));
  visible.value = props.entries.filter((_, i) => {
    const heading = headings[i];
    if (!heading) return false;
    const next = headings.slice(i + 1).find(Boolean);
    const end = next ? next.getBoundingClientRect().top : heading.parentElement!.getBoundingClientRect().bottom;
    return heading.getBoundingClientRect().top < bottom && end > top;
  }).map(entry => entry.id);
}

function measureRail() {
  const items = [...(list.value?.children ?? [])] as HTMLElement[];
  const shown = items.filter((_, i) => visible.value.includes(props.entries[i]?.id ?? ""));
  const first = shown[0], last = shown.at(-1);
  // Without a section on screen the rail keeps its place and fades out
  rail.value = first && last
    ? {top: first.offsetTop, height: last.offsetTop + last.offsetHeight - first.offsetTop}
    : {top: rail.value.top, height: 0};
}

let frame = 0;
function update() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    updateVisible();
    nextTick(measureRail);
  });
}

watch(() => props.scrollContainer, (pane, previous) => {
  previous?.removeEventListener("scroll", update);
  if (!pane) return;
  pane.addEventListener("scroll", update, {passive: true});
  update();
}, {immediate: true});
watch(() => props.entries, () => nextTick(update));
onMounted(() => window.addEventListener("resize", update));
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  props.scrollContainer?.removeEventListener("scroll", update);
  window.removeEventListener("resize", update);
});

function go(id: string) {
  router.push({query: route.query, hash: "#" + id});
}
</script>

<template>
  <nav :aria-label="t.onThisPage" class="text-sm">
    <p class="font-semibold mb-2">{{t.onThisPage}}</p>
    <div class="relative">
      <div class="absolute inset-y-0 left-0 w-px bg-base-300"></div>
      <div class="absolute left-[-0.5px] w-0.5 rounded-full bg-primary transition-[top,height,opacity] duration-300 ease-out motion-reduce:transition-none"
           :class="rail.height ? 'opacity-100' : 'opacity-0'"
           :style="{top: `${rail.top}px`, height: `${rail.height}px`}"></div>
      <ul ref="list">
        <li v-for="entry in entries" :key="entry.id">
          <a :href="'#' + entry.id" @click.prevent="go(entry.id)"
             :aria-current="entry.id === visible[0] ? 'location' : undefined"
             :class="[entry.level === 3 ? 'pl-6' : 'pl-3', visible.includes(entry.id) ? 'text-primary' : 'opacity-70 hover:opacity-100']"
             class="block py-1 transition-[color,opacity] duration-300 motion-reduce:transition-none">
            {{entry.text}}
          </a>
        </li>
      </ul>
    </div>
  </nav>
</template>
