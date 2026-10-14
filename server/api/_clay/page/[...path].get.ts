import {normalizePath} from "../../../../common/route-path";
import {renderDoc} from "../../../utils/render-doc";
import {useClaySite} from "../../../utils/site";
import {messagesFor} from "../../../../common/i18n";

// A rendered doc. During the build every page is pre-rendered, and its data is
// stored in the page's payload, so the deployed site never calls this.
export default defineEventHandler(async event => {
    const route = normalizePath("/" + (getRouterParam(event, "path") ?? ""));
    const site = useClaySite();
    const page = site.pages.find(p => p.route === route && !p.isDir);
    if (!page || page.markdown === undefined) {
        throw createError({statusCode: 404, statusMessage: "Document Not Found"});
    }

    const baseURL = useRuntimeConfig().app.baseURL;
    // Files are in docs/<version>/..., the same for every language
    const assetPath = (page.version ? `/${page.version}` : "") + page.route.slice(page.prefix.length);
    const config = site.configs[page.language];
    const messages = messagesFor(page.language, config?.messages?.[page.language]);
    return await renderDoc(page.markdown, page.route, baseURL, config?.index?.description, assetPath, messages);
});
