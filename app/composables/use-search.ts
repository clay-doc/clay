import type MiniSearch from "minisearch";
import linkConcat from "#common/link-concat";
import {loadSearchIndex, type SearchSection} from "#common/search";

// One index per docs version, loaded once each
const indexes = new Map<string, Promise<MiniSearch<SearchSection>>>();

export function useSearchOpen() {
    return useState<boolean>("searchOpen", () => false);
}

// The index is built at build time (server/routes/_clay/search.json.get.ts,
// and versions/[version]/search.json.get.ts for older versions) and loaded on first use.
export function getSearchIndex(baseUrl: string, version = ""): Promise<MiniSearch<SearchSection>> {
    const cached = indexes.get(version);
    if (cached) return cached;
    const path = version ? `/_clay/versions/${version}/search.json` : "/_clay/search.json";
    const promise = fetch(linkConcat(baseUrl, path))
        .then(res => {
            if (!res.ok) throw new Error(`Search index: ${res.status}`);
            return res.text();
        })
        .then(loadSearchIndex)
        .catch(error => {
            indexes.delete(version);
            throw error;
        });
    indexes.set(version, promise);
    return promise;
}
