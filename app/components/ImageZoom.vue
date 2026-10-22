<script setup lang="ts">
// Images of a page's text that are shown smaller than they are open in full
// over the page when clicked, or with Enter or Space: screenshots in a narrow
// column are often too small to read. Images in links and cards stay links.
// root: the page's text; html: its HTML, which replaces the images when it changes.
const props = defineProps<{ root: HTMLElement | null, html: string }>();

const t = useMessages();
const dialog = ref<HTMLDialogElement | null>(null);
const shown = ref<{ src: string, alt: string } | null>(null);

// A little smaller than they are is not worth opening
const ROOM = 1.2;
const ZOOMABLE = "clay-zoomable";

const candidates = (root: HTMLElement) => [...root.querySelectorAll<HTMLImageElement>("img")].filter(img => !img.closest("a, .clay-card"));

// The images shown smaller than they are can be opened: by pointer, and by
// keyboard as buttons named after what they show
function mark(img: HTMLImageElement) {
  const smaller = img.complete && img.naturalWidth > img.clientWidth * ROOM;
  if (smaller === img.classList.contains(ZOOMABLE)) return;
  img.classList.toggle(ZOOMABLE, smaller);
  if (smaller) {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-haspopup", "dialog");
    img.setAttribute("aria-label", img.alt ? `${t.value.enlargeImage}: ${img.alt}` : t.value.enlargeImage);
  } else {
    for (const name of ["tabindex", "role", "aria-haspopup", "aria-label"]) img.removeAttribute(name);
  }
}

const markAll = () => props.root && candidates(props.root).forEach(mark);

function open(img: HTMLImageElement) {
  shown.value = {src: img.currentSrc || img.src, alt: img.alt};
  dialog.value?.showModal();
}

const zoomable = (target: EventTarget | null) => {
  const img = target as HTMLImageElement | null;
  return img?.tagName === "IMG" && img.classList.contains(ZOOMABLE) ? img : null;
};

function onClick(event: MouseEvent) {
  const img = zoomable(event.target);
  if (img) open(img);
}

function onKeydown(event: KeyboardEvent) {
  const img = zoomable(event.target);
  if (!img || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  open(img);
}

// Images load after the page shows: each is looked at once it has its size
function onLoad(event: Event) {
  const img = event.target as HTMLImageElement;
  if (img.tagName === "IMG" && !img.closest("a, .clay-card")) mark(img);
}

const events = [["click", onClick], ["keydown", onKeydown], ["load", onLoad]] as const;
watch(() => props.root, (root, _, onCleanup) => {
  if (!root) return;
  // Load events do not bubble; they are caught on the way down
  for (const [name, handler] of events) root.addEventListener(name, handler as EventListener, name === "load");
  onCleanup(() => {
    for (const [name, handler] of events) root.removeEventListener(name, handler as EventListener, name === "load");
  });
}, {immediate: true});
watch(() => [props.root, props.html], () => nextTick(markAll), {immediate: true});
// The names of the images follow the interface's language
watch(t, () => props.root && candidates(props.root).forEach(img => {
  img.classList.remove(ZOOMABLE);
  mark(img);
}));

onMounted(() => window.addEventListener("resize", markAll));
onBeforeUnmount(() => window.removeEventListener("resize", markAll));
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <!-- A click anywhere closes it, like Escape; focus goes back to the image.
           The image stays while the dialog fades out. -->
      <dialog ref="dialog" class="clay-zoom" :aria-label="shown?.alt || t.enlargeImage" @click="dialog?.close()">
        <figure v-if="shown">
          <img :src="shown.src" :alt="shown.alt">
          <figcaption v-if="shown.alt" aria-hidden="true">{{shown.alt}}</figcaption>
        </figure>
        <button type="button" class="clay-zoom-close btn btn-circle btn-ghost" :aria-label="t.closeImage" :title="t.closeImage">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </dialog>
    </Teleport>
  </ClientOnly>
</template>
