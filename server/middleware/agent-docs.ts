import {resolveOrigin} from "../../common/seo";
import {useClaySite} from "../utils/site";
import {llmsFullTxt, llmsTxt, pageMarkdown, pageOfMarkdown, urlMaker} from "../utils/agent-docs";

// The docs for language models and agents (server/utils/agent-docs.ts): a page's
// Markdown at its path with ".md", and llms.txt and llms-full.txt for each
// version and language. The build writes them as files (modules/clay.ts).
export default defineEventHandler(event => {
    const basePath = useRuntimeConfig().app.baseURL;
    let path = decodeURIComponent(getRequestURL(event).pathname);
    if (basePath !== "/" && path.startsWith(basePath)) path = "/" + path.slice(basePath.length);
    // Files next to the docs and Clay's own files are served as they are
    if (path.startsWith("/docs/") || path.startsWith("/_")) return;

    const llms = /^(.*)\/llms(-full)?\.txt$/.exec(path);
    if (!llms && !path.endsWith(".md")) return;

    const site = useClaySite();
    const url = urlMaker(resolveOrigin(site.config.siteURL, basePath).origin, basePath);
    if (llms) {
        const edition = site.editions.find(e => e.prefix === llms[1]);
        if (!edition) return;
        setHeader(event, "content-type", "text/plain; charset=utf-8");
        return llms[2] ? llmsFullTxt(site, edition, url) : llmsTxt(site, edition, url);
    }
    const page = pageOfMarkdown(site, path);
    if (!page) return;
    setHeader(event, "content-type", "text/markdown; charset=utf-8");
    // An agent that found one page finds all the others from here
    return `${pageMarkdown(page, site, url)}\n---\n\nAll pages of these docs, as Markdown for language models: ${url(`${page.prefix}/llms.txt`)}\n`;
});
