import {existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {beforeEach, describe, expect, it} from "vitest";
import {
    addLink, createFolder, createPage, createTranslation, deleteEntry, getSetting, loadDocsTree, loadSettings, moveEntry,
    removeLink, reorder, saveSettings, setFields, setSetting, settingRows, settingsChanged, slugify, type EditorNode,
} from "../../lib/editor";
import {setFrontMatter} from "../../lib/front-matter";
import {applyLayout, checkVersionName, planLayout, saveVersion} from "../../lib/versions";

let root = "";
const write = (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
};
const read = (path: string) => readFileSync(join(root, path), "utf8");
const names = (nodes: EditorNode[]): unknown[] => nodes.map(node => node.kind === "folder" ? [node.name, names(node.children)] : node.name);
const en = {version: "", language: "en"};
const de = {version: "", language: "de"};

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "clay-edit-"));
    write({
        "clay.yaml": "# My site\ntitle: \"Docs\" # shown in the navbar\nlanguages: [en, de]\nnavbar:\n  logo: logo.svg\n  source:\n    name:\n      en: Source\n      de: Quelle\n",
        "docs/index.md": "---\nhero: true\n---\n\nWelcome.\n",
        "docs/intro.md": "---\ntitle: Intro\norder: 1\n---\n\n# Introduction\n",
        "docs/intro.de.md": "---\ntitle: Einführung\n---\n\n# Einführung\n",
        "docs/setup.md": "# Setup\n\nText\n",
        "docs/guides/index.md": "---\ntitle: \"Guides\"\n# shown in the sidebar\n---\n",
        "docs/guides/first.md": "---\nicon: fa-solid fa-star # favourite\n---\n# First\n",
        "docs/guides/img/diagram.png": "",
        "docs/empty/notes.txt": "",
    });
});

describe("setFrontMatter", () => {
    it("replaces, adds and removes keys and keeps other lines", () => {
        const doc = "---\ntitle: Old\n# a comment\nicon: fa-x\n---\nBody\n";
        expect(setFrontMatter(doc, {title: "New: part 2", icon: null, order: 3, list: true}))
            .toBe("---\ntitle: \"New: part 2\"\n# a comment\norder: 3\nlist: true\n---\nBody\n");
    });

    it("adds front matter to a document without one, and drops it again when empty", () => {
        expect(setFrontMatter("# Hi\n", {order: 2})).toBe("---\norder: 2\n---\n# Hi\n");
        expect(setFrontMatter("# Hi\n", {title: null})).toBe("# Hi\n");
    });

    it("writes lists on one line, replacing a list written below its key", () => {
        const doc = "---\nredirects:\n  - /a\n  - /b\ntitle: T\n---\n";
        expect(setFrontMatter(doc, {redirects: ["/a", "/c"]})).toBe('---\nredirects: ["/a", "/c"]\ntitle: T\n---\n');
        expect(setFrontMatter(doc, {redirects: null})).toBe("---\ntitle: T\n---\n");
    });

    it("keeps Windows line endings", () => {
        expect(setFrontMatter("---\r\ntitle: A\r\n---\r\nBody", {title: "B"})).toBe("---\r\ntitle: B\r\n---\r\nBody");
    });
});

describe("docs tree", () => {
    it("lists the start page, pages and folders in navigation order", () => {
        const tree = loadDocsTree(root, en);
        expect(names(tree)).toEqual(["index.md", "intro.md", ["guides", ["first.md"]], "setup.md"]);
        expect(tree[0]).toMatchObject({kind: "start", file: "index.md", exists: true, frontMatter: {hero: true}});
        expect(tree[2]).toMatchObject({kind: "folder", file: "guides/index.md", exists: true, frontMatter: {title: "Guides"}});
    });

    it("shows the files of another language, and which translations are missing", () => {
        const tree = loadDocsTree(root, de);
        expect(tree[1]).toMatchObject({file: "intro.de.md", exists: true, frontMatter: {title: "Einführung"}, order: 1});
        expect(tree[3]).toMatchObject({file: "setup.de.md", exists: false, fallbackTitle: "Setup"});
    });

    it("shows older versions, and edits the latest in docs/latest/", () => {
        applyLayout(root, planLayout(root)!);
        write({"docs/1.x/old.md": "# Old\n"});
        expect(names(loadDocsTree(root, {version: "1.x", language: "en"}))).toEqual(["index.md", "old.md"]);
        expect(setFields(root, en, loadDocsTree(root, en)[1]!, {order: 5})).toBe("docs/latest/intro.md");
    });
});

