import {buildSearchIndex} from "../../utils/search-index";
import {useClaySite} from "../../utils/use-clay-site";
import {bundledDocument} from "../../../lib/openapi";

// The page OAuth providers send readers back to when they sign in from a
// request cell: it hands its address to the page that opened it (app/utils/oauth.ts)
const OAUTH_CALLBACK = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Signing in…</title></head>
<body><p>Signing in…</p><script>
const message = {type: "clay-oauth", url: location.href};
if (window.opener) window.opener.postMessage(message, location.origin);
if ("BroadcastChannel" in window) new BroadcastChannel("clay-oauth").postMessage(message);
window.close();
</script></body></html>
`;

// The search index of another version or language, e.g. /_clay/1.x/de/search.json,
// so results stay within the docs shown; an API's OpenAPI document, e.g.
// /_clay/openapi/petstore.json or /_clay/1.x/openapi/petstore.json; and the OAuth callback page
export default defineEventHandler(event => {
    const path = getRouterParam(event, "path") ?? "";
    const site = useClaySite();
    // An older version's at /_clay/<version>/openapi/<name>.json
    const document = /^(?:([^/]+)\/)?openapi\/([^/]+)\.json$/.exec(path);
    if (document) {
        const found = site.versions.find(v => v.name === (document[1] ?? ""))?.apis.find(a => a.name === document[2]);
        if (!found) throw createError({statusCode: 404, statusMessage: "Not Found"});
        setHeader(event, "content-type", "application/json");
        return JSON.stringify(bundledDocument(found), null, 2);
    }
    if (path === "oauth-callback.html" && site.versions.some(version => version.apis.length)) {
        setHeader(event, "content-type", "text/html; charset=utf-8");
        return OAUTH_CALLBACK;
    }
    const prefix = "/" + path.replace(/\/?search\.json$/, "");
    if (!path.endsWith("search.json") || !site.editions.some(edition => edition.prefix === prefix)) {
        throw createError({statusCode: 404, statusMessage: "Not Found"});
    }
    setHeader(event, "content-type", "application/json");
    return JSON.stringify(buildSearchIndex(site.pages.filter(page => page.prefix === prefix)));
});
