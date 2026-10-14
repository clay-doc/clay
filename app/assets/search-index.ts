import MiniSearch from "minisearch";
import GithubSlugger from "github-slugger";
import {Marked, type Token} from "marked";
import {inlineText, plainText} from "./markdown-text";
import {dropFrontMatterIfExists} from "./front-matter-extractor";
import type {DocItem} from "./structure-loader";

// A page or directory from the structure file.
export type SearchPage = {
    link: string;           // route, e.g. "/guides/intro"
    markdownPath?: string;  // file below docs/, e.g. "/guides/intro.md"; unset for directories
    title: string;
    path: string;           // parent directory titles, e.g. "Guides › Advanced"
}

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

const marked = new Marked({gfm: true});

export function listSearchPages(root: DocItem): SearchPage[] {
    const pages: SearchPage[] = [];

    function walk(items: DocItem[] | undefined, parents: string[]) {
        for (const item of items ?? []) {
            const isDirectory = item.children !== undefined;
            pages.push({
                link: item.displayLink,
                markdownPath: isDirectory ? undefined : item.link,
                title: item.title,
                path: parents.join(" › ")
            });
            if (isDirectory) walk(item.children, [...parents, item.title]);
        }
    }

    walk(root.children, []);
    return pages;
}

export function splitIntoSections(markdown: string, page: SearchPage): SearchSection[] {
    const tokens = marked.lexer(dropFrontMatterIfExists(markdown));

    // Slug every heading in document order, exactly like the renderer does.
    const slugger = new GithubSlugger();
    const anchors = new Map<Token, string>();
    marked.walkTokens(tokens, token => {
        if (token.type === "heading") anchors.set(token, slugger.slug(inlineText(token.tokens)));
    });

    const base = {link: page.link, pageTitle: page.title, path: page.path};
    let current: SearchSection = {...base, id: page.link, heading: "", text: "", code: ""};
    const sections = [current];

    for (const token of tokens) {
        if (token.type === "heading" && (token.depth === 2 || token.depth === 3)) {
            const anchor = anchors.get(token)!;
            current = {...base, id: `${page.link}#${anchor}`, anchor, heading: inlineText(token.tokens), text: "", code: ""};
            sections.push(current);
        } else if (token.type === "code") {
            current.code += token.text + "\n";
        } else {
            current.text += plainText(token) + " ";
        }
    }

    for (const section of sections) {
        section.text = section.text.replace(/\s+/g, " ").trim();
        section.code = section.code.trim();
    }

    return sections;
}

export function directorySection(page: SearchPage): SearchSection {
    return {id: page.link, link: page.link, pageTitle: page.title, heading: "", path: page.path, text: "", code: ""};
}

export function createSearchIndex(sections: SearchSection[]): MiniSearch<SearchSection> {
    const index = new MiniSearch<SearchSection>({
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
    });
    index.addAll(sections);
    return index;
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
