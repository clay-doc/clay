<script setup lang="ts">
import {buildRequest, chosenSecurity, curlCommand, fetchCode, pythonCode, rawCell, startingInputs, type CellData} from "#common/openapi";
import {format, type Messages} from "#common/i18n";
import linkConcat from "#common/link-concat";
import {apiCredentials} from "~/utils/api-credentials";
import {languageOf, type Language as CodeLanguage} from "~/utils/shiki";
import HighlightedCode from "~/components/HighlightedCode.vue";
import ApiCredentials from "~/components/ApiCredentials.vue";
import CodeInput from "~/components/CodeInput.vue";
// A request to fill in and run, like a notebook cell (::: request). The page
// renders it without JavaScript first (server/utils/components.ts); Markdown.vue
// mounts this over it. Rendered outside the app, so it gets what it needs as props.
const props = defineProps<{ cell: CellData, t: Messages, baseUrl: string, here: string, navigate: (route: string) => void }>();
const t = computed(() => props.t);

const inputs = reactive(startingInputs(props.cell));
const rawText = ref(props.cell.raw ?? "");
const isRaw = props.cell.raw !== undefined;
// Raw cells are edited as text, and read again before each run
const cell = computed<CellData>(() => isRaw ? rawCell(rawText.value) ?? props.cell : props.cell);
const files = reactive<Record<string, File | undefined>>({});
const credentials = props.cell.api ? apiCredentials(props.cell.api) : undefined;

const content = computed(() => cell.value.body?.contents.find(c => c.type === inputs.contentType) ?? cell.value.body?.contents[0]);
// Each media type keeps its own body, starting with its own example
const bodies = reactive<Record<string, string>>(content.value && inputs.body !== undefined ? {[content.value.type]: inputs.body} : {});
const body = computed({
  get: () => content.value ? bodies[content.value.type] ?? content.value.example : "",
  set: text => {
    if (content.value) bodies[content.value.type] = text;
  },
});
// A request written out sends its own body, as edited
const sentInputs = computed(() => ({...inputs, body: isRaw ? undefined : body.value}));
const server = computed(() => cell.value.servers.find(s => s.url === inputs.server) ?? cell.value.servers[0]);

// Credentials: entered for the whole API, in a dialog like Swagger UI's "Authorize"
const secret = (scheme: string, part: string) => credentials?.schemes[scheme]?.[part as "value"];
const chosen = computed(() => chosenSecurity(cell.value, credentials?.schemes ?? {}));
const needsNone = computed(() => !cell.value.security.length || cell.value.security.some(r => !Object.keys(r).length));
const hasCredentials = computed(() => !!chosen.value && Object.keys(chosen.value).length > 0 && Object.keys(chosen.value).every(name => {
  const scheme = cell.value.schemes[name];
  return scheme?.type === "mutualTLS" || !!(secret(name, "value") || secret(name, "token") || secret(name, "user"));
}));
const securityLabel = computed(() => hasCredentials.value
    ? Object.keys(chosen.value!).join(" + ")
    : needsNone.value ? t.value.apiNoAuth : cell.value.security.map(r => Object.keys(r).join(" + ")).join(" / "));
const dialog = ref<HTMLDialogElement | null>(null);
// The schemes this operation takes; the API's overview has all of them
const usedSchemes = computed(() => Object.fromEntries(cell.value.security.flatMap(r => Object.keys(r))
    .filter(name => cell.value.schemes[name]).map(name => [name, cell.value.schemes[name]!])));

// Code samples show placeholders where secrets go
type Language = "curl" | "fetch" | "python";
const language = ref<Language | undefined>();
const LANGUAGES: [Language, string][] = [["curl", "curl"], ["fetch", "JavaScript"], ["python", "Python"]];
const CODE_LANGUAGES: Record<Language, CodeLanguage> = {curl: "shellscript", fetch: "javascript", python: "python"};
const code = computed(() => {
  const request = buildRequest(cell.value, sentInputs.value, credentials?.schemes ?? {});
  return language.value === "fetch" ? fetchCode(request) : language.value === "python" ? pythonCode(request) : curlCommand(request);
});

type Result = {
  status: number, statusText: string, ms: number, size: number, headers: [string, string][],
  type: string, text?: string, url?: string, image?: boolean,
} | { error: string };
const result = ref<Result | undefined>();
const running = ref(false);
const showHeaders = ref(false);
const missing = ref<string[]>([]);
let objectUrl: string | undefined;
onBeforeUnmount(() => objectUrl && URL.revokeObjectURL(objectUrl));

