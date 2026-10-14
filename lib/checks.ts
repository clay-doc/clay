import {existsSync} from "node:fs";
import {join, posix} from "node:path";
import {Marked, type Token} from "marked";
import {stripFrontMatter} from "./front-matter";
import {docPath} from "../common/route-path";
import type {Page} from "./site";

// Shape of a YAML document: an object maps keys to their schema, an array
// describes its items, true accepts any value.
export type Schema = true | { [key: string]: Schema } | [Schema];

const link: Schema = {name: true, icon: true, link: true};

export const configSchema: Schema = {
    title: true, favicon: true, baseURL: true, siteURL: true, lang: true, editURL: true, fontawesomeKit: true, version: true, languages: true, messages: true,
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

const marked = new Marked({gfm: true});

function markdownRefs(markdown: string): { href: string, isImage: boolean }[] {
    const refs: { href: string, isImage: boolean }[] = [];
    marked.walkTokens(marked.lexer(stripFrontMatter(markdown)), (token: Token) => {
        if (token.type === "link") refs.push({href: token.href, isImage: false});
        if (token.type === "image") refs.push({href: token.href, isImage: true});
    });
    return refs;
}

const isAssetPath = (path: string) => {
    const ext = posix.extname(path).toLowerCase();
    return ext !== "" && ext !== ".md";
};

// Links and images in the docs that point to pages or files that do not exist,
// resolved like the app resolves them: relative to the page, ".md" dropped.
// Links to other sites and #anchors are not checked. docsDirs maps version
// names to their docs folder ("" for the current docs). Untranslated pages
// repeat their original, so they are checked once, there.
export function brokenLinks(pages: Page[], docsDirs: string | Record<string, string>): string[] {
    const dirs = typeof docsDirs === "string" ? {"": docsDirs} : docsDirs;
    const routes = new Set(["/", ...pages.map(page => page.prefix).filter(Boolean), ...pages.map(page => page.route)]);
    const broken: string[] = [];

    for (const page of pages) {
        if (page.isDir || !page.markdown || page.untranslated) continue;
        const version = page.version ?? "";
        for (const ref of markdownRefs(page.markdown)) {
            // A folder's index.md links relative to its folder
            const reason = checkRef(ref, docPath(page.route, page.isDir), routes, dirs[version]!, page.prefix ?? "");
            const source = version ? `versions/${version}/docs/${page.source}` : page.source;
            if (reason) broken.push(`${source}: "${ref.href}" ${reason}`);
        }
    }
    return broken;
}

function checkRef(ref: { href: string, isImage: boolean }, route: string, routes: Set<string>, docsDir: string, prefix: string): string | undefined {
    const href = ref.href;
    if (!href || href.startsWith("#") || href.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(href)) return undefined;

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
    return routes.has(page) ? undefined : `points to a missing page (${page})`;
}
