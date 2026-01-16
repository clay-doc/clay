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
    baseURL: process.env.BASE_URL || '/abc',
  }
})
