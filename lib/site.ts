import {existsSync, readdirSync, readFileSync} from "node:fs";
import {basename, isAbsolute, join, relative, resolve} from "node:path";
import {load} from "js-yaml";
import {Marked} from "marked";
import {componentSyntax} from "../common/markdown-components";
import {inlineText} from "../common/markdown-text";
import type {DocItem} from "../common/nav";
import type {Configuration} from "../common/configuration";
import {editionPrefix, type LanguageInfo, type VersionInfo} from "../common/editions";
import {languageName} from "../common/i18n";
import {parseFrontMatter, splitFrontMatter, stripFrontMatter, type FrontMatter} from "./front-matter";
import {lastUpdated} from "./git-dates";
import {configSchema, unknownKeys} from "./checks";
import {createExpander} from "./expand";
import {themeWarnings} from "../common/theme";
import {analyticsWarnings} from "../common/analytics";

// Fills in snippets and variables of a docs file (expand.ts) for a language
type Expand = (markdown: string, file: string, language: string) => string;

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
    index?: DocNode; // a folder's index.md: its page, title, icon and order
};

export type Crumb = { title: string, route: string };

// A route of the site: a markdown page or a folder; a folder's page is its
// index.md when it has one (markdown is then set)
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

// One version of the docs: the current docs/ (name "") or docs-archive/<name>/
export type SiteVersion = VersionInfo & {
    docsDir: string;
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
    docsDir: string; // of the current docs; the same goes for tree and nav (default language)
    config: Configuration; // in the default language
    configs: Record<string, Configuration>; // by language
    tree: DocNode;
    nav: DocItem;
    versions: SiteVersion[]; // the current docs first, then older versions, newest first
    languages: LanguageInfo[]; // the default language first
    editions: SiteEdition[];
    pages: Page[]; // of all editions; routes start with their prefix, e.g. "/1.x/de"
    included: string[]; // files included into pages (expand.ts) and settings files of clay.yaml, relative to root
    warnings: string[];
};

export const isMarkdown = (name: string) => name.toLowerCase().endsWith(".md");
export const isIndex = (name: string) => name.toLowerCase() === "index.md";
// Hidden files, and files and folders starting with "_" (snippets to include, see expand.ts), are no pages
const isHidden = (name: string) => name.startsWith(".") || name.startsWith("_");

const marked = new Marked({gfm: true}, componentSyntax());

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

