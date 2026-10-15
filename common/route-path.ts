// Static hosts serve Clay Oven's page entry points at "/page/" (with a trailing
// slash), while links and the structure use "/page". Compare routes without it.
export function normalizePath(path: string): string {
    const trimmed = path.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
}

// The path a doc's relative links and files resolve against: a page's route,
// or for a folder's page (its index.md) a file inside the folder
export function docPath(route: string, isFolder: boolean): string {
    return isFolder ? `${route === "/" ? "" : route}/index` : route;
}

// The address of a page's Markdown, for language models and agents: the page's
// path with ".md"; a start page (of the site, a version or a language) is
// ".../index.md"
export function markdownRoute(route: string, isStart: boolean): string {
    return isStart ? `${route === "/" ? "" : route}/index.md` : `${route}.md`;
}
