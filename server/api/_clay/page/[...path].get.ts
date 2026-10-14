import {docPath, normalizePath} from "../../../../common/route-path";
import {renderDoc} from "../../../utils/render-doc";
import {useClaySite} from "../../../utils/site";
import {messagesFor} from "../../../../common/i18n";

// A rendered doc: a page, or a folder's index.md. During the build every page
// is pre-rendered, and its data is stored in the page's payload, so the
// deployed site never calls this. The start page is requested as "/_start".
export default defineEventHandler(async event => {
    const param = getRouterParam(event, "path") ?? "";
    const route = normalizePath("/" + param.replace(/(^|\/)_start$/, ""));
    const site = useClaySite();
    const page = site.pages.find(p => p.route === route && p.markdown !== undefined);
    if (!page || page.markdown === undefined) {
        throw createError({statusCode: 404, statusMessage: "Document Not Found"});
    }

    const baseURL = useRuntimeConfig().app.baseURL;
    const path = docPath(page.route, page.isDir);
    // Files are in docs/<version>/..., the same for every language
    const assetPath = (page.version ? `/${page.version}` : "") + path.slice(page.prefix.length);
    const config = site.configs[page.language];
    const messages = messagesFor(page.language, config?.messages?.[page.language]);
    // Pages without a description of their own fall back to the start page's
    const start = site.pages.find(p => p.route === (page.prefix || "/") && p.isDir);
    const result = await renderDoc(page.markdown, path, baseURL, start?.frontMatter.description, assetPath, messages);
    // index.md can ask for a large header (hero) and for cards of the folder's pages
    const hero = page.frontMatter.hero ? {title: page.title, icon: page.frontMatter.icon, description: page.frontMatter.description} : null;
    return {...result, hero, cards: page.frontMatter.cards ?? false};
});
