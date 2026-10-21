import MiniSearch from "minisearch";
import type {SearchSection} from "../../common/search";
import {normalizePath} from "../../common/route-path";
import {truncate} from "../../common/seo";

// What the popup of a link to another page shows (LinkPreview.vue), read from
// the search index of the page's edition: where the page is, its title and
// the start of its text; for a link to a #section, that section's
export type LinkPreview = { path: string, title: string, text: string };

const EXCERPT_LENGTH = 300;

// route: a doc link's data-route, e.g. "/guides/setup#install"
export function linkPreview(index: MiniSearch<SearchSection>, route: string): LinkPreview | undefined {
    const [, path = "", hash = ""] = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(route) ?? [];
    const link = normalizePath(path);
    const page = index.getStoredFields(link) as SearchSection | undefined;
    if (!page) return undefined;

    if (hash) {
        const section = index.getStoredFields(`${link}#${decodeURIComponent(hash)}`) as SearchSection | undefined;
        if (section?.text) {
            return {path: [page.path, page.pageTitle].filter(Boolean).join(" › "), title: section.heading, text: truncate(section.text, EXCERPT_LENGTH)};
        }
    }

    // The intro starts with the page's "# heading"; a page that has no text
    // before its first section shows that section's
    const intro = page.title && page.text.startsWith(page.title) ? page.text.slice(page.title.length).trim() : page.text;
    const text = intro || (index.search(MiniSearch.wildcard, {filter: result => result.link === link && result.id !== link && !!result.text})[0]?.text as string | undefined);
    if (!text) return undefined;
    return {path: page.path, title: page.pageTitle, text: truncate(text, EXCERPT_LENGTH)};
}
