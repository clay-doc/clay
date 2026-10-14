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
  // The package has no public files of its own; docs assets come from the
  // project (modules/clay.ts)
  dir: {public: "app/public"},
  // Code used by both the app and the server (deliberately not Nuxt's special "shared/" folder)
  alias: {"#common": fileURLToPath(new URL("./common", import.meta.url))},
  vite: {
    plugins: [tailwindcss()],
  },
  css: [fileURLToPath(new URL("./app/assets/tailwind.css", import.meta.url))],
  // Build files live in this package, where the server bundle can import its
  // dependencies; one folder per docs project. The output goes to the project.
  // Developing Clay itself (no CLAY_ROOT) uses Nuxt's .nuxt, which tsconfig.json reads.
  ...(process.env.CLAY_ROOT ? {
    buildDir: fileURLToPath(new URL(`./node_modules/.cache/clay/${createHash("sha256").update(root).digest("hex").slice(0, 12)}/nuxt`, import.meta.url)),
  } : {}),
  app: {
    baseURL,
    head: {
      htmlAttrs: {lang: config.lang || "en"},
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
})
