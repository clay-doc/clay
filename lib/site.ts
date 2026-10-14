import {existsSync, readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {load} from "js-yaml";
import {Marked} from "marked";
import {inlineText} from "../common/markdown-text";
import type {DocItem} from "../common/nav";
import type {Configuration} from "../common/configuration";
import {parseFrontMatter, stripFrontMatter, type FrontMatter} from "./front-matter";
import {lastUpdated} from "./git-dates";
import {configSchema, dirMetaSchema, unknownKeys} from "./checks";

// Directory metadata from dir-meta.yaml
export type DirMeta = {
    path: string;
    name?: string;
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
};

export type Site = {
    root: string;
    docsDir: string;
    config: Configuration;
    meta: DirMeta[];
    tree: DocNode;
    nav: DocItem;
    pages: Page[];
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
    if (entry) return {title: entry.name ?? prettyName(node.name), icon: entry.icon ?? "fa-solid fa-folder", childMeta: entry.children};
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
export function buildNav(tree: DocNode, meta: DirMeta[]): DocItem {
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
                items.push({title, icon, link, displayLink: link.replace(/\.md$/, ""), children: undefined, updated: node.updated});
            }
        }
        return items;
    }

    return {title: "docs", link: "docs", displayLink: "docs", children: walk(tree.children, meta, "")};
}

export function collectPages(tree: DocNode, meta: DirMeta[]): { pages: Page[], topLevel: Crumb[] } {
    const pages: Page[] = [];

    function walk(nodes: DocNode[], meta: DirMeta[] | undefined, prefix: string, parents: Crumb[]): Crumb[] {
        const children: Crumb[] = [];
        for (const node of nodes) {
            if (node.isDir) {
                if (!hasPages(node)) continue;
                const {title, icon, childMeta} = resolveDir(node, meta);
                const crumb = {title, route: `${prefix}/${node.name}`};
                const page: Page = {route: crumb.route, source: node.path, title, icon, isDir: true, parents, children: [], frontMatter: {}};
                pages.push(page);
                page.children = walk(node.children, childMeta, crumb.route, [...parents, crumb]);
                children.push(crumb);
            } else if (isMarkdown(node.name)) {
                const {title, icon} = resolveFile(node);
                // Links drop a lowercase ".md", like the navigation does
                const crumb = {title, route: `${prefix}/${node.name.replace(/\.md$/, "")}`};
                pages.push({
                    route: crumb.route, source: node.path, title, icon, isDir: false, parents, children: [],
                    markdown: node.markdown, frontMatter: node.frontMatter, updated: node.updated
                });
                children.push(crumb);
            }
        }
        return children;
    }

    return {pages, topLevel: walk(tree.children, meta, "", [])};
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

// Loads everything Clay needs from a project: config, directory metadata and docs
export function loadSite(root: string, {env = process.env, gitDates = true}: LoadOptions = {}): Site {
    const docsDir = join(root, "docs");
    if (!existsSync(docsDir)) throw new Error(`No docs/ directory found in ${root}`);

    const {config, warnings} = loadConfig(root, env);
    const {meta, warnings: metaWarnings} = loadDirMeta(root);
    warnings.push(...metaWarnings);

    const tree: DocNode = {name: "docs", path: "", isDir: true, frontMatter: {}, children: loadTree(docsDir)};
    tree.children = sortTree(tree.children, meta);

    if (gitDates) {
        const {dates, reason} = lastUpdated(docsDir);
        if (dates) applyDates(tree.children, dates);
        else if (reason) warnings.push(reason);
    }

    const nav = buildNav(tree, meta);
    const {pages} = collectPages(tree, meta);
    return {root, docsDir, config, meta, tree, nav, pages, warnings};
}
