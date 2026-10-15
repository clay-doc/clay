import {existsSync} from "node:fs";
import {join, posix} from "node:path";
import GithubSlugger from "github-slugger";
import {Marked, type Token} from "marked";
import {stripFrontMatter} from "./front-matter";
import {headingText} from "../common/markdown-text";
import {componentSyntax} from "../common/markdown-components";
import {docPath} from "../common/route-path";
import type {Page} from "./site";

// Shape of a YAML document: an object maps keys to their schema, an array
// describes its items, true accepts any value.
export type Schema = true | { [key: string]: Schema } | [Schema];

const link: Schema = {name: true, icon: true, link: true};

export const configSchema: Schema = {
    title: true, favicon: true, baseURL: true, siteURL: true, lang: true, editURL: true, fontawesomeKit: true, version: true, languages: true, messages: true, variables: true,
    // obsolete, reported separately
    langs: true, index: true,
    navbar: {logo: true, source: link, links: [link]},
};

// Keys in YAML data that the schema does not define, e.g. "navbar.lgo", so
// typos in config files do not go unnoticed.
export function unknownKeys(data: unknown, schema: Schema, prefix = ""): string[] {
    if (schema === true || data === null || typeof data !== "object") return [];

    if (Array.isArray(schema)) {
        if (!Array.isArray(data)) return [];
        const base = prefix.replace(/\.$/, "");
        return data.flatMap((item, i) => unknownKeys(item, schema[0], `${base}[${i}].`)).sort();
    }

    return Object.entries(data as Record<string, unknown>).flatMap(([key, value]) =>
        key in schema ? unknownKeys(value, schema[key]!, `${prefix}${key}.`) : [`${prefix}${key}`]
    ).sort();
}

// With Clay's components, whose headings and links count too
const marked = new Marked({gfm: true}, componentSyntax());

// Files and links written in HTML: images, videos and their posters, sounds, links
const HTML_TAG = /<(img|video|audio|source|track|a)\b([^>]*)>/gi;
const HTML_REF = /\b(src|poster|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

function htmlRefs(html: string): { href: string, isImage: boolean }[] {
    const refs: { href: string, isImage: boolean }[] = [];
    for (const [, tag, attributes] of html.matchAll(HTML_TAG)) {
        for (const [, name, double, single] of attributes!.matchAll(HTML_REF)) {
            if ((name === "href") !== (tag!.toLowerCase() === "a")) continue;
            refs.push({href: double ?? single ?? "", isImage: name !== "href"});
        }
    }
    return refs;
}

function markdownRefs(markdown: string): { href: string, isImage: boolean }[] {
    const refs: { href: string, isImage: boolean }[] = [];
    marked.walkTokens(marked.lexer(stripFrontMatter(markdown)), (token: Token) => {
        if (token.type === "link") refs.push({href: token.href, isImage: false});
        if (token.type === "image") refs.push({href: token.href, isImage: true});
        if (token.type === "html") refs.push(...htmlRefs(token.raw));
    });
    return refs;
}

// The ids a page's sections get when rendered (see headingIds), and ids written in HTML
function anchors(markdown: string): Set<string> {
    const slugger = new GithubSlugger();
    const ids = new Set<string>();
    marked.walkTokens(marked.lexer(stripFrontMatter(markdown)), (token: Token) => {
        if (token.type === "heading") ids.add(slugger.slug(headingText(token.tokens ?? [])));
        if (token.type === "html") for (const match of token.raw.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(match[1]!);
    });
    return ids;
}

const isAssetPath = (path: string) => {
    const ext = posix.extname(path).toLowerCase();
    return ext !== "" && ext !== ".md";
};

// Links and images in the docs that point to pages, files or #sections that do
// not exist, resolved like the app resolves them: relative to the page, ".md"
// dropped. Links to other sites are not checked. docsDirs maps version names to
// their docs folder ("" for the current docs). Untranslated pages repeat their
// original, so they are checked once, there.
export function brokenLinks(pages: Page[], docsDirs: string | Record<string, string>): string[] {
    const dirs = typeof docsDirs === "string" ? {"": docsDirs} : docsDirs;
    const routes = new Set(["/", ...pages.map(page => page.prefix).filter(Boolean), ...pages.map(page => page.route)]);
    const markdown = new Map(pages.filter(page => page.markdown).map(page => [page.route, page.markdown!]));
    const ids = new Map<string, Set<string>>();
    // Sections of a page, or undefined for pages without text, whose sections are not known
    const sectionsOf = (route: string) => {
        if (!ids.has(route) && markdown.has(route)) ids.set(route, anchors(markdown.get(route)!));
        return ids.get(route);
    };
    const broken: string[] = [];

    for (const page of pages) {
        // Folders' and start pages' index.md count too; untranslated pages repeat their original
        if (!page.markdown || page.untranslated) continue;
        const version = page.version ?? "";
        for (const ref of markdownRefs(page.markdown)) {
            // A folder's index.md links relative to its folder
            const reason = checkRef(ref, page.route, docPath(page.route, page.isDir), routes, sectionsOf, dirs[version]!, page.prefix ?? "");
            const source = version ? `docs-archive/${version}/${page.source}` : page.source;
            if (reason) broken.push(`${source}: "${ref.href}" ${reason}`);
        }
    }
    return broken;
}

// "#top" leads to the top of any page
function checkSection(page: string, fragment: string, sectionsOf: (route: string) => Set<string> | undefined): string | undefined {
    if (!fragment || fragment.toLowerCase() === "top") return undefined;
    let id = fragment;
    try {
        id = decodeURIComponent(fragment);
    } catch {
        // keep the raw id
    }
    const sections = sectionsOf(page);
    return !sections || sections.has(id) ? undefined : `points to a missing section (#${id} on ${page})`;
}

function checkRef(ref: { href: string, isImage: boolean }, self: string, route: string, routes: Set<string>,
                  sectionsOf: (route: string) => Set<string> | undefined, docsDir: string, prefix: string): string | undefined {
    const href = ref.href;
    if (!href || href.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(href)) return undefined;
    const fragment = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    if (href.startsWith("#")) return checkSection(self, fragment, sectionsOf);

    let target = href.split("#")[0]!.split("?")[0]!;
    try {
        target = decodeURIComponent(target);
    } catch {
        // keep the raw path
    }

    const resolved = target.startsWith("/") ? target : posix.join(posix.dirname(route), target);

    // Images and other files are served from docs/
    if (ref.isImage || isAssetPath(target)) {
        if (target.startsWith("/")) return undefined; // relative to the site root, outside the docs
        // Files are shared by all languages of a version
        const inDocs = prefix && resolved.startsWith(`${prefix}/`) ? resolved.slice(prefix.length) : resolved;
        return existsSync(join(docsDir, inDocs)) ? undefined : "points to a missing file";
    }

    const page = posix.normalize("/" + resolved.replace(/\.md$/i, "")).replace(/(^|\/)index$/i, "").replace(/\/$/, "") || "/";
    return routes.has(page) ? checkSection(page, fragment, sectionsOf) : `points to a missing page (${page})`;
}
