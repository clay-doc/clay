import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {beforeEach, describe, expect, it} from "vitest";
import {
    addLink, docsChanges, getSetting, loadDocsTree, loadSettings, removeLink, saveDocs, saveSettings,
    setSetting, settingRows, settingsChanged, type EditorNode,
} from "../lib/editor";
import {setFrontMatter} from "../lib/front-matter";

let root = "";
const write = (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
};
const read = (path: string) => readFileSync(join(root, path), "utf8");
const titles = (nodes: EditorNode[]): unknown[] => nodes.map(node => node.isDir ? [node.name, titles(node.children)] : node.name);

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "clay-edit-"));
    write({
        "clay.yaml": "# My site\ntitle: \"Docs\" # shown in the navbar\nnavbar:\n  logo: logo.svg\n",
        "dir-meta.yaml": "# folders\n- path: \"guides\"\n  name: \"Guides\"\n  children:",
        "docs/intro.md": "---\ntitle: Intro\norder: 1\n---\n\n# Introduction\n",
        "docs/setup.md": "# Setup\n\nText\n",
        "docs/guides/first.md": "---\nicon: fa-solid fa-star # favourite\n---\n# First\n",
        "docs/guides/img/diagram.png": "",
        "docs/empty/notes.txt": "",
    });
});

describe("setFrontMatter", () => {
    it("replaces, adds and removes keys and keeps other lines", () => {
        const doc = "---\ntitle: Old\n# a comment\nicon: fa-x\n---\nBody\n";
        expect(setFrontMatter(doc, {title: "New: part 2", icon: null, order: 3}))
            .toBe("---\ntitle: \"New: part 2\"\n# a comment\norder: 3\n---\nBody\n");
    });

    it("adds front matter to a document without one, and drops it again when empty", () => {
        expect(setFrontMatter("# Hi\n", {order: 2})).toBe("---\norder: 2\n---\n# Hi\n");
        expect(setFrontMatter("# Hi\n", {title: null})).toBe("# Hi\n");
    });

    it("keeps Windows line endings", () => {
        expect(setFrontMatter("---\r\ntitle: A\r\n---\r\nBody", {title: "B"})).toBe("---\r\ntitle: B\r\n---\r\nBody");
    });
});

describe("docs tree", () => {
    it("lists pages and folders with pages in navigation order", () => {
        expect(titles(loadDocsTree(root))).toEqual(["intro.md", ["guides", ["first.md"]], "setup.md"]);
    });

    it("saves nothing when nothing changed", () => {
        const tree = loadDocsTree(root);
        expect(docsChanges(tree, structuredClone(tree))).toEqual([]);
    });

    it("numbers all entries of a folder whose order changed", () => {
        const original = loadDocsTree(root);
        const tree = structuredClone(original);
        tree.reverse(); // setup, guides, intro
        const written = saveDocs(root, docsChanges(original, tree));

        expect(written.sort()).toEqual(["dir-meta.yaml", "docs/intro.md", "docs/setup.md"]);
        expect(read("docs/setup.md")).toBe("---\norder: 1\n---\n# Setup\n\nText\n");
        expect(read("docs/intro.md")).toBe("---\ntitle: Intro\norder: 3\n---\n\n# Introduction\n");
        expect(read("dir-meta.yaml")).toBe("# folders\n- path: \"guides\"\n  name: \"Guides\"\n  children:\n  order: 2");
        expect(titles(loadDocsTree(root))).toEqual(["setup.md", ["guides", ["first.md"]], "intro.md"]);
    });

    it("writes titles and icons of pages and folders; empty values fall back again", () => {
        const original = loadDocsTree(root);
        const tree = structuredClone(original);
        tree[0]!.title = undefined;
        tree[1]!.icon = "fa-solid fa-book";
        tree[1]!.children[0]!.title = "First steps";
        saveDocs(root, docsChanges(original, tree));

        expect(read("docs/intro.md")).toBe("---\norder: 1\n---\n\n# Introduction\n");
        expect(read("docs/guides/first.md")).toBe("---\nicon: fa-solid fa-star # favourite\ntitle: First steps\n---\n# First\n");
        expect(read("dir-meta.yaml")).toContain("  name: \"Guides\"\n  children:\n  icon: fa-solid fa-book");
        expect(loadDocsTree(root)[0]!.fallbackTitle).toBe("Introduction");
    });

    it("creates dir-meta.yaml entries for nested folders", () => {
        write({"dir-meta.yaml": "", "docs/guides/deep/page.md": "# Deep\n"});
        const original = loadDocsTree(root);
        const tree = structuredClone(original);
        const guides = tree.find(node => node.name === "guides")!;
        guides.children.find(node => node.name === "deep")!.title = "Deep dive";
        saveDocs(root, docsChanges(original, tree));

        // Without an entry for "guides", "deep" is looked up at the top level
        expect(read("dir-meta.yaml")).toBe("- path: deep\n  name: Deep dive\n");
        expect(loadDocsTree(root).find(node => node.name === "guides")!.children[0]!.title).toBe("Deep dive");
    });

    it("keeps subfolder entries working when a folder gets its first entry", () => {
        write({"dir-meta.yaml": "- path: deep\n  name: Deep dive\n", "docs/guides/deep/page.md": "# Deep\n"});
        const original = loadDocsTree(root);
        const tree = structuredClone(original);
        tree.find(node => node.name === "guides")!.title = "All guides";
        saveDocs(root, docsChanges(original, tree));

        const guides = loadDocsTree(root).find(node => node.name === "guides")!;
        expect(guides.title).toBe("All guides");
        expect(guides.children.find(node => node.name === "deep")!.title).toBe("Deep dive");
    });
});

describe("settings", () => {
    it("edits values and keeps comments and quoting", () => {
        const settings = loadSettings(root);
        expect(settingsChanged(settings)).toBe(false);
        setSetting(settings.doc, ["title"], "Handbook");
        setSetting(settings.doc, ["index", "title"], "Welcome");
        expect(saveSettings(root, settings)).toBe(true);
        expect(read("clay.yaml")).toBe(
            "# My site\ntitle: \"Handbook\" # shown in the navbar\nnavbar:\n  logo: logo.svg\nindex:\n  title: Welcome\n");
    });

    it("removes emptied values and the sections they leave empty", () => {
        const settings = loadSettings(root);
        setSetting(settings.doc, ["navbar", "logo"], "");
        saveSettings(root, settings);
        expect(read("clay.yaml")).toBe("# My site\ntitle: \"Docs\" # shown in the navbar\n");
    });

    it("adds and removes navbar links", () => {
        const settings = loadSettings(root);
        addLink(settings.doc);
        addLink(settings.doc);
        setSetting(settings.doc, ["navbar", "links", 1, "name"], "Blog");
        removeLink(settings.doc, 0);
        expect(getSetting(settings.doc, ["navbar", "links", 0, "name"])).toBe("Blog");
        expect(settingRows(settings.doc).filter(row => row.kind === "field" && row.link !== undefined)).toHaveLength(3);
    });
});
