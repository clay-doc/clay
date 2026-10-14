import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {collectPages, firstHeading, loadConfig, loadSite, prettyName, resolveFile, sortTree, type DocNode} from "../lib/site";

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-site-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

describe("prettyName", () => {
    it.each([
        ["getting-started.md", "Getting started"],
        ["api_reference.md", "Api reference"],
        ["Setup.MD", "Setup"],
        ["advanced", "Advanced"],
        ["übersicht.md", "Übersicht"],
        ["a--b.md", "A b"],
    ])("%j => %j", (name, expected) => {
        expect(prettyName(name)).toBe(expected);
    });
});

describe("firstHeading", () => {
    it.each([
        ["# Getting **Started**\n\ntext", "Getting Started"],
        ["Intro\n\n## Sub\n\n# Main", "Main"],
        ["## Only h2", undefined],
        ["```md\n# not a heading\n```", undefined],
        ["---\ntitle: T\n---\n# After front matter", "After front matter"],
    ])("%j => %j", (markdown, expected) => {
        expect(firstHeading(markdown)).toBe(expected);
    });
});

describe("resolveFile", () => {
    const node = (extra: Partial<DocNode>): DocNode => ({name: "my-page.md", path: "my-page.md", isDir: false, frontMatter: {}, children: [], ...extra});

    it("prefers the front matter title, then the first heading, then the file name", () => {
        expect(resolveFile(node({frontMatter: {title: "Front"}, heading: "Heading"})).title).toBe("Front");
        expect(resolveFile(node({heading: "Heading"})).title).toBe("Heading");
        expect(resolveFile(node({})).title).toBe("My page");
    });
});

describe("sortTree", () => {
    const file = (name: string, order?: number): DocNode => ({name, path: name, isDir: false, frontMatter: order === undefined ? {} : {order}, children: []});

    it("puts ordered entries first, the rest alphabetically after them", () => {
        const tree: DocNode[] = [
            file("alpha.md"),
            file("beta.md", 2),
            {name: "guides", path: "guides", isDir: true, frontMatter: {}, children: [file("a.md"), file("z.md", 1)]},
            file("intro.md", 1),
            {name: "zeta", path: "zeta", isDir: true, frontMatter: {}, children: [file("x.md")]},
        ];
        const sorted = sortTree(tree, [{path: "zeta", order: 5}]);

        expect(sorted.map(n => n.name)).toEqual(["intro.md", "beta.md", "zeta", "alpha.md", "guides"]);
        expect(sorted[4]!.children.map(n => n.name)).toEqual(["z.md", "a.md"]);
    });
});

describe("loadSite", () => {
    const root = project({
        "clay.yaml": "title: Docs\nbaseURL: /repo/\ntitel: typo\nnavbar:\n  lgo: x\n",
        "dir-meta.yaml": "- path: guides\n  name: Guides\n  order: 1\n  ordr: 2\n",
        "docs/index.md": "# Home\n\nWelcome.",
        "docs/guides/setup.md": "---\ntitle: Setup\n---\nInstall it.",
        "docs/guides/img/shot.png": "png",
        "docs/images/only.png": "png",
        "docs/.obsidian/x.md": "hidden",
        "docs/.DS_Store": "junk",
        "docs/notes.txt": "text",
    });
    const site = loadSite(root, {gitDates: false, env: {}});

    it("loads config and reports unknown keys", () => {
        expect(site.config.title).toBe("Docs");
        expect(site.warnings).toEqual(expect.arrayContaining([
            'clay.yaml: unknown key "navbar.lgo" is ignored (typo?)',
            'clay.yaml: unknown key "titel" is ignored (typo?)',
            'dir-meta.yaml: unknown key "[0].ordr" is ignored (typo?)',
        ]));
    });

    it("builds pages, skipping hidden files, other files and directories without pages", () => {
        expect(site.pages.map(p => `${p.route}=${p.title}`)).toEqual(["/guides=Guides", "/guides/setup=Setup", "/index=Home"]);
        expect(site.pages[1]!.parents).toEqual([{title: "Guides", route: "/guides"}]);
        expect(site.nav.children?.map(c => c.title)).toEqual(["Guides", "Home"]);
    });

    it("applies environment overrides", () => {
        const {config} = loadConfig(root, {CLAY_TITLE: "From env", CLAY_SITE_URL: "https://x.dev"});
        expect(config).toMatchObject({title: "From env", siteURL: "https://x.dev", baseURL: "/repo/"});
    });

    it("explains a missing config or docs folder", () => {
        expect(() => loadSite(project({"docs/a.md": "x"}))).toThrow(/No clay.yaml/);
        expect(() => loadSite(project({"clay.yaml": "title: T"}))).toThrow(/No docs\/ directory/);
    });
});

describe("collectPages", () => {
    it("links directories to their children", () => {
        const md = (name: string): DocNode => ({name, path: name, isDir: false, markdown: "", frontMatter: {}, children: []});
        const tree: DocNode = {name: "", path: "", isDir: true, frontMatter: {}, children: [
            md("a.md"),
            {name: "dir", path: "dir", isDir: true, frontMatter: {}, children: [{...md("b.md"), path: "dir/b.md"}]},
        ]};
        const {pages, topLevel} = collectPages(tree, [{path: "dir", name: "Directory"}]);

        expect(pages.map(p => `${p.route}=${p.title}`)).toEqual(["/a=A", "/dir=Directory", "/dir/b=B"]);
        expect(topLevel.map(c => c.route)).toEqual(["/a", "/dir"]);
        expect(pages[1]!.children).toEqual([{title: "B", route: "/dir/b"}]);
    });
});
