import type MiniSearch from "minisearch";
import linkConcat from "#common/link-concat";
import {loadSearchIndex, type SearchSection} from "#common/search";

// One index per edition (version and language), loaded once each
const indexes = new Map<string, Promise<MiniSearch<SearchSection>>>();

export function useSearchOpen() {
    return useState<boolean>("searchOpen", () => false);
}

// The index is built at build time (server/routes/_clay/search.json.get.ts, and
// [...path].get.ts for other editions, e.g. /_clay/1.x/de/search.json) and loaded on first use.
export function getSearchIndex(baseUrl: string, prefix = ""): Promise<MiniSearch<SearchSection>> {
    const cached = indexes.get(prefix);
    if (cached) return cached;
    const path = `/_clay${prefix}/search.json`;
    const promise = fetch(linkConcat(baseUrl, path))
        .then(res => {
            if (!res.ok) throw new Error(`Search index: ${res.status}`);
            return res.text();
        })
        .then(loadSearchIndex)
        .catch(error => {
            indexes.delete(prefix);
            throw error;
        });
    indexes.set(prefix, promise);
    return promise;
}
