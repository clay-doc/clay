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
