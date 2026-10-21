<script setup lang="ts">
import type {CellScheme} from "#common/openapi";
import {format, type Messages} from "#common/i18n";
import linkConcat from "#common/link-concat";
import {apiCredentials, type SchemeCredential} from "~/utils/api-credentials";
import {CALLBACK_PATH, signIn} from "~/utils/oauth";

// What the requests of an API need, entered once for all its request cells,
// like the "Authorize" dialog of Swagger UI: on the API's overview (::: credentials)
// with all its schemes, and in a dialog of each cell (RequestCell.vue) with those
// its operation takes. One tab per scheme, so only one form shows at a time.
const props = defineProps<{ api: string, schemes: Record<string, CellScheme>, t: Messages, baseUrl: string }>();
const t = computed(() => props.t);
const credentials = apiCredentials(props.api);
const entry = (name: string): SchemeCredential => credentials.schemes[name] ??= {};

const kind = (scheme: CellScheme) => {
  if (scheme.type === "apiKey") return format(scheme.in === "query" ? t.value.apiKeyQuery : scheme.in === "cookie" ? t.value.apiKeyCookie : t.value.apiKeyHeader, {name: scheme.name ?? ""});
  if (scheme.type === "http") return format(t.value.apiHttpAuth, {scheme: scheme.scheme ?? ""}) + (scheme.bearerFormat ? ` (${scheme.bearerFormat})` : "");
  if (scheme.type === "oauth2") return t.value.apiOAuth;
  if (scheme.type === "openIdConnect") return t.value.apiOpenId;
  return t.value.apiMutualTls;
};
const isBasic = (scheme: CellScheme) => scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic";
const isSet = (name: string) => {
  const scheme = props.schemes[name]!;
  const saved = credentials.schemes[name];
  if (scheme.type === "mutualTLS") return false;
  return !!(scheme.type === "apiKey" ? saved?.value : isBasic(scheme) ? saved?.user : saved?.token);
};

// Signing in with OAuth 2.0 or OpenID Connect
const flowsOf = (scheme: CellScheme) => scheme.type === "openIdConnect" ? ["authorizationCode"] : Object.keys(scheme.flows ?? {});
const flowOf = (name: string) => entry(name).flow ?? flowsOf(props.schemes[name]!)[0]!;
const scopesOf = (name: string) => {
  const scheme = props.schemes[name]!;
  const flow = scheme.flows?.[flowOf(name) as keyof NonNullable<CellScheme["flows"]>];
  return Object.entries(scheme.type === "openIdConnect" ? {openid: ""} : flow?.scopes ?? {});
};
const scopeChecked = (name: string, scope: string) => (entry(name).scopes ?? scopesOf(name).map(([s]) => s)).includes(scope);
function toggleScope(name: string, scope: string) {
  const current = entry(name).scopes ?? scopesOf(name).map(([s]) => s);
  entry(name).scopes = current.includes(scope) ? current.filter(s => s !== scope) : [...current, scope];
}
const redirectUri = computed(() => import.meta.client ? location.origin + linkConcat(props.baseUrl, CALLBACK_PATH) : "");
const signingIn = ref<string | undefined>();
const signInError = ref<Record<string, string>>({});
async function startSignIn(name: string) {
  const saved = entry(name);
  signingIn.value = name;
  delete signInError.value[name];
  try {
    saved.token = await signIn({
      scheme: props.schemes[name]!, flow: flowOf(name), clientId: saved.clientId ?? "", clientSecret: saved.clientSecret,
      scopes: saved.scopes ?? scopesOf(name).map(([s]) => s), user: saved.user, password: saved.password, redirectUri: redirectUri.value,
    });
  } catch (error) {
    signInError.value[name] = (error as Error).message;
  } finally {
    signingIn.value = undefined;
  }
}

function clear() {
  for (const name of Object.keys(credentials.schemes)) delete credentials.schemes[name];
}

const id = `clay-credentials-${++forms}`;
const names = computed(() => Object.keys(props.schemes));
// The first scheme with credentials, else the first
const active = ref(names.value.find(isSet) ?? names.value[0]);