describe("editing", () => {
    it("sets and removes front matter fields, keeping comments and quoting", () => {
        const tree = loadDocsTree(root, en);
        expect(setFields(root, en, tree[2]!.children[0]!, {title: "First steps", icon: null})).toBe("docs/guides/first.md");
        expect(read("docs/guides/first.md")).toBe("---\ntitle: First steps\n---\n# First\n");
        setFields(root, en, tree[2]!, {icon: "fa-solid fa-book", order: 2});
        expect(read("docs/guides/index.md")).toBe("---\ntitle: \"Guides\"\n# shown in the sidebar\nicon: fa-solid fa-book\norder: 2\n---\n");
    });

    it("creates a missing translation from the original when a field is set", () => {
        const setup = loadDocsTree(root, de)[3]!;
        expect(setFields(root, de, setup, {title: "Einrichtung"})).toBe("docs/setup.de.md");
        expect(read("docs/setup.de.md")).toBe("---\ntitle: Einrichtung\n---\n# Setup\n\nText\n");
    });

    it("creates an index.md for a folder that has none", () => {
        write({"docs/reference/api.md": "# API\n"});
        const reference = loadDocsTree(root, en).find(node => node.name === "reference")!;
        expect(reference).toMatchObject({exists: false, fallbackTitle: "Reference"});
        setFields(root, en, reference, {title: "Reference", icon: "fa-solid fa-book"});
        expect(read("docs/reference/index.md")).toBe("---\ntitle: Reference\nicon: fa-solid fa-book\n---\n");
    });

    it("numbers a folder's entries 1..n and writes only what changed", () => {
        const tree = loadDocsTree(root, en);
        const [, intro, guides, setup] = tree;
        const written = reorder(root, "", [tree[0]!, setup!, intro!, guides!]);
        expect(written.sort()).toEqual(["docs/guides/index.md", "docs/intro.md", "docs/setup.md"]);
        expect(names(loadDocsTree(root, en))).toEqual(["index.md", "setup.md", "intro.md", ["guides", ["first.md"]]]);
    });
});

describe("creating", () => {
    it("turns titles into file names", () => {
        expect(slugify("Getting Started!")).toBe("getting-started");
        expect(slugify("Über Größen")).toBe("uber-grossen");
        expect(slugify("???")).toBe("page");
    });

    it("creates pages and folders after the ordered entries", () => {
        const tree = loadDocsTree(root, en);
        expect(createPage(root, "", "guides", "Deploying", "deploying", tree[2]!.children)).toBe("docs/guides/deploying.md");
        expect(read("docs/guides/deploying.md")).toBe("---\ntitle: \"Deploying\"\n---\n\n# Deploying\n");
        expect(createFolder(root, "", "", "Reference", "reference", tree)).toBe("docs/reference/index.md");
        expect(read("docs/reference/index.md")).toBe("---\ntitle: \"Reference\"\norder: 2\nlist: true\n---\n\n# Reference\n");
        expect(() => createPage(root, "", "", "Setup", "setup", tree)).toThrow(/already exists/);
    });

    it("starts a translation as a copy of the original", () => {
        const setup = loadDocsTree(root, de)[3]!;
        expect(createTranslation(root, de, setup)).toBe("docs/setup.de.md");
        expect(read("docs/setup.de.md")).toBe(read("docs/setup.md"));
        expect(() => createTranslation(root, de, loadDocsTree(root, de)[3]!)).toThrow(/already exists/);
    });
});