async function run() {
  if (running.value) return;
  const request = buildRequest(cell.value, sentInputs.value, credentials?.schemes ?? {}, secret);
  missing.value = request.missing.filter(name => !(content.value?.fields?.some(f => f.name === name && f.file) && files[name]));
  if (missing.value.length) return;
  // Browsers do not let pages send cookies of their own choosing
  const headers = request.headers.filter(([name]) => name.toLowerCase() !== "cookie");
  let sent: BodyInit | undefined;
  if (request.body?.fields) {
    const form = /^multipart\//i.test(request.body.type) ? new FormData() : new URLSearchParams();
    for (const field of content.value?.fields ?? []) {
      const file = field.file ? files[field.name] : undefined;
      if (file && form instanceof FormData) form.append(field.name, file);
      else if (inputs.fields?.[field.name]) form.append(field.name, inputs.fields[field.name]!);
    }
    sent = form;
  } else if (request.body?.file) sent = files.body;
  else if (request.body?.text !== undefined) sent = request.body.text;

  running.value = true;
  const started = performance.now();
  try {
    const response = await fetch(request.url, {method: request.method, headers, body: sent, credentials: "omit"});
    const blob = await response.blob();
    const type = response.headers.get("content-type") ?? blob.type;
    const out: Result = {
      status: response.status, statusText: response.statusText, ms: Math.round(performance.now() - started), size: blob.size,
      headers: [...response.headers.entries()], type,
    };
    if (/json|text|xml|javascript|yaml|html|csv/i.test(type) || !type) {
      const text = await blob.text();
      try {
        out.text = /json/i.test(type) ? JSON.stringify(JSON.parse(text), null, 2) : text;
      } catch {
        out.text = text;
      }
    } else {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = out.url = URL.createObjectURL(blob);
      out.image = /^image\//i.test(type);
    }
    result.value = out;
  } catch {
    result.value = {error: t.value.requestFailed};
  } finally {
    running.value = false;
  }
}

// Like a notebook's cells, the cell last clicked or typed in is selected:
// ⌘/Ctrl + Enter runs it, wherever the focus is
const selected = computed(() => selectedCell.value === id);
const select = () => {
  selectedCell.value = id;
  runSelected = run;
};
onBeforeUnmount(() => {
  if (selected.value) {
    selectedCell.value = undefined;
    runSelected = undefined;
  }
});

const output = computed(() => {
  const r = result.value;
  return r && !("error" in r) && r.text !== undefined ? r.text : undefined;
});
const statusColor = (status: number) => status < 300 ? "badge-success" : status < 400 ? "badge-info" : status < 500 ? "badge-warning" : "badge-error";
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;

const id = `clay-request-${++cells}`;
const shortcut = computed(() => import.meta.client && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ ↵" : "Ctrl ↵");
</script>

<script lang="ts">
// Ids for the cells' fields: each cell is rendered on its own (Markdown.vue)
let cells = 0;
const selectedCell = ref<string | undefined>();
let runSelected: (() => void) | undefined;
if (import.meta.client) {
  document.addEventListener("keydown", event => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || !runSelected) return;
    // Fields elsewhere, like the search, keep the keys to themselves
    const target = event.target as HTMLElement;
    if (target.closest?.("input, textarea, select, [contenteditable]") && !target.closest(".clay-request-cell")) return;
    event.preventDefault();
    runSelected();
  });
}
</script>

