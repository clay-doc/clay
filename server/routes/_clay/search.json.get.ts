import {buildSearchIndex} from "../../utils/search-index";
import {useClaySite} from "../../utils/use-clay-site";

// The full-text search index of the current docs in the default language, built
// once at build time and loaded by the browser on first search; other versions
// and languages have their own ([...path].get.ts)
export default defineEventHandler(event => {
    setHeader(event, "content-type", "application/json");
    return JSON.stringify(buildSearchIndex(useClaySite().pages.filter(page => !page.prefix)));
});
