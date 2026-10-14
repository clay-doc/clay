import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap, type YAMLSeq} from "yaml";
import {setFrontMatter} from "./front-matter";
import {
    hasPages, isMarkdown, loadConfig, loadDirMeta, loadTree, localize, prettyName, resolveDir, siteLanguages, sortTree, translationOf,
    type DirMeta, type DocNode,
} from "./site";

// Codes of the site's languages, the default first; the editor edits the default language
function languageCodes(root: string): string[] {
    return siteLanguages(loadConfig(root, {}).config).languages.map(language => language.code);
}

// Model of "clay edit". Edits are made on a copy of what was loaded and compared
// with it on save, so only changed values are written and comments, quoting and
// formatting of the files stay as they were.

// A page or folder in the order of the navigation
export type EditorNode = {
    path: string; // relative to docs/
    name: string;
    isDir: boolean;
    title?: string; // front matter title, or the folder name in dir-meta.yaml
    icon?: string;
    order?: number;
    fallbackTitle: string; // what the site shows when no title is set
    children: EditorNode[];
};

// What saving writes for one page or folder; null removes a key
export type DocChange = {
    path: string;
    isDir: boolean;
    updates: Record<string, string | number | null>;
    subdirs: string[];
};

export function loadDocsTree(root: string): EditorNode[] {
    const docsDir = join(root, "docs");
    if (!existsSync(docsDir)) throw new Error(`No docs/ directory found in ${root}`);
    const {meta} = loadDirMeta(root);
    const codes = languageCodes(root);
    // Folder names given per language show (and are edited) in the default language
    const localMeta = localize(meta, codes[0]!, codes);

    const convert = (nodes: DocNode[], meta: DirMeta[] | undefined): EditorNode[] => nodes.flatMap(node => {
        if (node.isDir) {
            if (!hasPages(node)) return [];
            const entry = meta?.find(m => m.path === node.name);
            return [{
                path: node.path, name: node.name, isDir: true, title: entry?.name as string | undefined, icon: entry?.icon, order: entry?.order,
                fallbackTitle: prettyName(node.name), children: convert(node.children, resolveDir(node, meta).childMeta),
            }];
        }
        // Translations ("setup.de.md") follow their original
        if (!isMarkdown(node.name) || translationOf(node.name, codes.slice(1))) return [];
        return [{
            path: node.path, name: node.name, isDir: false, title: node.frontMatter.title || undefined,
            icon: node.frontMatter.icon || undefined, order: node.frontMatter.order,
            fallbackTitle: node.heading || prettyName(node.name), children: [],
        }];
    });
    return convert(sortTree(loadTree(docsDir), localMeta), localMeta);
}

// Differences between the loaded tree and the edited one. A folder whose
// entries were moved gets order 1..n for all of them.
export function docsChanges(original: EditorNode[], current: EditorNode[]): DocChange[] {
    const before = new Map<string, EditorNode>();
    const index = (nodes: EditorNode[]) => nodes.forEach(node => {
        before.set(node.path, node);
        index(node.children);
    });
    index(original);

    const changes = new Map<string, DocChange>();
    const update = (node: EditorNode, key: string, value: string | number | null) => {
        const subdirs = node.children.filter(child => child.isDir).map(child => child.name);
        const change = changes.get(node.path) ?? {path: node.path, isDir: node.isDir, updates: {}, subdirs};
        change.updates[key] = value;
        changes.set(node.path, change);
    };

    const walk = (nodes: EditorNode[], originals: EditorNode[]) => {
        const moved = nodes.some((node, i) => node.path !== originals[i]?.path);
        nodes.forEach((node, i) => {
            const old = before.get(node.path)!;
            if ((node.title ?? "") !== (old.title ?? "")) update(node, node.isDir ? "name" : "title", node.title || null);
            if ((node.icon ?? "") !== (old.icon ?? "")) update(node, "icon", node.icon || null);
            if (moved && node.order !== i + 1) update(node, "order", i + 1);
            if (node.isDir) walk(node.children, old.children);
        });
    };
    walk(current, original);
    return [...changes.values()];
}