// The line under the picked tab slides to the next one, like in the tabs of the
// docs (app/utils/tabs.ts). It is placed once the tabs have a size: in a closed
// dialog they have none, until it opens.
const tablist = ref<HTMLElement | null>(null);
const line = reactive({left: 0, width: 0, animate: false});
function placeLine(animate: boolean) {
  const tab = tablist.value?.querySelector<HTMLElement>("[role=tab][aria-selected=true]");
  if (!tab || !tab.offsetWidth) return;
  const padding = parseFloat(getComputedStyle(tab).paddingLeft) || 0;
  line.animate = animate;
  line.left = tab.offsetLeft + padding;
  line.width = tab.offsetWidth - 2 * padding;
}
let sized: ResizeObserver | null = null;
onMounted(() => {
  placeLine(false);
  sized = new ResizeObserver(() => placeLine(false));
  if (tablist.value) sized.observe(tablist.value);
});
onBeforeUnmount(() => sized?.disconnect());
watch(active, () => nextTick(() => placeLine(true)));
function tabKey(event: KeyboardEvent) {
  const i = names.value.indexOf(active.value!);
  const next = {ArrowRight: i + 1, ArrowLeft: i - 1 + names.value.length, Home: 0, End: names.value.length - 1}[event.key];
  if (next === undefined) return;
  event.preventDefault();
  active.value = names.value[next % names.value.length];
  nextTick(() => document.getElementById(`${id}-tab-${active.value}`)?.focus());
}
</script>

<script lang="ts">
let forms = 0;
</script>

