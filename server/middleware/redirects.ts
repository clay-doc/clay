import {normalizePath} from "../../common/route-path";
import {resolveOrigin} from "../../common/seo";
import {useClaySite} from "../utils/use-clay-site";
import {redirectPage} from "../utils/redirects";

// Old addresses of pages ("redirects" in their front matter) lead to the page.
// The build writes them as files (modules/clay.ts).
export default defineEventHandler(event => {
    const basePath = useRuntimeConfig().app.baseURL;
    let path = decodeURIComponent(getRequestURL(event).pathname);
    if (basePath !== "/" && path.startsWith(basePath)) path = "/" + path.slice(basePath.length);
    // Files, Clay's own files and Nuxt's are never old addresses of pages
    if (path.startsWith("/_") || path.startsWith("/docs/") || /\.[a-z\d]+$/i.test(path)) return;

    const site = useClaySite();
    const route = normalizePath(path);
    const redirect = site.redirects.find(r => r.from === route);
    if (!redirect) return;
    setHeader(event, "content-type", "text/html; charset=utf-8");
    return redirectPage(redirect, basePath, resolveOrigin(site.config.siteURL, basePath).origin);
});
