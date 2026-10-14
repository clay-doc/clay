import {resolveOrigin} from "../../common/seo";
import {useClaySite} from "../utils/site";

// Crawlers only read robots.txt at the domain root; under a base path it is
// informational, so submit the sitemap in the search engines' tools there.
export default defineEventHandler(event => {
    const basePath = useRuntimeConfig().app.baseURL;
    const {origin} = resolveOrigin(useClaySite().config.siteURL, basePath);

    setHeader(event, "content-type", "text/plain; charset=utf-8");
    let robots = "User-agent: *\nAllow: /\n";
    if (origin) robots += `\nSitemap: ${origin}${basePath.replace(/\/?$/, "/")}sitemap.xml\n`;
    return robots;
});