<template>
  <div class="clay-request-cell" :class="{'clay-request-selected': selected}" @pointerdown="select" @focusin="select">
    <div class="clay-request-head">
      <span class="clay-method" :class="'clay-method-' + cell.method.toLowerCase()">{{cell.method}}</span>
      <code class="clay-request-path">{{cell.path}}</code>
      <a v-if="cell.title && cell.link && cell.link !== here" class="clay-request-title link link-hover" :href="linkConcat(baseUrl, cell.link)"
         @click.prevent="navigate(cell.link)">{{cell.title}}</a>
      <span v-else-if="cell.title" class="clay-request-title">{{cell.title}}</span>
    </div>

    <div v-if="isRaw" class="clay-request-editor">
      <CodeInput v-model="rawText" language="http" :label="t.requestBody"/>
    </div>

    <div v-else-if="cell.servers.length > 1 || server?.variables || cell.parameters.length || cell.body || Object.keys(usedSchemes).length" class="clay-request-fields">
      <template v-if="cell.servers.length > 1 || server?.variables">
        <label class="clay-request-label" :for="`${id}-server`"><span class="clay-request-name">{{t.requestServer}}</span></label>
        <div class="clay-request-value">
          <select v-if="cell.servers.length > 1" :id="`${id}-server`" v-model="inputs.server" class="select select-sm">
            <option v-for="s in cell.servers" :key="s.url" :value="s.url">{{s.description ? `${s.description} · ${s.url}` : s.url}}</option>
          </select>
          <code v-else :id="`${id}-server`" class="clay-request-hint">{{server?.url}}</code>
          <div v-for="(variable, name) in server?.variables ?? {}" :key="name" class="clay-request-variable">
            <label :for="`${id}-server-${name}`"><code>{{name}}</code></label>
            <select v-if="variable.options" :id="`${id}-server-${name}`" v-model="inputs.serverValues[name]" class="select select-sm">
              <option v-for="option in variable.options" :key="option" :value="option" :selected="option === variable.default">{{option}}</option>
            </select>
            <input v-else :id="`${id}-server-${name}`" v-model="inputs.serverValues[name]" class="input input-sm" :placeholder="variable.default">
          </div>
        </div>
      </template>

      <template v-for="parameter in cell.parameters" :key="parameter.in + parameter.name">
        <label class="clay-request-label" :for="`${id}-${parameter.in}-${parameter.name}`">
          <span class="clay-request-name clay-request-param" :class="{'line-through': parameter.deprecated}">{{parameter.name}}<span v-if="parameter.required" class="text-error" aria-hidden="true"> *</span></span>
          <span class="clay-request-meta">{{parameter.in}} · {{parameter.type}}</span>
        </label>
        <div class="clay-request-value">
          <select v-if="parameter.options && !parameter.array" :id="`${id}-${parameter.in}-${parameter.name}`" v-model="inputs.values[parameter.name]"
                  class="select select-sm" :required="parameter.required">
            <option v-if="!parameter.required" value=""></option>
            <option v-for="option in parameter.options" :key="option" :value="option">{{option}}</option>
          </select>
          <input v-else :id="`${id}-${parameter.in}-${parameter.name}`" v-model="inputs.values[parameter.name]" class="input input-sm"
                 :placeholder="parameter.options ? parameter.options.join(',') : parameter.example" :required="parameter.required"
                 :aria-invalid="missing.includes(parameter.name) || undefined">
          <span v-if="parameter.description" class="clay-request-hint">{{parameter.description}}</span>
          <span v-if="parameter.in === 'cookie'" class="clay-request-hint">{{t.requestCookieNote}}</span>
        </div>
      </template>

      <template v-if="cell.body">
        <label class="clay-request-label" :for="`${id}-body`">
          <span class="clay-request-name">{{t.requestBody}}<span v-if="cell.body.required" class="text-error" aria-hidden="true"> *</span></span>
          <span v-if="cell.body.contents.length === 1" class="clay-request-meta">{{content?.type}}</span>
        </label>
        <div class="clay-request-value">
          <select v-if="cell.body.contents.length > 1" v-model="inputs.contentType" class="select select-sm" :aria-label="t.apiType">
            <option v-for="c in cell.body.contents" :key="c.type" :value="c.type">{{c.type}}</option>
          </select>
          <div v-if="content?.fields" class="clay-request-form">
            <template v-for="field in content.fields" :key="field.name">
              <label :for="`${id}-field-${field.name}`"><code>{{field.name}}</code><span v-if="field.required" class="text-error" aria-hidden="true"> *</span></label>
              <input v-if="field.file" :id="`${id}-field-${field.name}`" type="file" class="file-input file-input-sm"
                     @change="files[field.name] = ($event.target as HTMLInputElement).files?.[0]">
              <input v-else :id="`${id}-field-${field.name}`" v-model="inputs.fields![field.name]" class="input input-sm" :aria-invalid="missing.includes(field.name) || undefined">
            </template>
          </div>
          <input v-else-if="content?.file" :id="`${id}-body`" type="file" class="file-input file-input-sm"
                 @change="files.body = ($event.target as HTMLInputElement).files?.[0]">
          <CodeInput v-else :id="`${id}-body`" v-model="body" :language="languageOf(content?.type ?? '')"/>
        </div>
      </template>

      <template v-if="credentials && Object.keys(usedSchemes).length">
        <span class="clay-request-label"><span class="clay-request-name">{{t.requestCredentials}}</span></span>
        <div class="clay-request-value clay-request-security">
          <span class="clay-request-status-line">
            <i class="fa-solid" :class="hasCredentials || needsNone ? 'fa-lock text-success' : 'fa-lock-open opacity-60'"></i>
            <span>{{securityLabel}}</span>
          </span>
          <button type="button" class="btn btn-sm" @click="dialog?.showModal()"><i class="fa-solid fa-key"></i>{{t.requestAuthorize}}</button>
        </div>
      </template>
    </div>

    <div class="clay-request-actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="running" @click="run">
        <span v-if="running" class="loading loading-spinner loading-xs"></span>
        <i v-else class="fa-solid fa-play"></i>
        {{running ? t.requestSending : t.requestRun}}
      </button>
      <!-- ⌘/Ctrl + Enter runs the cell last clicked or typed in: its hint stands out -->
      <kbd class="kbd kbd-sm max-sm:hidden" :class="{'opacity-40': !selected}">{{shortcut}}</kbd>
      <span v-if="missing.length" class="text-error text-xs" role="alert">{{format(t.requestMissing, {names: missing.join(", ")})}}</span>
      <div class="ms-auto join" role="group" :aria-label="t.requestCode">
        <button v-for="[key, label] in LANGUAGES" :key="key" type="button" class="btn btn-xs join-item" :class="{'btn-active': language === key}"
                :aria-pressed="language === key" @click="language = language === key ? undefined : key">{{label}}</button>
      </div>
    </div>

    <div v-if="language" class="code-block clay-request-code-block">
      <pre class="clay-request-code"><HighlightedCode :text="code" :language="CODE_LANGUAGES[language]"/></pre>
      <button type="button" class="copy-code btn btn-sm btn-square btn-ghost" :title="t.copyCode" :aria-label="t.copyCode"><i class="fa-regular fa-copy"></i></button>
    </div>

    <div v-if="result" class="clay-request-out" aria-live="polite">
      <template v-if="'error' in result">
        <div class="clay-request-status text-error"><i class="fa-solid fa-triangle-exclamation"></i> {{result.error}}</div>
      </template>
      <template v-else>
        <div class="clay-request-status">
          <span class="badge badge-sm badge-soft" :class="statusColor(result.status)">{{result.status}} {{result.statusText}}</span>
          <span>{{result.ms}} ms · {{size(result.size)}}</span>
          <button type="button" class="btn btn-ghost btn-xs" :aria-expanded="showHeaders" @click="showHeaders = !showHeaders">
            {{t.requestHeaders}} <i class="fa-solid fa-chevron-right text-xs transition-transform" :class="{'rotate-90': showHeaders}"></i>
          </button>
          <button type="button" class="btn btn-ghost btn-xs ms-auto" @click="result = undefined">{{t.requestClear}}</button>
        </div>
        <dl v-if="showHeaders" class="clay-request-headers">
          <template v-for="[name, value] in result.headers" :key="name"><dt>{{name}}</dt><dd>{{value}}</dd></template>
        </dl>
        <pre v-if="output !== undefined"><HighlightedCode :text="output" :language="languageOf((result as {type: string}).type)"/></pre>
        <img v-else-if="result.image" :src="result.url" alt="" class="clay-request-image">
        <a v-else-if="result.url" :href="result.url" download class="link">{{t.requestDownload}} ({{result.type}})</a>
      </template>
    </div>
    <div v-else-if="props.cell.example" class="clay-request-out clay-request-example">
      <div class="clay-request-status">{{t.requestExample}} · {{props.cell.example!.status}}</div>
      <pre><HighlightedCode :text="props.cell.example!.body" :language="languageOf(props.cell.example!.type)"/></pre>
    </div>

    <dialog v-if="credentials && Object.keys(usedSchemes).length" ref="dialog" class="modal" :aria-label="t.requestCredentials">
      <div class="modal-box clay-request-dialog">
        <div class="mb-4 flex items-center">
          <h3 class="text-lg font-semibold">{{t.requestCredentials}}</h3>
          <form method="dialog" class="ms-auto"><button class="btn btn-ghost btn-sm btn-square" :aria-label="t.searchClose"><i class="fa-solid fa-xmark"></i></button></form>
        </div>
        <ApiCredentials :api="props.cell.api!" :schemes="usedSchemes" :t="t" :base-url="baseUrl"/>
      </div>
      <form method="dialog" class="modal-backdrop"><button :aria-label="t.searchClose">{{t.searchClose}}</button></form>
    </dialog>
  </div>
</template>