// Writes the changes; returns the files written, relative to the project
export function saveDocs(root: string, changes: DocChange[]): string[] {
    const written: string[] = [];
    for (const change of changes.filter(change => !change.isDir)) {
        const file = join(root, "docs", change.path);
        writeFileSync(file, setFrontMatter(readFileSync(file, "utf8"), change.updates));
        written.push(`docs/${change.path}`);
    }

    // Parents first, so their new entries exist before their subfolders are looked up
    const dirChanges = changes.filter(change => change.isDir).sort((a, b) => a.path.split("/").length - b.path.split("/").length);
    if (dirChanges.length > 0) {
        const file = join(root, "dir-meta.yaml");
        const text = existsSync(file) ? readFileSync(file, "utf8") : "";
        const doc = text.trim() ? parseDocument(text) : new Document([]);
        if (!isSeq(doc.contents)) throw new Error("dir-meta.yaml must be a list of folders");
        const defaultLanguage = languageCodes(root)[0]!;
        for (const change of dirChanges) {
            const entry = metaEntry(doc, change.path, change.subdirs);
            for (const [key, value] of Object.entries(change.updates)) {
                // A name given per language only changes in the default language
                const node = entry.get(key, true);
                if (isMap(node)) setValue(node, defaultLanguage, value);
                else setValue(entry, key, value);
            }
        }
        writeYaml(file, doc, text);
        written.push("dir-meta.yaml");
    }
    return written;
}

const findEntry = (level: YAMLSeq, name: string) =>
    level.items.find((item): item is YAMLMap => isMap(item) && item.get("path") === name);

// The dir-meta.yaml entry of a folder, looked up like the site does: a folder
// without an entry passes its own level on to its subfolders
function metaEntry(doc: Document, path: string, subdirs: string[]): YAMLMap {
    let level = doc.contents as YAMLSeq;
    const names = path.split("/");
    for (const [i, name] of names.entries()) {
        const entry = findEntry(level, name);
        if (i === names.length - 1) {
            if (entry) return entry;
            const created = doc.createNode({path: name}) as YAMLMap;
            // Subfolders were looked up in this level so far; they keep their entries
            const inherited = subdirs.map(sub => findEntry(level, sub)).filter(found => found !== undefined);
            if (inherited.length > 0) created.set("children", doc.createNode(inherited.map(found => found.toJSON())));
            level.add(created);
            return created;
        }
        if (entry) {
            if (!isSeq(entry.get("children"))) entry.set("children", doc.createNode([]));
            level = entry.get("children") as YAMLSeq;
        }
    }
    throw new Error(`Empty folder path`);
}

// Keeps the quoting of existing values
function setValue(map: YAMLMap, key: string, value: string | number | null) {
    const node = map.get(key, true);
    if (value === null) map.delete(key);
    else if (isScalar(node)) node.value = value;
    else map.set(key, value);
}

function writeYaml(file: string, doc: Document, original: string) {
    const text = doc.toString({lineWidth: 0});
    writeFileSync(file, original && !original.endsWith("\n") ? text.replace(/\n$/, "") : text);
}

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
    ["Landing page", [["Title", ["index", "title"]], ["Description", ["index", "description"]], ["Icon", ["index", "icon"]]]],
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

export function getSetting(doc: Document, path: (string | number)[]): string {
    const value = doc.getIn(path);
    return value === null || value === undefined ? "" : String(value);
}

// An empty value removes the key, and maps or lists it leaves empty
export function setSetting(doc: Document, path: (string | number)[], value: string) {
    if (value !== "") {
        const node = doc.getIn(path, true);
        if (isScalar(node)) node.value = value;
        else doc.setIn(path, value);
        return;
    }
    doc.deleteIn(path);
    for (let parent = path.slice(0, -1); parent.length > 0; parent = parent.slice(0, -1)) {
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
    return doc.toString({lineWidth: 0}).replace(/\n$/, "") !== text.replace(/\n$/, "");
}

export function saveSettings(root: string, settings: Settings): boolean {
    if (!settingsChanged(settings)) return false;
    writeYaml(join(root, "clay.yaml"), settings.doc, settings.text);
    return true;
}
