// Search engine helpers used when rendering pages and the sitemap

export const TITLE_SEPARATOR = " · ";
export const DESCRIPTION_LENGTH = 160;

export function pageTitle(page: string | undefined, site: string): string {
    return page && page !== site ? page + TITLE_SEPARATOR + site : site;
}

export function truncate(text: string, limit = DESCRIPTION_LENGTH): string {
    const chars = [...text];
    if (chars.length <= limit) return text;
    let cut = chars.slice(0, limit - 1).join("");
    const space = cut.lastIndexOf(" ");
    if (space > limit / 2) cut = cut.slice(0, space);
    return cut.replace(/[ ,.;:]+$/, "") + "…";
}

// The origin ("https://example.com") of siteURL; the path comes from baseURL.
// Returns a warning when siteURL is missing or unusable.
export function resolveOrigin(siteURL: string | undefined, basePath: string): { origin?: string, warning?: string } {
    if (!siteURL) return {warning: "siteURL is not set: canonical URLs, sitemap.xml and structured data are skipped"};

    let url: URL;
    try {
        url = new URL(siteURL);
    } catch {
        return {warning: `siteURL "${siteURL}" is not an absolute http(s) URL: canonical URLs, sitemap.xml and structured data are skipped`};
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return {warning: `siteURL "${siteURL}" is not an absolute http(s) URL: canonical URLs, sitemap.xml and structured data are skipped`};
    }

    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    const warning = path && path !== basePath.replace(/^\/+|\/+$/g, "")
        ? `siteURL path "${url.pathname}" is ignored, the path comes from baseURL ("${basePath}")`
        : undefined;
    return {origin: url.origin, warning};
}

// URL path of a route; pages are served at "<route>/"
export function routePath(basePath: string, route: string): string {
    const base = "/" + basePath.replace(/^\/+|\/+$/g, "");
    const trimmed = route.replace(/^\/+|\/+$/g, "");
    const path = (base === "/" ? "" : base) + "/" + (trimmed ? trimmed + "/" : "");
    return encodeURI(path);
}

export function absoluteUrl(origin: string | undefined, basePath: string, route: string): string | undefined {
    return origin ? origin + routePath(basePath, route) : undefined;
}

// BreadcrumbList structured data, so search results can show where a page sits
export function breadcrumbs(trail: { title: string, route: string }[], origin: string | undefined, basePath: string): string | undefined {
    if (!origin || trail.length < 2) return undefined;
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: trail.map((crumb, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: crumb.title,
            item: absoluteUrl(origin, basePath, crumb.route)
        }))
    }).replace(/</g, "\\u003c"); // cannot close the script tag
}

const xmlEscape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function sitemapXml(entries: { loc: string, lastmod?: string }[]): string {
    const urls = entries.map(e => e.lastmod
        ? `  <url><loc>${xmlEscape(e.loc)}</loc><lastmod>${xmlEscape(e.lastmod)}</lastmod></url>`
        : `  <url><loc>${xmlEscape(e.loc)}</loc></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
