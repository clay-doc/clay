import MiniSearch from "minisearch";
import GithubSlugger from "github-slugger";
import {Marked, type Token} from "marked";
import {inlineText, plainText} from "../../common/markdown-text";
import {SEARCH_OPTIONS, type SearchSection} from "../../common/search";
import {stripFrontMatter} from "../../lib/front-matter";
import type {Page} from "../../lib/site";

// A page as the search index sees it
export type SearchPage = {
    link: string;  // route, e.g. "/guides/intro"
    title: string;
    path: string;  // parent directory titles, e.g. "Guides › Advanced"
}

const marked = new Marked({gfm: true});

export function splitIntoSections(markdown: string, page: SearchPage): SearchSection[] {
    const tokens = marked.lexer(stripFrontMatter(markdown));

    // Slug every heading in document order, exactly like the renderer does.
    const slugger = new GithubSlugger();
    const anchors = new Map<Token, string>();
    marked.walkTokens(tokens, token => {
        if (token.type === "heading") anchors.set(token, slugger.slug(inlineText(token.tokens ?? [])));
    });

    const base = {link: page.link, pageTitle: page.title, path: page.path};
    let current: SearchSection = {...base, id: page.link, heading: "", text: "", code: ""};
    const sections = [current];

    for (const token of tokens) {
        if (token.type === "heading" && (token.depth === 2 || token.depth === 3)) {
            const anchor = anchors.get(token)!;
            current = {...base, id: `${page.link}#${anchor}`, anchor, heading: inlineText(token.tokens ?? []), text: "", code: ""};
            sections.push(current);
        } else if (token.type === "code") {
            current.code += token.text + "\n";
        } else {
            current.text += plainText(token) + " ";
        }
    }

    for (const section of sections) {
        // Alerts are read without their "[!TIP]" marker, like the page shows them
        section.text = section.text.replace(/\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]/gi, " ").replace(/\s+/g, " ").trim();
        section.code = section.code.trim();
    }

    return sections;
}

export function directorySection(page: SearchPage): SearchSection {
    return {id: page.link, link: page.link, pageTitle: page.title, heading: "", path: page.path, text: "", code: ""};
}

export function createSearchIndex(sections: SearchSection[]): MiniSearch<SearchSection> {
    const index = new MiniSearch<SearchSection>(SEARCH_OPTIONS);
    index.addAll(sections);
    return index;
}

// One entry per site page: pages, and folders with text in their index.md,
// are split into sections; other folders are found by their title
export function buildSearchIndex(pages: Page[]): MiniSearch<SearchSection> {
    return createSearchIndex(pages.flatMap(page => {
        const searchPage = {link: page.route, title: page.title, path: page.parents.map(p => p.title).join(" › ")};
        return page.markdown === undefined ? [directorySection(searchPage)] : splitIntoSections(page.markdown, searchPage);
    }));
}
