import {absoluteUrl, resolveOrigin, sitemapXml} from "../../common/seo";
import {useClaySite} from "../utils/site";

export default defineEventHandler(event => {
    const site = useClaySite();
    const basePath = useRuntimeConfig().app.baseURL;
    const {origin} = resolveOrigin(site.config.siteURL, basePath);
    if (!origin) throw createError({statusCode: 404, statusMessage: "No sitemap without siteURL"});

    setHeader(event, "content-type", "application/xml");
    return sitemapXml([
        {loc: absoluteUrl(origin, basePath, "/")!},
        ...site.editions.filter(edition => edition.prefix).map(edition => ({loc: absoluteUrl(origin, basePath, edition.prefix)!})),
        // Untranslated pages repeat their original, which is listed instead
        ...site.pages.filter(page => !page.untranslated).map(page => ({loc: absoluteUrl(origin, basePath, page.route)!, lastmod: page.updated}))
    ]);
});
