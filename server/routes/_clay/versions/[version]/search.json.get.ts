import {buildSearchIndex} from "../../../../utils/search-index";
import {useClaySite} from "../../../../utils/site";

// The search index of an older version, so results stay within the version shown
export default defineEventHandler(event => {
    const name = getRouterParam(event, "version");
    const site = useClaySite();
    if (!name || !site.versions.some(version => version.name === name)) {
        throw createError({statusCode: 404, statusMessage: "Unknown Version"});
    }
    setHeader(event, "content-type", "application/json");
    return JSON.stringify(buildSearchIndex(site.pages.filter(page => page.version === name)));
});
