import MiniSearch, {type Options} from "minisearch";

// One indexed unit: a page intro or the content below an h2/h3.
export type SearchSection = {
    id: string;
    link: string;
    anchor?: string;
    pageTitle: string;
    heading: string;
    path: string;
    text: string;
    code: string;
}

export type SearchTarget = Pick<SearchSection, "link" | "anchor" | "pageTitle" | "heading" | "path">;

export type Segment = { text: string; match: boolean };

export type SearchHit = SearchTarget & {
    id: string;
    terms: string[];
    snippet: Segment[];
}

// Index options; the index is built at build time and loaded in the browser
// with the same options (see MiniSearch.loadJSON)
export const SEARCH_OPTIONS: Options<SearchSection> = {
    fields: ["pageTitle", "heading", "path", "text", "code"],
    storeFields: ["link", "anchor", "pageTitle", "heading", "path", "text"],
    searchOptions: {
        boost: {pageTitle: 4, heading: 3, path: 2, text: 1, code: 0.5},
        // Match the word being typed as a prefix, tolerate typos in longer words
        prefix: (_term, i, terms) => i === terms.length - 1,
        fuzzy: term => term.length >= 4 ? 0.2 : false,
        // A page's intro section should win over its subsections on title matches
        boostDocument: (_id, _term, stored) => stored?.heading ? 1 : 1.2
    }
};

export function loadSearchIndex(json: string): MiniSearch<SearchSection> {
    return MiniSearch.loadJSON<SearchSection>(json, SEARCH_OPTIONS);
}

export function searchSections(index: MiniSearch<SearchSection>, query: string, limit = 20): SearchHit[] {
    const q = query.trim();
    if (!q) return [];

    // Require every word to match; fall back to any word if nothing does
    let results = index.search(q, {combineWith: "AND"});
    if (results.length === 0) results = index.search(q, {combineWith: "OR"});

    return results.slice(0, limit).map(result => ({
        id: result.id,
        link: result.link,
        anchor: result.anchor,
        pageTitle: result.pageTitle,
        heading: result.heading,
        path: result.path,
        terms: result.terms,
        snippet: snippet(result.text, result.terms)
    }));
}

function termPattern(terms: string[]): RegExp | undefined {
    if (terms.length === 0) return undefined;
    const escaped = [...terms]
        .sort((a, b) => b.length - a.length)
        .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    // Result terms are whole indexed words, so only highlight whole-word matches
    return new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
}

export function highlight(text: string, terms: string[]): Segment[] {
    const pattern = termPattern(terms);
    if (!pattern) return text ? [{text, match: false}] : [];
    return text
        .split(pattern)
        .filter(part => part !== "")
        .map(part => ({text: part, match: terms.some(term => term.toLowerCase() === part.toLowerCase())}));
}

export function snippet(text: string, terms: string[], length = 160): Segment[] {
    const first = termPattern(terms)?.exec(text)?.index ?? 0;

    let start = Math.max(0, first - 40);
    if (start > 0) start = text.indexOf(" ", start) + 1 || start;
    const end = Math.min(text.length, start + length);

    const excerpt = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    return highlight(excerpt, terms);
}
