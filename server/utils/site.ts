import {loadSite, type Site} from "../../lib/site";

let cached: Site | undefined;

// The project's docs and config. Read once for builds; re-read on every
// request during development so edits show up immediately.
export function useClaySite(): Site {
    const root = useRuntimeConfig().clayRoot as string;
    if (import.meta.dev) return loadSite(root, {gitDates: false});
    return cached ??= loadSite(root);
}
