import {config} from "#clay-site";
import {analyticsScripts} from "#common/analytics";

// Loads the analytics services of "analytics" in clay.yaml in built sites, unless
// the reader's browser asks not to be tracked (Global Privacy Control, Do Not Track)
export default defineNuxtPlugin(() => {
    if (import.meta.dev) return;
    const scripts = analyticsScripts(config.analytics, config.siteURL);
    const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (!scripts.length || browser.globalPrivacyControl || browser.doNotTrack === "1") return;

    const services = window as unknown as Record<string, unknown>;
    // Events sent before Plausible has loaded wait in its queue
    if (config.analytics?.plausible) services.plausible ??= function (...args: unknown[]) {
        const queue = services.plausible as { q?: unknown[] };
        (queue.q ??= []).push(args);
    };
    services.clayAnalyticsEvents = config.analytics?.events !== false;
    // "Was this page helpful?" (PageFeedback.vue)
    services.clayFeedback = config.analytics?.feedback !== false;
    for (const {src, attributes} of scripts) {
        const script = document.createElement("script");
        script.src = src;
        script.defer = true;
        for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
        document.head.append(script);
    }

    // Plausible and Umami count pages the app opens without reloading; GoatCounter is told
    const router = useRouter();
    router.afterEach((to, from) => {
        if (from.matched.length === 0 || to.path === from.path) return;
        nextTick(() => (services.goatcounter as { count?: (options: { path: string }) => void } | undefined)?.count?.({path: location.pathname}));
    });
});
