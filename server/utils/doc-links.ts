// DOM types: runs on the server with jsdom (sanitize.ts)
/// <reference lib="dom" />
import {normalizePath} from "../../common/route-path";
import linkConcat from "../../common/link-concat";

const hasScheme = (ref: string) => /^[a-z][a-z\d+.-]*:/i.test(ref) || ref.startsWith("//");

// Resolves a link inside a doc to an app route, relative to the doc's own path
// (like links between files on GitHub). Returns undefined for links the browser
// should handle itself: other sites, mailto:, tel: and similar.
export function resolveDocLink(href: string, docPath: string): string | undefined {
    if (hasScheme(href)) return undefined;
    if (href.startsWith("#")) return href;

    const base = new URL(normalizePath(docPath), "http://clay.local");
    const url = new URL(href, base);
    // "guides/index.md" is the page of the folder "guides"
    const path = normalizePath(url.pathname.replace(/\.md$/i, "").replace(/(^|\/)index$/i, "/"));
    return path + url.search + url.hash;
}

// Files next to the docs (images, PDFs...) are served from docs/. Resolves a
// relative reference to such a file; absolute paths and URLs are left alone.
export function resolveDocAsset(ref: string, docPath: string): string | undefined {
    if (hasScheme(ref) || ref.startsWith("/") || ref.startsWith("#")) return undefined;

    const base = new URL("/docs" + normalizePath(docPath), "http://clay.local");
    const url = new URL(ref, base);
    return url.pathname + url.search + url.hash;
}

// A link to a file other than a markdown doc, e.g. "files/guide.pdf"
export function isAssetLink(href: string): boolean {
    const path = href.split(/[?#]/)[0] ?? "";
    return /\.(?!md$)[a-z\d]+$/i.test(path);
}

// Rewrites a rendered doc before it is shown: doc links get their app route
// (data-route) and a real href that also works in new tabs, relative images and
// files point into docs/, and external links open in a new tab, with an icon
// before their text that says they leave the site. Done on a
// <template>, so nothing loads the unresolved image URLs; pass a DOM
// implementation's document (jsdom). Files resolve against
// assetPath: translations share the files of their version, so their path has
// no language prefix.
export function rewriteDocHtml(html: string, docPath: string, baseUrl: string, routeHref: (route: string) => string,
                               doc: Document = document, assetPath = docPath): string {
    const template = doc.createElement("template");
    template.innerHTML = html;
    const root = template.content;

    // Images, and videos and sounds written in HTML
    for (const [selector, attribute] of [["img[src], video[src], audio[src], source[src], track[src]", "src"], ["video[poster]", "poster"]] as const) {
        for (const element of root.querySelectorAll(selector)) {
            const src = resolveDocAsset(element.getAttribute(attribute)!, assetPath);
            if (src) element.setAttribute(attribute, linkConcat(baseUrl, src));
        }
    }

    for (const link of root.querySelectorAll("a[href]")) {
        const href = link.getAttribute("href")!;

        if (isAssetLink(href) && !hasScheme(href)) {
            // Clay's own files, e.g. an API's OpenAPI document (lib/openapi-pages.ts), are below the base path
            const asset = href.startsWith("/_clay/") ? href : resolveDocAsset(href, assetPath);
            if (asset) link.setAttribute("href", linkConcat(baseUrl, asset));
            continue;
        }

        const route = resolveDocLink(href, docPath);
        if (route === undefined) {
            if (/^https?:/i.test(href)) {
                link.setAttribute("target", "_blank");
                link.setAttribute("rel", "noopener noreferrer");
                // Not on images that are links, or cards, which are boxes of their own
                if (!link.matches(".clay-card") && !link.querySelector("img, picture, svg, video")) {
                    const icon = doc.createElement("i");
                    icon.className = "fa-solid fa-arrow-up-right-from-square clay-external-icon";
                    icon.setAttribute("aria-hidden", "true");
                    link.prepend(icon);
                }
            }
            continue;
        }

        link.setAttribute("data-route", route);
        link.setAttribute("href", routeHref(route));
    }

    return template.innerHTML;
}
