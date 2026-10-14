import type MiniSearch from "minisearch";
import type {DocItem} from "~/assets/structure-loader";
import linkConcat from "~/assets/link-concat";
import {fetchContent} from "~/assets/content-fetch";
import {
    createSearchIndex,
    directorySection,
    listSearchPages,
    splitIntoSections,
    type SearchPage,
    type SearchSection
} from "~/assets/search-index";

// Markdown files bundled by Clay Oven into search-docs.json
type SearchDoc = { path: string; content: string };

let indexPromise: Promise<MiniSearch<SearchSection>> | undefined;

export function useSearchOpen() {
    return useState<boolean>("searchOpen", () => false);
}

// Builds the index once, on first use.
export function getSearchIndex(baseUrl: string, root: DocItem): Promise<MiniSearch<SearchSection>> {
    indexPromise ??= buildIndex(baseUrl, root).catch(error => {
        indexPromise = undefined;
        throw error;
    });
    return indexPromise;
}

async function buildIndex(baseUrl: string, root: DocItem): Promise<MiniSearch<SearchSection>> {
    const pages = listSearchPages(root);
    const markdown = await loadBundledDocs(baseUrl) ?? await fetchDocs(baseUrl, pages);

    return createSearchIndex(pages.flatMap(page => page.markdownPath === undefined
        ? [directorySection(page)]
        : splitIntoSections(markdown.get(page.markdownPath) ?? "", page)));
}

async function loadBundledDocs(baseUrl: string): Promise<Map<string, string> | undefined> {
    try {
        const res = await fetchContent(linkConcat(baseUrl, "/search-docs.json"));
        if (!res.ok) return undefined;
        // Dev servers may answer unknown paths with the app's HTML, so parse defensively
        const docs = await res.json() as SearchDoc[];
        return new Map(docs.map(doc => [doc.path, doc.content]));
    } catch {
        return undefined;
    }
}

// Fallback without search-docs.json (dev server, bundles from older Clay Oven)
async function fetchDocs(baseUrl: string, pages: SearchPage[]): Promise<Map<string, string>> {
    const entries = await Promise.all(pages
        .filter(page => page.markdownPath !== undefined)
        .map(async page => {
            const res = await fetchContent(linkConcat(baseUrl, "/docs" + page.markdownPath));
            return [page.markdownPath!, res.ok ? await res.text() : ""] as const;
        }));
    return new Map(entries);
}