// expand fills in snippets and variables of a markdown file (expand.ts), by its path in docsDir
export function loadTree(docsDir: string, path = "", expand?: (markdown: string, path: string) => string): DocNode[] {
    return readdirSync(join(docsDir, path), {withFileTypes: true})
        .filter(entry => !isHidden(entry.name))
        .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
        .map(entry => {
            const rel = path ? `${path}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                return {name: entry.name, path: rel, isDir: true, frontMatter: {}, children: loadTree(docsDir, rel, expand)};
            }
            if (!isMarkdown(entry.name)) {
                return {name: entry.name, path: rel, isDir: false, frontMatter: {}, children: []};
            }
            const text = readFileSync(join(docsDir, rel), "utf8");
            const markdown = expand ? expand(text, rel) : text;
            return {
                name: entry.name, path: rel, isDir: false, markdown,
                frontMatter: parseFrontMatter(markdown), heading: firstHeading(markdown), children: []
            };
        });
}

// Takes each folder's index.md out of its children: it is the folder's own page
export function attachIndexes(node: DocNode): DocNode {
    if (!node.isDir) return node;
    const index = node.children.find(child => !child.isDir && isIndex(child.name));
    return {
        ...node,
        ...(index ? {index} : {}),
        children: node.children.filter(child => child !== index).map(attachIndexes),
    };
}

// Whether a folder has a page: its index.md, or a markdown page at any depth
export function hasPages(node: DocNode): boolean {
    return !!node.index || node.children.some(child => child.isDir ? hasPages(child) : isMarkdown(child.name));
}

// A folder's title and icon come from its index.md, like a page's
export function resolveDir(node: DocNode): { title: string, icon: string } {
    return {
        title: node.index?.frontMatter.title || node.index?.heading || prettyName(node.name),
        icon: node.index?.frontMatter.icon || "fa-solid fa-folder",
    };
}

// Front matter title, else the first heading, else the file name
export function resolveFile(node: DocNode): { title: string, icon: string } {
    return {
        title: node.frontMatter.title || node.heading || prettyName(node.name),
        icon: node.frontMatter.icon || "fa-solid fa-file"
    };
}

// Entries with an order (front matter of pages, of folders' index.md) come
// first, ascending; the rest keep their alphabetical order after them.
export function sortTree(nodes: DocNode[]): DocNode[] {
    const orderOf = (node: DocNode) => node.isDir ? node.index?.frontMatter.order : node.frontMatter.order;
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
        if (node.isDir) node.children = sortTree(node.children);
    }
    return sorted;
}

export function applyDates(nodes: DocNode[], dates: Map<string, string>) {
    for (const node of nodes) {
        if (node.index) node.index.updated = dates.get(node.index.path);
        if (node.isDir) applyDates(node.children, dates);
        else node.updated = dates.get(node.path);
    }
}

// An index.md with only front matter names the folder; one with text is also its page
const hasText = (index: DocNode | undefined): index is DocNode => !!index && stripFrontMatter(index.markdown ?? "").trim() !== "";

// What the navigation and the pages know about a folder's index.md
function indexInfo(index: DocNode | undefined) {
    if (!hasText(index)) return {};
    return {hasIndex: true, source: index.source ?? index.path, updated: index.updated, ...(index.untranslated ? {untranslated: true} : {})};
}

// Navigation tree for the app: markdown pages and folders that contain pages
export function buildNav(tree: DocNode, prefix = ""): DocItem {
    function walk(nodes: DocNode[], prefix: string): DocItem[] {
        const items: DocItem[] = [];
        for (const node of nodes) {
            if (node.isDir) {
                if (!hasPages(node)) continue;
                const {title, icon} = resolveDir(node);
                const link = `${prefix}/${node.name}`;
                items.push({title, icon, link, displayLink: link, children: walk(node.children, link), ...indexInfo(node.index)});
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

    return {title: "docs", link: "docs", displayLink: "docs", children: walk(tree.children, prefix), ...indexInfo(tree.index)};
}

export function collectPages(tree: DocNode, prefix = "", version = "", language = ""): { pages: Page[], topLevel: Crumb[] } {
    const edition = {version, language, prefix};
    const pages: Page[] = [];

    // A folder's page; with an index.md it carries that page's content
    const folderPage = (node: DocNode, route: string, title: string, icon: string, parents: Crumb[]): Page => ({
        route, title, icon, isDir: true, parents, children: [], ...edition,
        source: hasText(node.index) ? node.index.source ?? node.index.path : node.path,
        frontMatter: node.index?.frontMatter ?? {},
        ...(hasText(node.index) ? {markdown: node.index.markdown, updated: node.index.updated} : {}),
        ...(hasText(node.index) && node.index.untranslated ? {untranslated: true} : {}),
    });

    function walk(nodes: DocNode[], prefix: string, parents: Crumb[]): Crumb[] {
        const children: Crumb[] = [];
        for (const node of nodes) {
            if (node.isDir) {
                if (!hasPages(node)) continue;
                const {title, icon} = resolveDir(node);
                const crumb = {title, route: `${prefix}/${node.name}`};
                const page = folderPage(node, crumb.route, title, icon, parents);
                pages.push(page);
                page.children = walk(node.children, crumb.route, [...parents, crumb]);
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

    // The start page, docs/index.md, at the root of its edition
    const start = hasText(tree.index) ? folderPage(tree, prefix || "/", resolveDir(tree).title, resolveDir(tree).icon, []) : undefined;
    if (start) pages.push(start);
    const topLevel = walk(tree.children, prefix, []);
    if (start) start.children = topLevel;
    return {pages, topLevel};
}

// Values in clay.yaml can be given per language, e.g. title: {en: "Docs",
// de: "Doku"}; missing languages use the default one
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

// Settings that can live in a file of their own, e.g. "variables: variables.yaml"
const SPLITTABLE = new Set(["navbar", "messages", "variables", "head", "analytics", "theme", "generate", "languages"]);

// The settings named by file in clay.yaml, read from those files (relative to
// clay.yaml, inside the project); files lists them for reloads during development
function readSplitFiles(root: string, config: Record<string, unknown>, warnings: string[], files: string[]) {
    for (const [key, value] of Object.entries(config)) {
        if (!SPLITTABLE.has(key) || typeof value !== "string" || !/\.ya?ml$/i.test(value)) continue;
        const file = resolve(root, value);
        const inside = relative(root, file);
        delete config[key];
        if (inside.startsWith("..") || isAbsolute(inside)) {
            warnings.push(`clay.yaml: "${key}" names ${value}, which is outside the project; it is ignored`);
        } else if (!existsSync(file)) {
            warnings.push(`clay.yaml: "${key}" names ${value}, which does not exist; it is ignored`);
        } else {
            config[key] = load(readFileSync(file, "utf8"));
            files.push(inside);
        }
    }
}

export function loadConfig(root: string, env: Record<string, string | undefined> = process.env): { config: Configuration, warnings: string[], files: string[] } {
    const path = join(root, "clay.yaml");
    if (!existsSync(path)) throw new Error(`No clay.yaml found in ${root}`);

    const text = readFileSync(path, "utf8");
    const config = (load(text) ?? {}) as Configuration;
    const warnings: string[] = [];
    const files: string[] = [];
    readSplitFiles(root, config as Record<string, unknown>, warnings, files);
    warnings.push(...unknownKeys(config, configSchema).map(key => `clay.yaml: unknown key "${key}" is ignored (typo?)`));
    if (!config.title) warnings.push(`clay.yaml: "title" is not set`);
    warnings.push(...themeWarnings(config.theme), ...analyticsWarnings(config.analytics, config.siteURL));
    if (config.langs) warnings.push(`clay.yaml: "langs" is no longer needed and is ignored; code languages are detected automatically`);
    if ((config as Record<string, unknown>).index) warnings.push(`clay.yaml: "index" is no longer read since Clay 3; write the start page in docs/index.md`);

    for (const [name, key] of envOverrides) {
        const value = env[name];
        if (value) (config as Record<string, unknown>)[key] = value;
    }
    return {config, warnings, files};
}

export type LoadOptions = {
    env?: Record<string, string | undefined>;
    gitDates?: boolean; // read last-updated dates from git (slow on large histories)
};

// Version names become the first segment of their URLs
export const VERSION_NAME = /^[A-Za-z0-9][\w.-]*$/;
export const RESERVED_NAMES = new Set(["docs", "_clay", "_nuxt"]);

// Older versions: the folders in docs-archive/, newest first
export function listVersions(root: string): { names: string[], warnings: string[] } {
    const warnings: string[] = [];
    if (existsSync(join(root, "versions"))) {
        warnings.push(`versions/ is no longer read since Clay 3; move versions/<name>/docs/ to docs-archive/<name>/`);
    }
    const dir = join(root, "docs-archive");
    if (!existsSync(dir)) return {names: [], warnings};

    const names: string[] = [];
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        if (!entry.isDirectory() || isHidden(entry.name)) continue;
        if (!VERSION_NAME.test(entry.name) || RESERVED_NAMES.has(entry.name)) {
            warnings.push(`docs-archive/${entry.name}: not usable as a version name in URLs; the folder is skipped`);
        } else {
            names.push(entry.name);
        }
    }
    return {names: names.sort((a, b) => b.localeCompare(a, undefined, {numeric: true})), warnings};
}

// The docs of one version in every language: docs/, or docs-archive/<name>/.
// Translations ("setup.de.md") replace their original in their language;
// pages without one show the original there.
function loadVersion(docsDir: string, info: VersionInfo, gitDates: boolean, languages: LanguageInfo[], expand: Expand): {
    version: SiteVersion, editions: SiteEdition[], pages: Page[], warnings: string[]
} {
    const codes = languages.map(language => language.code);
    const warnings: string[] = [];
    const translations = new Map<string, DocNode>();
    const originals = new Set<string>();
    const split = (nodes: DocNode[]): DocNode[] => nodes.flatMap(node => {
        if (node.isDir) return [{...node, children: split(node.children)}];
        if (node.markdown && /^cards\s*:/m.test(splitFrontMatter(node.markdown).frontMatter)) {
            warnings.push(`${node.path}: "cards" is no longer read since Clay 4; it is called "list"`);
        }
        if (translationOf(node.name, codes.slice(1))) {
            translations.set(node.path, node);
            return [];
        }
        if (isMarkdown(node.name)) originals.add(node.path.toLowerCase());
        return [node];
    });
    // Each file gets the variables of its language: a translation those of its own
    const expandFile = (markdown: string, path: string) =>
        expand(markdown, join(docsDir, path), translationOf(basename(path), codes.slice(1)) ?? codes[0]!);
    const tree = attachIndexes({name: "docs", path: "", isDir: true, frontMatter: {}, children: split(loadTree(docsDir, "", expandFile))});
    tree.children = sortTree(tree.children);
    for (const path of translations.keys()) {
        const original = path.replace(/\.[^.]+\.md$/i, ".md");
        if (!originals.has(original.toLowerCase())) warnings.push(`${path}: translates ${original}, which does not exist; the file is skipped`);
    }

    let dates: Map<string, string> | undefined;
    if (gitDates) {
        const result = lastUpdated(docsDir);
        dates = result.dates;
        if (dates) applyDates([tree], dates);
        else if (result.reason) warnings.push(result.reason);
    }

    const translate = (nodes: DocNode[], code: string): DocNode[] => nodes.map(node => translateNode(node, code));
    const translateNode = (node: DocNode, code: string): DocNode => {
        if (node.isDir) {
            return {...node, ...(node.index ? {index: translateNode(node.index, code)} : {}), children: translate(node.children, code)};
        }
        if (!isMarkdown(node.name)) return node;
        const translation = translations.get(node.path.replace(/\.md$/i, `.${code}.md`));
        if (!translation) return {...node, untranslated: true};
        return {
            ...node, markdown: translation.markdown, heading: translation.heading, source: translation.path,
            // The position in the navigation is the same in every language
            frontMatter: {...translation.frontMatter, order: node.frontMatter.order},
            updated: dates?.get(translation.path),
        };
    };

    const editions: SiteEdition[] = [];
    const pages: Page[] = [];
    for (const language of languages) {
        const languageTree = language.code === codes[0] ? tree : translateNode(tree, language.code);
        const prefix = editionPrefix(info.name, language.code, codes[0]!);
        editions.push({prefix, version: info.name, language: language.code, nav: buildNav(languageTree, prefix)});
        pages.push(...collectPages(languageTree, prefix, info.name, language.code).pages);
    }
    return {version: {...info, docsDir, tree, nav: editions[0]!.nav}, editions, pages, warnings};
}

// Loads everything Clay needs from a project: config, directory metadata and
// docs, for the current docs and every older version, in every language
export function loadSite(root: string, {env = process.env, gitDates = true}: LoadOptions = {}): Site {
    const {config: raw, warnings, files: configFiles} = loadConfig(root, env);
    const {languages, warnings: languageWarnings} = siteLanguages(raw);
    warnings.push(...languageWarnings);
    const codes = languages.map(language => language.code);
    const configs = Object.fromEntries(codes.map(code => [code, {...localize(raw, code, codes), lang: code}]));
    const config = configs[codes[0]!]!;

    if (!existsSync(join(root, "docs"))) throw new Error(`No docs/ directory found in ${root}`);
    if (existsSync(join(root, "dir-meta.yaml"))) {
        warnings.push(`dir-meta.yaml is no longer read since Clay 3; give each folder an index.md with its title, icon and order`);
    }
    const expander = createExpander(root, warnings);
    const expand: Expand = (markdown, file, language) => expander.expand(markdown, file, configs[language]?.variables ?? {});
    const current = loadVersion(join(root, "docs"), {name: "", label: config.version || "Latest"}, gitDates, languages, expand);
    warnings.push(...current.warnings);

    const {names, warnings: versionWarnings} = listVersions(root);
    warnings.push(...versionWarnings);
    const topLevel = new Set(current.pages.filter(page => page.parents.length === 0 && !page.prefix && page.route !== "/").map(page => page.route.slice(1)));
    for (const code of codes.slice(1)) {
        if (topLevel.has(code)) warnings.push(`docs/${code} has the same URL as the language ${code}; rename the folder`);
    }
    const older = names.map(name => {
        if (topLevel.has(name)) warnings.push(`docs-archive/${name}: docs/${name} has the same URL as this version; rename one of them`);
        const loaded = loadVersion(join(root, "docs-archive", name), {name, label: name}, gitDates, languages, expand);
        // Git history is reported once, for the current docs
        warnings.push(...loaded.warnings.filter(w => !w.includes("last-updated")).map(w => `docs-archive/${name}/${w}`));
        return loaded;
    });

    const {docsDir, tree, nav} = current.version;
    return {
        root, docsDir, config, configs, tree, nav, languages,
        versions: [current.version, ...older.map(o => o.version)],
        editions: [current.editions, ...older.map(o => o.editions)].flat(),
        pages: [current.pages, ...older.map(o => o.pages)].flat(),
        included: [...expander.included, ...configFiles],
        warnings,
    };
}
