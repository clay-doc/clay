<script setup lang="ts">
import {format} from "#common/i18n";
import {showsPageAction, type Configuration} from "#common/configuration";
import type {Edition} from "#common/editions";
import {markdownRoute, normalizePath} from "#common/route-path";
import linkConcat from "#common/link-concat";
import {ASSISTANT_ICONS} from "~/utils/assistant-icons";
import {track} from "~/utils/analytics";

// The page for language models: copy or open its Markdown, or ask an assistant
// about it (server/middleware/agent-docs.ts). Shown below the contents of the
// page; agents find llms.txt in the page's head and in robots.txt. Each entry
// can be hidden with "pageActions" in clay.yaml.
const props = defineProps<{ route: string }>();

const t = useMessages();
const baseUrl = inject("baseUrl") as Ref<string>;
const edition = inject("edition") as Ref<Edition>;
const config = inject("config") as Ref<Configuration | undefined>;

const markdown = computed(() => {
  const route = normalizePath(props.route);
  return linkConcat(baseUrl.value, markdownRoute(route, route === (edition.value.prefix || "/")));
});

// Assistants need the full address; it is known once the page runs in the browser
const origin = ref("");
onMounted(() => origin.value = window.location.origin);
const question = computed(() => format(t.value.aiPrompt, {url: origin.value + markdown.value}));
const assistants = computed(() => [
  {name: "chatgpt" as const, event: "Open in ChatGPT", label: t.value.openInChatGPT, href: `https://chatgpt.com/?hints=search&q=${encodeURIComponent(question.value)}`},
  {name: "claude" as const, event: "Open in Claude", label: t.value.openInClaude, href: `https://claude.ai/new?q=${encodeURIComponent(question.value)}`},
].filter(assistant => showsPageAction(config.value, assistant.name)));

const copied = ref(false);
let reset: ReturnType<typeof setTimeout> | undefined;
async function copy() {
  const text = await (await fetch(markdown.value)).text();
  await navigator.clipboard.writeText(text);
  track("Copy as Markdown", {page: props.route});
  copied.value = true;
  clearTimeout(reset);
  reset = setTimeout(() => copied.value = false, 2000);
}

</script>

<template>
  <ul class="page-actions" :aria-label="t.pageActions">
    <li v-if="showsPageAction(config, 'copyMarkdown')">
      <button type="button" :title="t.copyMarkdownHint" @click="copy">
        <i :class="copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'" aria-hidden="true"></i>
        <span aria-live="polite">{{copied ? t.copiedMarkdown : t.copyMarkdown}}</span>
      </button>
    </li>
    <li v-if="showsPageAction(config, 'openMarkdown')">
      <a :href="markdown" :title="t.openMarkdownHint" target="_blank" rel="noopener" @click="track('Open as Markdown', {page: route})">
        <i class="fa-brands fa-markdown" aria-hidden="true"></i><span>{{t.openMarkdown}}</span>
      </a>
    </li>
    <li v-for="assistant in assistants" :key="assistant.name">
      <a :href="assistant.href" :title="t.askAboutPage" target="_blank" rel="noopener noreferrer" @click="track(assistant.event, {page: route})">
        <svg :class="['assistant-icon', `assistant-icon-${assistant.name}`]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="ASSISTANT_ICONS[assistant.name]"/></svg>
        <span>{{assistant.label}}</span>
      </a>
    </li>
  </ul>
</template>
