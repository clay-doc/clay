import type MiniSearch from "minisearch";
import linkConcat from "#common/link-concat";
import {loadSearchIndex, type SearchSection} from "#common/search";

let indexPromise: Promise<MiniSearch<SearchSection>> | undefined;

export function useSearchOpen() {
    return useState<boolean>("searchOpen", () => false);
}

// The index is built at build time (server/routes/_clay/search.json.get.ts)
// and loaded once, on first use.
export function getSearchIndex(baseUrl: string): Promise<MiniSearch<SearchSection>> {
    indexPromise ??= fetch(linkConcat(baseUrl, "/_clay/search.json"))
        .then(res => {
            if (!res.ok) throw new Error(`Search index: ${res.status}`);
            return res.text();
        })
        .then(loadSearchIndex)
        .catch(error => {
            indexPromise = undefined;
            throw error;
        });
    return indexPromise;
}
