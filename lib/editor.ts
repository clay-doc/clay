import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, posix, relative as relativePath} from "node:path";
import {Document, isMap, isScalar, isSeq, parseDocument, type YAMLSeq} from "yaml";
import {setFrontMatter, type FrontMatter} from "./front-matter";
import {
    attachIndexes, hasPages, isMarkdown, listVersions, loadConfig, loadSite, loadTree, prettyName, siteLanguages, sortTree,
    translationOf, type DocNode,
} from "./site";
import {brokenLinks} from "./checks";

// Model of "clay edit": the docs of one version in one language, and clay.yaml.
// Every change is written right away, and only the values that change: the
// rest of each file (comments, quoting, order of keys) stays as it was.

export type Edition = { version: string, language: string }; // version "" is the current docs

// A page, a folder, or the start page (docs/index.md) as the editor shows it
export type EditorNode = {
    path: string; // relative to docs/: the page's file, the folder, or "" for the start page
    name: string;
    kind: "page" | "folder" | "start";
    file: string; // the file holding the front matter in this language: page, translation or index.md
    exists: boolean; // whether that file exists yet (a translation or index.md may not)
    frontMatter: FrontMatter;
    order?: number; // from the default language: the order is the same in every language
    fallbackTitle: string; // what the site shows when no title is set
    children: EditorNode[];
};

export type FrontMatterUpdates = Record<string, string | number | boolean | null>;

export function editorContext(root: string): { versions: string[], languages: string[] } {
    const {config} = loadConfig(root, {});
    return {
        versions: ["", ...listVersions(root).names],
        languages: siteLanguages(config).languages.map(language => language.code),
    };
}

export const docsDirOf = (root: string, version: string) => version ? join(root, "versions", version, "docs") : join(root, "docs");

const translationPath = (path: string, language: string, defaultLanguage: string) =>
    language === defaultLanguage ? path : path.replace(/\.md$/i, `.${language}.md`);

export function loadDocsTree(root: string, edition: Edition): EditorNode[] {
    const docsDir = docsDirOf(root, edition.version);
    if (!existsSync(docsDir)) throw new Error(`No docs folder at ${docsDir}`);
    const {languages} = editorContext(root);
    const defaultLanguage = languages[0]!;

    // Translations are kept aside; each entry shows the file of the chosen language
    const files = new Map<string, DocNode>();
    const split = (nodes: DocNode[]): DocNode[] => nodes.flatMap(node => {
        if (node.isDir) return [{...node, children: split(node.children)}];
        files.set(node.path, node);
        return translationOf(node.name, languages.slice(1)) ? [] : [node];
    });
    const tree = attachIndexes({name: "docs", path: "", isDir: true, frontMatter: {}, children: split(loadTree(docsDir))});
    tree.children = sortTree(tree.children);

    const entry = (path: string, name: string, kind: EditorNode["kind"], file: string, original: DocNode | undefined,
                   fallbackTitle: string, children: EditorNode[]): EditorNode => {
        const own = files.get(translationPath(file, edition.language, defaultLanguage));
        return {
            path, name, kind, file: translationPath(file, edition.language, defaultLanguage), exists: !!own,
            frontMatter: own?.frontMatter ?? {}, order: original?.frontMatter.order,
            fallbackTitle: own?.heading || original?.heading || fallbackTitle, children,
        };
    };
    const convert = (nodes: DocNode[]): EditorNode[] => nodes.flatMap(node => {
        if (node.isDir) {
            if (!hasPages(node)) return [];
            return [entry(node.path, node.name, "folder", `${node.path}/index.md`, node.index, prettyName(node.name), convert(node.children))];
        }
        if (!isMarkdown(node.name)) return [];
        return [entry(node.path, node.name, "page", node.path, node, prettyName(node.name), [])];
    });
    return [entry("", "index.md", "start", "index.md", tree.index, "Start page", []), ...convert(tree.children)];
}

// Sets (null removes) front matter fields of an entry in the edition's language.
// A missing translation is created from the original first; a folder without
// index.md gets one with just the front matter.
export function setFields(root: string, edition: Edition, node: EditorNode, updates: FrontMatterUpdates): string {
    const docsDir = docsDirOf(root, edition.version);
    const target = join(docsDir, node.file);
    let content = "";
    if (existsSync(target)) content = readFileSync(target, "utf8");
    else {
        const original = join(docsDir, node.kind === "page" ? node.path : join(node.path, "index.md"));
        if (existsSync(original)) content = readFileSync(original, "utf8");
        mkdirSync(dirname(target), {recursive: true});
    }
    writeFileSync(target, setFrontMatter(content, updates));
    return relative(root, target);
}

// Numbers the entries of a folder 1..n in their current order; writes the
// originals (the order is shared by all languages), only where it changed
export function reorder(root: string, version: string, siblings: EditorNode[]): string[] {
    const docsDir = docsDirOf(root, version);
    const written: string[] = [];
    siblings.filter(node => node.kind !== "start").forEach((node, i) => {
        if (node.order === i + 1) return;
        const file = join(docsDir, node.kind === "page" ? node.path : join(node.path, "index.md"));
        const content = existsSync(file) ? readFileSync(file, "utf8") : "";
        writeFileSync(file, setFrontMatter(content, {order: i + 1}));
        node.order = i + 1;
        written.push(relative(root, file));
    });
    return written;
}

