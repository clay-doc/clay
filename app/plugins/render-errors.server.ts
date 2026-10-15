// Nuxt reports a page that fails to prerender only as "[500] Server Error";
// this logs why, so "clay build" can show it
export default defineNuxtPlugin(nuxtApp => {
    if (!import.meta.prerender) return;
    nuxtApp.hook("vue:error", error => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[clay] Rendering ${nuxtApp.ssrContext?.url ?? "a page"} failed: ${message}`);
    });
});
