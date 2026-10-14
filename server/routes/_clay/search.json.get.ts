import {buildSearchIndex} from "../../utils/search-index";
import {useClaySite} from "../../utils/site";

// The full-text search index, built once at build time and loaded by the
// browser on first search
export default defineEventHandler(event => {
    setHeader(event, "content-type", "application/json");
    return JSON.stringify(buildSearchIndex(useClaySite().pages));
});
