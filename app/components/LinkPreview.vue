<script setup lang="ts">
import {editionOf, type LanguageInfo, type VersionInfo} from "#common/editions";
import {normalizePath} from "#common/route-path";
import {getSearchIndex} from "~/utils/search-index";
import {linkPreview, type LinkPreview} from "~/utils/link-preview";

// A popup for the links to other pages in a page's text, like Wikipedia's:
// shown after a moment over a link, or when the keyboard reaches it, with
// where the page is, its title and the start of its text (link-preview.ts).
// Fingers follow links straight away. here: the route of the page shown.
const props = defineProps<{ root: HTMLElement | null, here: string }>();

const baseUrl = inject('baseUrl') as Ref<string>;
const versions = inject('versions') as Ref<VersionInfo[]>;
const languages = inject('languages') as Ref<LanguageInfo[]>;

const POPUP_ID = "clay-link-preview";
const OPEN_DELAY = 500;
const CLOSE_DELAY = 300;
const GAP = 8;

const preview = ref<LinkPreview | null>(null);
const popup = ref<HTMLElement | null>(null);
// Kept after the popup goes, so it fades out where it was
const position = ref({left: 0, top: 0, above: false});
let shown: HTMLAnchorElement | null = null; // the link the popup is for
let pending: HTMLAnchorElement | null = null; // the link it is about to be for
let timer: ReturnType<typeof setTimeout> | undefined;

// Doc links to another page; cards show what the page is about themselves
function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  const link = (target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-route]:not(.clay-card)");
  const route = link?.dataset.route;
  if (!link || !route || route.startsWith("#")) return null;
  return normalizePath(route.replace(/[?#].*$/, "")) === normalizePath(props.here) ? null : link;
}

function enter(link: HTMLAnchorElement) {
  clearTimeout(timer);
  if (link === shown) return;
  pending = link;
  timer = setTimeout(() => void show(link), OPEN_DELAY);
}

function leave() {
  clearTimeout(timer);
  pending = null;
  timer = setTimeout(hide, CLOSE_DELAY);
}

// Over the popup it stays, so its text can be read and selected
function stay() {
  clearTimeout(timer);
}

async function show(link: HTMLAnchorElement) {
  const route = link.dataset.route!;
  const found = await getSearchIndex(baseUrl.value, editionOf(route, versions.value, languages.value).prefix)
      .then(index => linkPreview(index, route), () => undefined);
  if (pending !== link || !found) return;
  hide();
  shown = link;
  link.setAttribute("aria-describedby", POPUP_ID);
  preview.value = found;
  await nextTick();
  place();
}

function hide() {
  clearTimeout(timer);
  shown?.removeAttribute("aria-describedby");
  shown = null;
  preview.value = null;
}

// Below the link, or above it where the window has no room below; kept inside the window
function place() {
  if (!shown || !popup.value) return;
  const rect = shown.getBoundingClientRect();
  const {offsetWidth: width, offsetHeight: height} = popup.value;
  const below = rect.bottom + GAP + height <= window.innerHeight;
  position.value = {
    left: Math.max(GAP, Math.min(rect.left, window.innerWidth - width - GAP)),
    top: below ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - height),
    above: !below,
  };
}

function onPointerOver(event: PointerEvent) {
  const link = event.pointerType === "mouse" ? linkOf(event.target) : null;
  if (link) enter(link);
}

function onPointerOut(event: PointerEvent) {
  const link = linkOf(event.target);
  // Moving onto the link's own text, e.g. its code, is still over it
  if (link && !link.contains(event.relatedTarget as Node | null)) leave();
}

function onFocusIn(event: FocusEvent) {
  const link = linkOf(event.target);
  if (link?.matches(":focus-visible")) enter(link);
}

function onFocusOut(event: FocusEvent) {
  if (linkOf(event.target)) leave();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && preview.value) hide();
}

// The popup stays where it was put, so it goes when the page scrolls under it
function onScroll(event: Event) {
  if (preview.value && !popup.value?.contains(event.target as Node)) hide();
}

const events = [["pointerover", onPointerOver], ["pointerout", onPointerOut], ["focusin", onFocusIn], ["focusout", onFocusOut], ["click", hide]] as const;
watch(() => props.root, (root, _, onCleanup) => {
  if (!root) return;
  for (const [name, handler] of events) root.addEventListener(name, handler as EventListener);
  onCleanup(() => {
    for (const [name, handler] of events) root.removeEventListener(name, handler as EventListener);
  });
}, {immediate: true});
watch(() => props.here, hide);

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("scroll", onScroll, true);
});
onBeforeUnmount(() => {
  hide();
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("scroll", onScroll, true);
});
</script>

<template>
  <ClientOnly>
    <Teleport to="body">
      <!-- Placed before the browser paints (place), so it fades in where it belongs -->
      <Transition name="clay-link-preview">
        <div v-if="preview" :id="POPUP_ID" ref="popup" role="tooltip" class="clay-link-preview" :class="{above: position.above}"
             :style="{left: `${position.left}px`, top: `${position.top}px`}"
             @pointerenter="stay" @pointerleave="leave">
          <p v-if="preview.path" class="clay-link-preview-path">{{preview.path}}</p>
          <p class="clay-link-preview-title">{{preview.title}}</p>
          <p class="clay-link-preview-text">{{preview.text}}</p>
        </div>
      </Transition>
    </Teleport>
  </ClientOnly>
</template>
