// Clay Oven writes a hash of the site content into every page
// (<meta name="clay-build">). Content requests carry it as ?v=, so browsers can
// cache them until the content changes. Without it (dev server, bundles from
// older Oven versions) nothing is cached, so edits always show up.
export function contentBuildId(doc: Document = document): string | undefined {
    return doc.querySelector('meta[name="clay-build"]')?.getAttribute("content") || undefined;
}

export function fetchContent(url: string, doc: Document = document): Promise<Response> {
    const buildId = contentBuildId(doc);
    if (!buildId) return fetch(url, {cache: "no-store"});

    const versioned = url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(buildId);
    return fetch(versioned, {cache: "force-cache"});
}