describe("versions", () => {
    it("move docs/ into docs/latest/ with the first one, then copy docs/latest/ to docs/<name>/", () => {
        write({
            "docs/.DS_Store": "junk",
            "docs-archive/1.x/old.md": "# Old\n",
            "docs/guides/first.md": "# First\n\n<!--@include: ../../clay.yaml{1,2}-->\n\n![Logo](../../logo.svg) [Setup](../setup.md)\n",
        });
        const plan = planLayout(root)!;
        expect(plan.archived).toEqual(["1.x"]);
        expect(plan.fixed).toEqual([
            {file: "docs/latest/guides/first.md", from: "../../clay.yaml{1,2}", to: "../../../clay.yaml{1,2}"},
            {file: "docs/latest/guides/first.md", from: "../../logo.svg", to: "../../../logo.svg"},
        ]);
        expect(plan.settings).toEqual([]);

        applyLayout(root, plan);
        expect(read("docs/latest/guides/first.md")).toBe("# First\n\n<!--@include: ../../../clay.yaml{1,2}-->\n\n![Logo](../../../logo.svg) [Setup](../setup.md)\n");
        expect(read("docs/1.x/old.md")).toBe("# Old\n");
        expect(existsSync(join(root, "docs-archive"))).toBe(false);
        expect(planLayout(root)).toBeUndefined();

        expect(saveVersion(root, "2.x")).toEqual({dir: "docs/2.x", files: 8});
        expect(read("docs/2.x/intro.de.md")).toBe(read("docs/latest/intro.de.md"));
        expect(existsSync(join(root, "docs/2.x/.DS_Store"))).toBe(false);
        expect(names(loadDocsTree(root, {version: "2.x", language: "en"}))).toEqual(names(loadDocsTree(root, en)));
        expect(() => saveVersion(root, "2.x")).toThrow(/already exists/);
        expect(() => checkVersionName(root, "bad name")).toThrow(/can't be used in URLs/);
        expect(() => checkVersionName(root, "latest")).toThrow(/can't be used in URLs/);
    });
});

describe("moving and deleting", () => {
    it("renames a page with its translations and reports links that broke", () => {
        write({"docs/setup.md": "# Setup\n\nSee the [intro](intro.md).\n"});
        const intro = loadDocsTree(root, en)[1]!;
        const {moved, broken} = moveEntry(root, "", intro, "guides", "welcome");
        expect(moved).toEqual(["intro.md → guides/welcome.md", "intro.de.md → guides/welcome.de.md"]);
        expect(existsSync(join(root, "docs/guides/welcome.de.md"))).toBe(true);
        expect(broken).toEqual(['setup.md: "intro.md" points to a missing page (/intro)']);
    });

    it("keeps the old address as a redirect when asked to", () => {
        write({"docs/setup.md": "# Setup\n\nSee the [intro](intro.md).\n"});
        const {redirects, broken} = moveEntry(root, "", loadDocsTree(root, en)[1]!, "guides", "welcome", true);
        expect(redirects).toEqual(["/intro → /guides/welcome"]);
        expect(read("docs/guides/welcome.md")).toBe('---\ntitle: Intro\norder: 1\nredirects: ["/intro"]\n---\n\n# Introduction\n');
        // Translations share the original's redirects
        expect(read("docs/guides/welcome.de.md")).not.toContain("redirects");
        // The link still leads to the page, but should point to it directly
        expect(broken).toEqual(['setup.md: "intro.md" points to an old address of /guides/welcome; link to the page itself']);

        // Moved back, the page drops the address it has again
        const welcome = loadDocsTree(root, en).find(node => node.name === "guides")!.children.find(node => node.name === "welcome.md")!;
        expect(moveEntry(root, "", welcome, "", "intro", true).redirects).toEqual(["/guides/welcome → /intro"]);
        expect(read("docs/intro.md")).toContain('redirects: ["/guides/welcome"]\n');
    });

    it("redirects every page of a moved folder, and nothing without being asked", () => {
        const guides = () => loadDocsTree(root, en).find(node => node.name === "guides" || node.name === "tutorials")!;
        expect(moveEntry(root, "", guides(), "", "tutorials").redirects).toEqual([]);
        expect(read("docs/tutorials/first.md")).not.toContain("redirects");
        expect(moveEntry(root, "", guides(), "", "guides", true).redirects).toEqual(["/tutorials/first → /guides/first", "/tutorials → /guides"]);
        expect(read("docs/guides/index.md")).toContain('redirects: ["/tutorials"]');
    });

    it("moves folders, but not into themselves", () => {
        const guides = loadDocsTree(root, en)[2]!;
        expect(() => moveEntry(root, "", guides, "guides", "inner")).toThrow(/into itself/);
        expect(moveEntry(root, "", guides, "", "tutorials").moved).toEqual(["guides/ → tutorials/"]);
        expect(existsSync(join(root, "docs/tutorials/first.md"))).toBe(true);
    });

    it("deletes a page with its translations", () => {
        const {deleted} = deleteEntry(root, "", loadDocsTree(root, en)[1]!);
        expect(deleted).toEqual(["intro.md", "intro.de.md"]);
        expect(existsSync(join(root, "docs/intro.de.md"))).toBe(false);
        expect(() => deleteEntry(root, "", loadDocsTree(root, en)[0]!)).toThrow(/start page/);
    });
});

describe("settings", () => {
    it("edits values and keeps comments and quoting", () => {
        const settings = loadSettings(root);
        expect(settingsChanged(settings)).toBe(false);
        setSetting(settings.doc, ["title"], "Handbook");
        setSetting(settings.doc, ["version"], "3.x");
        expect(saveSettings(root, settings)).toBe(true);
        expect(read("clay.yaml")).toContain("title: \"Handbook\" # shown in the navbar\n");
        expect(read("clay.yaml")).toContain("version: 3.x\n");
    });

    it("reads and writes values given per language in the chosen language", () => {
        const settings = loadSettings(root);
        expect(getSetting(settings.doc, ["navbar", "source", "name"], "de")).toBe("Quelle");
        setSetting(settings.doc, ["navbar", "source", "name"], "Quelltext", "de");
        expect(getSetting(settings.doc, ["navbar", "source", "name"], "de")).toBe("Quelltext");
        expect(getSetting(settings.doc, ["navbar", "source", "name"], "en")).toBe("Source");
    });

    it("removes emptied values and the sections they leave empty", () => {
        const settings = loadSettings(root);
        setSetting(settings.doc, ["navbar", "logo"], "");
        setSetting(settings.doc, ["navbar", "source", "name"], "");
        saveSettings(root, settings);
        expect(read("clay.yaml")).not.toContain("navbar:");
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
