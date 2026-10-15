import {buildSearchIndex} from "../../utils/search-index";
import {useClaySite} from "../../utils/use-clay-site";

// The search index of another version or language, e.g. /_clay/1.x/de/search.json,
// so results stay within the docs shown
export default defineEventHandler(event => {
    const path = getRouterParam(event, "path") ?? "";
    const prefix = "/" + path.replace(/\/?search\.json$/, "");
    const site = useClaySite();
    if (!path.endsWith("search.json") || !site.editions.some(edition => edition.prefix === prefix)) {
        throw createError({statusCode: 404, statusMessage: "Not Found"});
    }
    setHeader(event, "content-type", "application/json");
    return JSON.stringify(buildSearchIndex(site.pages.filter(page => page.prefix === prefix)));
});
