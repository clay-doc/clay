import {existsSync, readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {load} from "js-yaml";
import {Marked} from "marked";
import {inlineText} from "../common/markdown-text";
import type {DocItem} from "../common/nav";
import type {Configuration} from "../common/configuration";
import {editionPrefix, type LanguageInfo, type VersionInfo} from "../common/editions";
import {languageName} from "../common/i18n";
import {parseFrontMatter, stripFrontMatter, type FrontMatter} from "./front-matter";
import {lastUpdated} from "./git-dates";
import {configSchema, dirMetaSchema, unknownKeys} from "./checks";

// Directory metadata from dir-meta.yaml
export type DirMeta = {
    path: string;
    name?: string | Record<string, string>; // per language: {en: "Guides", de: "Anleitungen"}
    icon?: string;
    order?: number;
    children?: DirMeta[];
};

// A file or directory below docs/
export type DocNode = {
    name: string;
    path: string; // relative to docs/, with forward slashes
    isDir: boolean;
    markdown?: string;
    frontMatter: FrontMatter;
    heading?: string; // first "# heading" of a markdown file
    updated?: string; // last commit date (ISO 8601)
    source?: string; // the translation file a page is read from, e.g. "setup.de.md"
    untranslated?: boolean; // shown in the default language, no translation exists
    children: DocNode[];
};

export type Crumb = { title: string, route: string };

// A route of the site: a markdown page or a directory
export type Page = {
    route: string; // e.g. "/guides/setup"
    source: string; // path relative to docs/
    title: string;
    icon: string;
    isDir: boolean;
    parents: Crumb[];
    children: Crumb[];
    markdown?: string;
    frontMatter: FrontMatter;
    updated?: string;
    version: string; // name of the docs version, "" for the current docs
    language: string; // language code
    prefix: string; // URL prefix of the version and language, "" for the current docs in the default language
    untranslated?: boolean;
};

// One version of the docs: the current docs/ (name "") or versions/<name>/docs
export type SiteVersion = VersionInfo & {
    docsDir: string;
    meta: DirMeta[];
    tree: DocNode;
    nav: DocItem;
};

// A version in one language, e.g. "/1.x/de"
export type SiteEdition = {
    prefix: string;
    version: string;
    language: string;
    nav: DocItem;
};

export type Site = {
    root: string;
    docsDir: string; // of the current docs; the same goes for meta, tree and nav (default language)
    config: Configuration; // in the default language
    configs: Record<string, Configuration>; // by language
    meta: DirMeta[];
    tree: DocNode;
    nav: DocItem;
    versions: SiteVersion[]; // the current docs first, then older versions, newest first
    languages: LanguageInfo[]; // the default language first
    editions: SiteEdition[];
    pages: Page[]; // of all editions; routes start with their prefix, e.g. "/1.x/de"
    warnings: string[];
};

export const isMarkdown = (name: string) => name.toLowerCase().endsWith(".md");
const isHidden = (name: string) => name.startsWith(".");

const marked = new Marked({gfm: true});

// The first top-level "# heading" of a markdown document
export function firstHeading(markdown: string): string | undefined {
    for (const token of marked.lexer(stripFrontMatter(markdown))) {
        if (token.type === "heading" && token.depth === 1) return inlineText(token.tokens ?? []).trim() || undefined;
    }
    return undefined;
}

// "getting-started.md" becomes "Getting started"
export function prettyName(name: string): string {
    const base = isMarkdown(name) ? name.slice(0, -3) : name;
    const words = base.replace(/[-_]+/g, " ").trim().split(/\s+/).join(" ");
    return words ? words[0]!.toUpperCase() + words.slice(1) : words;
}

export function loadTree(docsDir: string, path = ""): DocNode[] {
    return readdirSync(join(docsDir, path), {withFileTypes: true})
        .filter(entry => !isHidden(entry.name))
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        .map(entry => {
            const rel = path ? `${path}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                return {name: entry.name, path: rel, isDir: true, frontMatter: {}, children: loadTree(docsDir, rel)};
            }
            if (!isMarkdown(entry.name)) {
                return {name: entry.name, path: rel, isDir: false, frontMatter: {}, children: []};
            }
            const markdown = readFileSync(join(docsDir, rel), "utf8");
            return {
                name: entry.name, path: rel, isDir: false, markdown,
                frontMatter: parseFrontMatter(markdown), heading: firstHeading(markdown), children: []
            };
        });
}

// Whether a directory contains a markdown page at any depth
export function hasPages(node: DocNode): boolean {
    return node.children.some(child => child.isDir ? hasPages(child) : isMarkdown(child.name));
}

const findMeta = (meta: DirMeta[] | undefined, name: string) => meta?.find(m => m.path === name);

export function resolveDir(node: DocNode, meta: DirMeta[] | undefined): { title: string, icon: string, childMeta: DirMeta[] | undefined } {
    const entry = findMeta(meta, node.name);
    const name = typeof entry?.name === "object" ? Object.values(entry.name)[0] : entry?.name;
    if (entry) return {title: name ?? prettyName(node.name), icon: entry.icon ?? "fa-solid fa-folder", childMeta: entry.children};
    // Without an entry, children are still looked up in the same level (as Clay Oven did)
    return {title: prettyName(node.name), icon: "fa-solid fa-folder", childMeta: meta};
}

// Front matter title, else the first heading, else the file name
export function resolveFile(node: DocNode): { title: string, icon: string } {
    return {
        title: node.frontMatter.title || node.heading || prettyName(node.name),
        icon: node.frontMatter.icon || "fa-solid fa-file"
    };
}

// Entries with an order (front matter for pages, dir-meta.yaml for directories)
// come first, ascending; the rest keep their alphabetical order after them.
export function sortTree(nodes: DocNode[], meta: DirMeta[] | undefined): DocNode[] {
    const orderOf = (node: DocNode) => node.isDir ? findMeta(meta, node.name)?.order : node.frontMatter.order;
    const sorted = nodes
        .map((node, index) => ({node, index, order: orderOf(node)}))
        .sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) return a.order - b.order || a.index - b.index;
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return a.index - b.index;
        })
        .map(({node}) => node);

    for (const node of sorted) {
        if (node.isDir) node.children = sortTree(node.children, resolveDir(node, meta).childMeta);
    }
    return sorted;
}

export function applyDates(nodes: DocNode[], dates: Map<string, string>) {
    for (const node of nodes) {
        if (node.isDir) applyDates(node.children, dates);
        else node.updated = dates.get(node.path);
    }
}

// Navigation tree for the app: markdown pages and directories that contain pages
export function buildNav(tree: DocNode, meta: DirMeta[], prefix = ""): DocItem {
    function walk(nodes: DocNode[], meta: DirMeta[] | undefined, prefix: string): DocItem[] {
        const items: DocItem[] = [];
        for (const node of nodes) {
            if (node.isDir) {
                if (!hasPages(node)) continue;
                const {title, icon, childMeta} = resolveDir(node, meta);
                const link = `${prefix}/${node.name}`;
                items.push({title, icon, link, displayLink: link, children: walk(node.children, childMeta, link)});
            } else if (isMarkdown(node.name)) {
                const {title, icon} = resolveFile(node);
                const link = `${prefix}/${node.name}`;
                items.push({
                    title, icon, link, displayLink: link.replace(/\.md$/, ""), children: undefined, updated: node.updated,
                    source: node.source ?? node.path, ...(node.untranslated ? {untranslated: true} : {}),
                });
            }
        }
        return items;
    }

    return {title: "docs", link: "docs", displayLink: "docs", children: walk(tree.children, meta, prefix)};
}

export function collectPages(tree: DocNode, meta: DirMeta[], prefix = "", version = "", language = ""): { pages: Page[], topLevel: Crumb[] } {
    const edition = {version, language, prefix};
    const pages: Page[] = [];

    function walk(nodes: DocNode[], meta: DirMeta[] | undefined, prefix: string, parents: Crumb[]): Crumb[] {
        const children: Crumb[] = [];
        for (const node of nodes) {
            if (node.isDir) {
                if (!hasPages(node)) continue;
                const {title, icon, childMeta} = resolveDir(node, meta);
                const crumb = {title, route: `${prefix}/${node.name}`};
                const page: Page = {route: crumb.route, source: node.path, title, icon, isDir: true, parents, children: [], frontMatter: {}, ...edition};
                pages.push(page);
                page.children = walk(node.children, childMeta, crumb.route, [...parents, crumb]);
                children.push(crumb);
            } else if (isMarkdown(node.name)) {
                const {title, icon} = resolveFile(node);
                // Links drop a lowercase ".md", like the navigation does
                const crumb = {title, route: `${prefix}/${node.name.replace(/\.md$/, "")}`};
                pages.push({
                    route: crumb.route, source: node.source ?? node.path, title, icon, isDir: false, parents, children: [],
                    markdown: node.markdown, frontMatter: node.frontMatter, updated: node.updated, ...edition,
                    ...(node.untranslated ? {untranslated: true} : {}),
                });
                children.push(crumb);
            }
        }
        return children;
    }

    return {pages, topLevel: walk(tree.children, meta, prefix, [])};
}

// Values in clay.yaml and dir-meta.yaml can be given per language, e.g.
// title: {en: "Guides", de: "Anleitungen"}; missing languages use the default one
export function localize<T>(value: T, language: string, codes: string[]): T {
    if (Array.isArray(value)) return value.map(item => localize(item, language, codes)) as T;
    if (!value || typeof value !== "object") return value;
    const entries = Object.entries(value);
    if (entries.length > 0 && entries.every(([key]) => codes.includes(key))) {
        const values = value as Record<string, unknown>;
        return (values[language] ?? values[codes[0]!] ?? entries[0]![1]) as T;
    }
    // Interface texts and the language list are keyed by language themselves
    return Object.fromEntries(entries.map(([key, item]) => [key, key === "messages" || key === "languages" ? item : localize(item, language, codes)])) as T;
}

const LANGUAGE_CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// The site's languages: "languages" in clay.yaml (the first is the default), else "lang"
export function siteLanguages(config: Configuration): { languages: LanguageInfo[], warnings: string[] } {
    const warnings: string[] = [];
    const listed = config.languages?.length ? config.languages : [config.lang || "en"];
    const codes = [...new Set(listed.map(String))].filter(code => {
        if (LANGUAGE_CODE.test(code)) return true;
        warnings.push(`clay.yaml: "${code}" is not a language code like "en" or "pt-BR"; it is ignored`);
        return false;
    });
    if (codes.length === 0) codes.push("en");
    if (config.languages?.length && config.lang && config.lang !== codes[0]) {
        warnings.push(`clay.yaml: "lang" is ignored; the first of "languages" (${codes[0]}) is the default language`);
    }
    return {languages: codes.map(code => ({code, label: languageName(code)})), warnings};
}

// "setup.de.md" translates "setup.md" when "de" is one of the site's other languages
export function translationOf(name: string, codes: string[]): string | undefined {
    const match = name.match(/^(.+)\.([^.]+)\.md$/i);
    return match && codes.includes(match[2]!) ? match[2] : undefined;
}

// Settings that can be overridden at build time, e.g. in CI
const envOverrides: [string, keyof Configuration][] = [
    ["CLAY_TITLE", "title"],
    ["CLAY_BASE_URL", "baseURL"],
    ["CLAY_SITE_URL", "siteURL"],
    ["CLAY_FONTAWESOME_KIT", "fontawesomeKit"],
];

export function loadConfig(root: string, env: Record<string, string | undefined> = process.env): { config: Configuration, warnings: string[] } {
    const path = join(root, "clay.yaml");
    if (!existsSync(path)) throw new Error(`No clay.yaml found in ${root}`);

    const text = readFileSync(path, "utf8");
    const config = (load(text) ?? {}) as Configuration;
    const warnings = unknownKeys(load(text), configSchema).map(key => `clay.yaml: unknown key "${key}" is ignored (typo?)`);
    if (!config.title) warnings.push(`clay.yaml: "title" is not set`);
    if (config.langs) warnings.push(`clay.yaml: "langs" is no longer needed and is ignored; code languages are detected automatically`);

    for (const [name, key] of envOverrides) {
        const value = env[name];
        if (value) (config as Record<string, unknown>)[key] = value;
    }
    return {config, warnings};
}

export function loadDirMeta(root: string): { meta: DirMeta[], warnings: string[] } {
    const path = join(root, "dir-meta.yaml");
    if (!existsSync(path)) return {meta: [], warnings: []};

    const data = load(readFileSync(path, "utf8"));
    const warnings = unknownKeys(data, [dirMetaSchema]).map(key => `dir-meta.yaml: unknown key "${key}" is ignored (typo?)`);
    return {meta: (Array.isArray(data) ? data : []) as DirMeta[], warnings};
}

export type LoadOptions = {
    env?: Record<string, string | undefined>;
    gitDates?: boolean; // read last-updated dates from git (slow on large histories)
};

// Version names become the first segment of their URLs
const VERSION_NAME = /^[A-Za-z0-9][\w.-]*$/;
const RESERVED_NAMES = new Set(["docs", "api", "_clay", "_nuxt"]);

// Older versions: folders in versions/ with a docs/ folder, newest first
export function listVersions(root: string): { names: string[], warnings: string[] } {
    const dir = join(root, "versions");
    if (!existsSync(dir)) return {names: [], warnings: []};

    const names: string[] = [];
    const warnings: string[] = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        if (!entry.isDirectory() || isHidden(entry.name)) continue;
        if (!VERSION_NAME.test(entry.name) || RESERVED_NAMES.has(entry.name)) {
            warnings.push(`versions/${entry.name}: not usable as a version name in URLs; the folder is skipped`);
        } else if (!existsSync(join(dir, entry.name, "docs"))) {
            warnings.push(`versions/${entry.name}: has no docs/ folder; the folder is skipped`);
        } else {
            names.push(entry.name);
        }
    }
    return {names: names.sort((a, b) => b.localeCompare(a, undefined, {numeric: true})), warnings};
}

// The docs of one version in every language: dir holds its docs/ folder and
// dir-meta.yaml. Translations ("setup.de.md") replace their original in their
// language; pages without one show the original there.
function loadVersion(dir: string, info: VersionInfo, gitDates: boolean, languages: LanguageInfo[]): {
    version: SiteVersion, editions: SiteEdition[], pages: Page[], warnings: string[]
} {
    const docsDir = join(dir, "docs");
    if (!existsSync(docsDir)) throw new Error(`No docs/ directory found in ${dir}`);
    const codes = languages.map(language => language.code);

    const {meta, warnings} = loadDirMeta(dir);
    const translations = new Map<string, DocNode>();
    const originals = new Set<string>();
    const split = (nodes: DocNode[]): DocNode[] => nodes.flatMap(node => {
        if (node.isDir) return [{...node, children: split(node.children)}];
        if (translationOf(node.name, codes.slice(1))) {
            translations.set(node.path, node);
            return [];
        }
        if (isMarkdown(node.name)) originals.add(node.path.toLowerCase());
        return [node];
    });
    const tree: DocNode = {name: "docs", path: "", isDir: true, frontMatter: {}, children: split(loadTree(docsDir))};
    tree.children = sortTree(tree.children, localize(meta, codes[0]!, codes));
    for (const path of translations.keys()) {
        const original = path.replace(/\.[^.]+\.md$/i, ".md");
        if (!originals.has(original.toLowerCase())) warnings.push(`${path}: translates ${original}, which does not exist; the file is skipped`);
    }

    let dates: Map<string, string> | undefined;
    if (gitDates) {
        const result = lastUpdated(docsDir);
        dates = result.dates;
        if (dates) applyDates(tree.children, dates);
        else if (result.reason) warnings.push(result.reason);
    }

    const translate = (nodes: DocNode[], code: string): DocNode[] => nodes.map(node => {
        if (node.isDir) return {...node, children: translate(node.children, code)};
        if (!isMarkdown(node.name)) return node;
        const translation = translations.get(node.path.replace(/\.md$/i, `.${code}.md`));
        if (!translation) return {...node, untranslated: true};
        return {
            ...node, markdown: translation.markdown, heading: translation.heading, source: translation.path,
            // The position in the navigation is the same in every language
            frontMatter: {...translation.frontMatter, order: node.frontMatter.order},
            updated: dates?.get(translation.path),
        };
    });

    const editions: SiteEdition[] = [];
    const pages: Page[] = [];
    for (const language of languages) {
        const localMeta = localize(meta, language.code, codes);
        const languageTree = language.code === codes[0] ? tree : {...tree, children: translate(tree.children, language.code)};
        const prefix = editionPrefix(info.name, language.code, codes[0]!);
        editions.push({prefix, version: info.name, language: language.code, nav: buildNav(languageTree, localMeta, prefix)});
        pages.push(...collectPages(languageTree, localMeta, prefix, info.name, language.code).pages);
    }
    return {version: {...info, docsDir, meta, tree, nav: editions[0]!.nav}, editions, pages, warnings};
}

// Loads everything Clay needs from a project: config, directory metadata and
// docs, for the current docs and every older version, in every language
export function loadSite(root: string, {env = process.env, gitDates = true}: LoadOptions = {}): Site {
    const {config: raw, warnings} = loadConfig(root, env);
    const {languages, warnings: languageWarnings} = siteLanguages(raw);
    warnings.push(...languageWarnings);
    const codes = languages.map(language => language.code);
    const configs = Object.fromEntries(codes.map(code => [code, {...localize(raw, code, codes), lang: code}]));
    const config = configs[codes[0]!]!;

    const current = loadVersion(root, {name: "", label: config.version || "Latest"}, gitDates, languages);
    warnings.push(...current.warnings);

    const {names, warnings: versionWarnings} = listVersions(root);
    warnings.push(...versionWarnings);
    const topLevel = new Set(current.pages.filter(page => page.parents.length === 0 && !page.prefix).map(page => page.route.slice(1)));
    for (const code of codes.slice(1)) {
        if (topLevel.has(code)) warnings.push(`docs/${code} has the same URL as the language ${code}; rename the folder`);
    }
    const older = names.map(name => {
        if (topLevel.has(name)) warnings.push(`versions/${name}: docs/${name} has the same URL as this version; rename one of them`);
        const loaded = loadVersion(join(root, "versions", name), {name, label: name}, gitDates, languages);
        // Git history is reported once, for the current docs
        warnings.push(...loaded.warnings.filter(w => !w.includes("last-updated")).map(w => `versions/${name}/${w}`));
        return loaded;
    });

    const {docsDir, meta, tree, nav} = current.version;
    return {
        root, docsDir, config, configs, meta, tree, nav, languages,
        versions: [current.version, ...older.map(o => o.version)],
        editions: [current.editions, ...older.map(o => o.editions)].flat(),
        pages: [current.pages, ...older.map(o => o.pages)].flat(),
        warnings,
    };
}
