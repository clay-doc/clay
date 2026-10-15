import tailwindcss from "@tailwindcss/vite";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {loadConfig} from "./lib/site";

// The docs project to build: set by the clay CLI, the playground otherwise
const root = resolve(process.env.CLAY_ROOT || "playground");
const {config} = loadConfig(root);
const trimmedBase = (config.baseURL ?? "").replace(/^\/+|\/+$/g, "");
const baseURL = trimmedBase ? `/${trimmedBase}/` : "/";

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ["./modules/clay"],
  // Components are imported where they are used, not registered globally
  components: {dirs: []},
  // The package has no public files of its own; docs assets come from the
  // project (modules/clay.ts)
  dir: {public: "app/public"},
  // Code used by both the app and the server (deliberately not Nuxt's special "shared/" folder)
  alias: {"#common": fileURLToPath(new URL("./common", import.meta.url))},
  vite: {
    plugins: [tailwindcss()],
  },
  // KaTeX styles math (server/utils/components.ts); its fonts only load on pages with math
  css: [fileURLToPath(new URL("./app/assets/tailwind.css", import.meta.url)), "katex/dist/katex.min.css"],
  // Build files live in this package, where the server bundle can import its
  // dependencies; one folder per docs project. The output goes to the project.
  // Developing Clay itself (no CLAY_ROOT) uses Nuxt's .nuxt, which tsconfig.json reads.
  ...(process.env.CLAY_ROOT ? {
    buildDir: fileURLToPath(new URL(`./node_modules/.cache/clay/${createHash("sha256").update(root).digest("hex").slice(0, 12)}/nuxt`, import.meta.url)),
  } : {}),
  app: {
    baseURL,
    head: {
      // The default language; pages in other languages set theirs (app/layouts/default.vue)
      htmlAttrs: {lang: config.languages?.[0] || config.lang || "en"},
      // Apply a stored theme choice before the first paint (see use-theme.ts)
      script: [{innerHTML: "try{var t=localStorage.getItem('clay-theme');if(t==='clay-light'||t==='clay-dark')document.documentElement.dataset.theme=t}catch(e){}"}],
    },
  },
  runtimeConfig: {
    clayRoot: root,
    public: {
      baseUrl: baseURL,
    },
  },
  // Only builds write into the output folder: the dev server cleans its output
  // folder on start, which would delete the last build
  $production: {
    nitro: {
      output: {
        dir: process.env.CLAY_OUT ? resolve(process.env.CLAY_OUT) : join(root, "publish"),
      },
    },
  },
  nitro: {
    prerender: {
      // A page that fails to render fails the build
      failOnError: true,
    },
  },
  // The CLI and the tests run in Node, outside the app and the server: type-check them too
  typescript: {
    nodeTsConfig: {
      include: ["../lib/**/*", "../test/**/*", "../e2e/**/*", "../*.config.ts"],
    },
  },
})
