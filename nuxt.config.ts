import tailwindcss from "@tailwindcss/vite";
import * as process from "node:process";

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
  css: ["./app/assets/tailwind.css"],
  app: {
    baseURL: process.env.BASE_URL || '/',
    head: {
      // Apply a stored theme choice before the first paint (see use-theme.ts)
      script: [{innerHTML: "try{var t=localStorage.getItem('clay-theme');if(t==='clay-light'||t==='clay-dark')document.documentElement.dataset.theme=t}catch(e){}"}],
    },
  },
  runtimeConfig: {
    public: {
      baseUrl: process.env.BASE_URL || '/',
    },
  }
})