// "Getting Started!" becomes "getting-started"
export function slugify(title: string): string {
    return title.replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

const nextOrder = (siblings: EditorNode[]) => {
    const orders = siblings.map(node => node.order).filter((order): order is number => order !== undefined);
    return orders.length > 0 ? Math.max(...orders) + 1 : undefined;
};

// A new page in a folder ("" for the top level), with its title as front matter and heading
export function createPage(root: string, version: string, folder: string, title: string, slug: string, siblings: EditorNode[]): string {
    const path = posix.join(folder, `${slug}.md`);
    const file = join(docsDirOf(root, version), path);
    if (existsSync(file)) throw new Error(`${path} already exists`);
    const order = nextOrder(siblings);
    const frontMatter = `---\ntitle: ${JSON.stringify(title)}\n${order === undefined ? "" : `order: ${order}\n`}---\n`;
    mkdirSync(dirname(file), {recursive: true});
    writeFileSync(file, `${frontMatter}\n# ${title}\n`);
    return relative(root, file);
}

// A new folder with an index.md that names it and introduces its pages
export function createFolder(root: string, version: string, parent: string, title: string, slug: string, siblings: EditorNode[]): string {
    const path = posix.join(parent, slug);
    const dir = join(docsDirOf(root, version), path);
    if (existsSync(dir)) throw new Error(`${path}/ already exists`);
    const order = nextOrder(siblings);
    mkdirSync(dir, {recursive: true});
    const frontMatter = `---\ntitle: ${JSON.stringify(title)}\n${order === undefined ? "" : `order: ${order}\n`}cards: true\n---\n`;
    writeFileSync(join(dir, "index.md"), `${frontMatter}\n# ${title}\n`);
    return relative(root, join(dir, "index.md"));
}

// Copies the original into the edition's language, as the start of a translation
export function createTranslation(root: string, edition: Edition, node: EditorNode): string {
    const docsDir = docsDirOf(root, edition.version);
    const target = join(docsDir, node.file);
    if (existsSync(target)) throw new Error(`${node.file} already exists`);
    const original = join(docsDir, node.kind === "page" ? node.path : join(node.path, "index.md"));
    if (!existsSync(original)) throw new Error(`There is no original to translate`);
    copyFileSync(original, target);
    return relative(root, target);
}

// The files that belong to a page in every language: setup.md, setup.de.md, …
function pageFiles(docsDir: string, path: string, languages: string[]): string[] {
    return [path, ...languages.slice(1).map(language => path.replace(/\.md$/i, `.${language}.md`))]
        .filter(file => existsSync(join(docsDir, file)));
}

// Renames or moves a page with its translations, or a folder with everything in
// it. Links to it are not rewritten; the result lists the ones that broke.
export function moveEntry(root: string, version: string, node: EditorNode, folder: string, slug: string): { moved: string[], broken: string[] } {
    if (node.kind === "start") throw new Error("The start page cannot be moved");
    const docsDir = docsDirOf(root, version);
    const before = brokenIn(root, version);
    const moved: string[] = [];
    if (node.kind === "folder") {
        const target = posix.join(folder, slug);
        if (target === node.path || target.startsWith(node.path + "/")) throw new Error("A folder cannot move into itself");
        if (existsSync(join(docsDir, target))) throw new Error(`${target}/ already exists`);
        mkdirSync(dirname(join(docsDir, target)), {recursive: true});
        renameSync(join(docsDir, node.path), join(docsDir, target));
        moved.push(`${node.path}/ → ${target}/`);
    } else {
        const {languages} = editorContext(root);
        const base = node.path.replace(/\.md$/i, "");
        for (const file of pageFiles(docsDir, node.path, languages)) {
            const target = posix.join(folder, slug + file.slice(base.length));
            if (existsSync(join(docsDir, target))) throw new Error(`${target} already exists`);
            mkdirSync(dirname(join(docsDir, target)), {recursive: true});
            renameSync(join(docsDir, file), join(docsDir, target));
            moved.push(`${file} → ${target}`);
        }
    }
    return {moved, broken: brokenIn(root, version).filter(link => !before.includes(link))};
}

// Deletes a page with its translations, or a folder with everything in it
export function deleteEntry(root: string, version: string, node: EditorNode): { deleted: string[], broken: string[] } {
    if (node.kind === "start") throw new Error("Delete docs/index.md in your editor; the start page then lists the top-level pages");
    const docsDir = docsDirOf(root, version);
    const before = brokenIn(root, version);
    let deleted: string[];
    if (node.kind === "folder") {
        rmSync(join(docsDir, node.path), {recursive: true});
        deleted = [`${node.path}/`];
    } else {
        deleted = pageFiles(docsDir, node.path, editorContext(root).languages);
        for (const file of deleted) rmSync(join(docsDir, file));
    }
    return {deleted, broken: brokenIn(root, version).filter(link => !before.includes(link))};
}

// Number of pages and files a folder holds, to say what deleting it means
export function countFiles(root: string, version: string, folder: string): number {
    const walk = (dir: string): number => readdirSync(dir, {withFileTypes: true})
        .reduce((sum, entry) => sum + (entry.isDirectory() ? walk(join(dir, entry.name)) : 1), 0);
    return walk(join(docsDirOf(root, version), folder));
}

function brokenIn(root: string, version: string): string[] {
    const site = loadSite(root, {gitDates: false, env: {}});
    const pages = site.pages.filter(page => page.version === version);
    return brokenLinks(pages, Object.fromEntries(site.versions.map(v => [v.name, v.docsDir])));
}

// A written file, as shown to the user: relative to the project, with forward slashes
const relative = (root: string, file: string) => relativePath(root, file).split("\\").join("/");

// clay.yaml

export type Settings = { doc: Document, text: string };
export type SettingRow =
    | { kind: "section", label: string }
    | { kind: "field", label: string, path: (string | number)[], link?: number }
    | { kind: "add-link", label: string };

const FIELDS: [string, [string, string[]][]][] = [
    ["Site", [
        ["Title", ["title"]], ["Favicon", ["favicon"]], ["Base URL", ["baseURL"]], ["Site URL", ["siteURL"]],
        ["Language", ["lang"]], ["Edit URL", ["editURL"]], ["Font Awesome kit", ["fontawesomeKit"]],
        ["Version label", ["version"]],
    ]],
    ["Navbar", [
        ["Logo", ["navbar", "logo"]], ["Source name", ["navbar", "source", "name"]],
        ["Source icon", ["navbar", "source", "icon"]], ["Source link", ["navbar", "source", "link"]],
    ]],
];

export function loadSettings(root: string): Settings {
    const text = readFileSync(join(root, "clay.yaml"), "utf8");
    const doc = parseDocument(text);
    if (doc.errors.length > 0) throw new Error(`clay.yaml: ${doc.errors[0]!.message}`);
    return {doc, text};
}

export function settingRows(doc: Document): SettingRow[] {
    const rows: SettingRow[] = [];
    for (const [section, fields] of FIELDS) {
        rows.push({kind: "section", label: section});
        for (const [label, path] of fields) rows.push({kind: "field", label, path});
        if (section !== "Navbar") continue;
        const links = doc.getIn(["navbar", "links"]);
        const count = isSeq(links) ? links.items.length : 0;
        for (let link = 0; link < count; link++) {
            for (const key of ["name", "icon", "link"]) {
                rows.push({kind: "field", label: `Link ${link + 1} ${key}`, path: ["navbar", "links", link, key], link});
            }
        }
        rows.push({kind: "add-link", label: "Add link"});
    }
    return rows;
}

// A value given per language ({en: …, de: …}) is read and written in the given language
function localPath(doc: Document, path: (string | number)[], language?: string): (string | number)[] {
    const node = doc.getIn(path, true);
    return language && isMap(node) ? [...path, language] : path;
}

export function getSetting(doc: Document, path: (string | number)[], language?: string): string {
    const value = doc.getIn(localPath(doc, path, language));
    return value === null || value === undefined || typeof value === "object" ? "" : String(value);
}

// An empty value removes the key, and maps or lists it leaves empty
export function setSetting(doc: Document, path: (string | number)[], value: string, language?: string) {
    const target = localPath(doc, path, language);
    if (value !== "") {
        const node = doc.getIn(target, true);
        if (isScalar(node)) node.value = value;
        else doc.setIn(target, value);
        return;
    }
    doc.deleteIn(target);
    for (let parent = target.slice(0, -1); parent.length > 0; parent = parent.slice(0, -1)) {
        const node = doc.getIn(parent);
        if ((isMap(node) || isSeq(node)) && node.items.length === 0) doc.deleteIn(parent);
        else break;
    }
}

export function addLink(doc: Document) {
    if (!isSeq(doc.getIn(["navbar", "links"]))) doc.setIn(["navbar", "links"], doc.createNode([]));
    (doc.getIn(["navbar", "links"]) as YAMLSeq).add(doc.createNode({name: "New link", icon: "fa-solid fa-link", link: "https://"}));
}

export function removeLink(doc: Document, link: number) {
    setSetting(doc, ["navbar", "links", link], "");
}

export function settingsChanged({doc, text}: Settings): boolean {
    return doc.toString({lineWidth: 0, flowCollectionPadding: false}).replace(/\n$/, "") !== text.replace(/\n$/, "");
}

export function saveSettings(root: string, settings: Settings): boolean {
    if (!settingsChanged(settings)) return false;
    const text = settings.doc.toString({lineWidth: 0, flowCollectionPadding: false});
    writeFileSync(join(root, "clay.yaml"), settings.text && !settings.text.endsWith("\n") ? text.replace(/\n$/, "") : text);
    return true;
}

