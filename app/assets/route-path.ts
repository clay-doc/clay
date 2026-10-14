// Static hosts serve Clay Oven's page entry points at "/page/" (with a trailing
// slash), while links and the structure use "/page". Compare routes without it.
export function normalizePath(path: string): string {
    const trimmed = path.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
}