<template>
  <div class="clay-auth">
    <!-- Like the tabs of the docs (::: tabs), without their data-tabs: a pick here
         is not carried to the page's other tabs, nor remembered -->
    <div v-if="names.length > 1" class="clay-tabs">
      <div ref="tablist" role="tablist" class="tabs tabs-border not-prose" @keydown="tabKey">
        <button v-for="name in names" :id="`${id}-tab-${name}`" :key="name" type="button" role="tab" class="tab gap-1.5 font-mono"
                :class="{'tab-active': active === name}" :aria-selected="active === name" :aria-controls="`${id}-panel-${name}`"
                :tabindex="active === name ? 0 : -1" @click="active = name">
          {{name}}<i v-if="isSet(name)" class="fa-solid fa-circle-check text-success text-xs"></i>
        </button>
        <span v-if="line.width" class="clay-tab-indicator" aria-hidden="true"
              :style="{left: `${line.left}px`, width: `${line.width}px`, ...(line.animate ? {} : {transition: 'none'})}"></span>
      </div>
    </div>
    <section v-for="(scheme, name) in schemes" v-show="active === name" :id="`${id}-panel-${name}`" :key="name"
             class="clay-auth-scheme" :class="{'clay-auth-tabbed': names.length > 1}"
             :role="names.length > 1 ? 'tabpanel' : undefined" :aria-labelledby="names.length > 1 ? `${id}-tab-${name}` : undefined">
      <header class="clay-auth-head">
        <span class="clay-auth-name">{{name}}</span>
        <span class="clay-auth-kind">{{kind(scheme)}}</span>
        <i v-if="isSet(name)" class="fa-solid fa-circle-check text-success ms-auto" :title="t.requestCredentials"></i>
      </header>
      <p v-if="scheme.description" class="clay-auth-text">{{scheme.description}}</p>

      <div v-if="scheme.type !== 'mutualTLS'" class="clay-auth-fields">
        <template v-if="scheme.type === 'apiKey'">
          <label :for="`${id}-${name}-value`"><code>{{scheme.name}}</code></label>
          <input :id="`${id}-${name}-value`" v-model="entry(name).value" type="password" autocomplete="off" class="input input-sm">
          <p v-if="scheme.in === 'cookie'" class="clay-auth-text clay-auth-wide">{{t.requestCookieNote}}</p>
        </template>
        <template v-else-if="isBasic(scheme)">
          <label :for="`${id}-${name}-user`">{{t.requestUser}}</label>
          <input :id="`${id}-${name}-user`" v-model="entry(name).user" autocomplete="off" class="input input-sm">
          <label :for="`${id}-${name}-password`">{{t.requestPassword}}</label>
          <input :id="`${id}-${name}-password`" v-model="entry(name).password" type="password" autocomplete="off" class="input input-sm">
        </template>
        <template v-else>
          <template v-if="scheme.type !== 'http'">
            <template v-if="flowsOf(scheme).length > 1">
              <label :for="`${id}-${name}-flow`">OAuth</label>
              <select :id="`${id}-${name}-flow`" :value="flowOf(name)" class="select select-sm"
                      @change="entry(name).flow = ($event.target as HTMLSelectElement).value">
                <option v-for="flow in flowsOf(scheme)" :key="flow" :value="flow">{{flow}}</option>
              </select>
            </template>
            <label :for="`${id}-${name}-client`">{{t.requestClientId}}</label>
            <input :id="`${id}-${name}-client`" v-model="entry(name).clientId" autocomplete="off" class="input input-sm">
            <!-- The implicit flow has no secret: it signs in from the browser alone -->
            <template v-if="flowOf(name) !== 'implicit'">
              <label :for="`${id}-${name}-secret`">{{t.requestClientSecret}}</label>
              <input :id="`${id}-${name}-secret`" v-model="entry(name).clientSecret" type="password" autocomplete="off" class="input input-sm">
            </template>
            <template v-if="flowOf(name) === 'password'">
              <label :for="`${id}-${name}-user`">{{t.requestUser}}</label>
              <input :id="`${id}-${name}-user`" v-model="entry(name).user" autocomplete="off" class="input input-sm">
              <label :for="`${id}-${name}-password`">{{t.requestPassword}}</label>
              <input :id="`${id}-${name}-password`" v-model="entry(name).password" type="password" autocomplete="off" class="input input-sm">
            </template>
            <template v-if="scopesOf(name).length">
              <span>{{t.apiScopes.replace(/[:：]$/, "")}}</span>
              <div class="clay-auth-scopes">
                <label v-for="[scope, about] in scopesOf(name)" :key="scope" :title="about">
                  <input type="checkbox" class="checkbox checkbox-xs" :checked="scopeChecked(name, scope)" @change="toggleScope(name, scope)">
                  <code>{{scope}}</code>
                </label>
              </div>
            </template>
            <span></span>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="btn btn-sm btn-primary btn-soft" :disabled="signingIn === name" @click="startSignIn(name)">
                <span v-if="signingIn === name" class="loading loading-spinner loading-xs"></span>{{t.requestSignIn}}
              </button>
              <small v-if="signInError[name]" class="text-error">{{signInError[name]}}</small>
            </div>
            <p v-if="['authorizationCode', 'implicit'].includes(flowOf(name))" class="clay-auth-text clay-auth-wide">
              {{format(t.requestRedirect, {url: ""})}}<code class="break-all">{{redirectUri}}</code>
            </p>
          </template>
          <label :for="`${id}-${name}-token`">{{t.requestToken}}</label>
          <div class="flex max-w-md items-center gap-2">
            <input :id="`${id}-${name}-token`" v-model="entry(name).token" type="password" autocomplete="off" class="input input-sm flex-1" :placeholder="scheme.bearerFormat">
            <button v-if="scheme.type !== 'http' && entry(name).token" type="button" class="btn btn-ghost btn-sm" @click="entry(name).token = ''">{{t.requestSignOut}}</button>
          </div>
        </template>
      </div>
      <p v-else class="clay-auth-text">{{t.requestTlsNote}}</p>
    </section>

    <footer class="clay-auth-foot">
      <label class="flex items-center gap-2"><input v-model="credentials.remember" type="checkbox" class="checkbox checkbox-xs">{{t.requestRemember}}</label>
      <button type="button" class="btn btn-ghost btn-xs" @click="clear">{{t.requestClear}}</button>
    </footer>
  </div>
</template>
