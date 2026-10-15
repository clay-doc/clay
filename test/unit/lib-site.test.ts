import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {collectPages, firstHeading, loadConfig, loadSite, prettyName, resolveFile, sortTree, type DocNode} from "../../lib/site";

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
            // A folder's order comes from its index.md
            {name: "zeta", path: "zeta", isDir: true, frontMatter: {}, children: [file("x.md")], index: file("zeta/index.md", 5)},
        ];
        const sorted = sortTree(tree);

        expect(sorted.map(n => n.name)).toEqual(["intro.md", "beta.md", "zeta", "alpha.md", "guides"]);
        expect(sorted[4]!.children.map(n => n.name)).toEqual(["z.md", "a.md"]);
    });
});

describe("loadSite", () => {
    const root = project({
        "clay.yaml": "title: Docs\nbaseURL: /repo/\ntitel: typo\nnavbar:\n  lgo: x\nindex:\n  title: Old\n",
        "dir-meta.yaml": "- path: guides\n",
        "docs/index.md": "# Home\n\nWelcome.",
        "docs/guides/index.md": "---\ntitle: User Guides\nicon: fa-solid fa-book\norder: 1\ncards: true\n---\n",
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
            'clay.yaml: "index" is no longer read since Clay 3; write the start page in docs/index.md',
            "dir-meta.yaml is no longer read since Clay 3; give each folder an index.md with its title, icon and order",
            'guides/index.md: "cards" is no longer read since Clay 4; it is called "list"',
        ]));
    });

    it("builds pages, skipping hidden files, other files and directories without pages", () => {
        expect(site.pages.map(p => `${p.route}=${p.title}`)).toEqual(["/=Home", "/guides=User Guides", "/guides/setup=Setup"]);
        expect(site.pages[2]!.parents).toEqual([{title: "User Guides", route: "/guides"}]);
        expect(site.nav.children?.map(c => c.title)).toEqual(["User Guides"]);
    });

    it("makes docs/index.md the start page and a folder's index.md its name, icon and order", () => {
        expect(site.pages[0]).toMatchObject({route: "/", isDir: true, source: "index.md", markdown: "# Home\n\nWelcome."});
        expect(site.nav).toMatchObject({hasIndex: true, source: "index.md"});
        // Only front matter: names the folder, but is not a page of its own
        expect(site.pages[1]).toMatchObject({route: "/guides", icon: "fa-solid fa-book", source: "guides"});
        expect(site.pages[1]!.markdown).toBeUndefined();
        expect(site.nav.children![0]!.hasIndex).toBeUndefined();
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
    it("links folders to their children and gives folders with text in index.md a page", () => {
        const md = (path: string, markdown = ""): DocNode => ({name: path.split("/").pop()!, path, isDir: false, markdown, frontMatter: {}, children: []});
        const tree: DocNode = {name: "", path: "", isDir: true, frontMatter: {}, children: [
            md("a.md"),
            {name: "dir", path: "dir", isDir: true, frontMatter: {}, children: [md("dir/b.md")], index: {...md("dir/index.md", "# Directory\n\nAbout it."), heading: "Directory"}},
        ]};
        const {pages, topLevel} = collectPages(tree);

        expect(pages.map(p => `${p.route}=${p.title}`)).toEqual(["/a=A", "/dir=Directory", "/dir/b=B"]);
        expect(topLevel.map(c => c.route)).toEqual(["/a", "/dir"]);
        expect(pages[1]).toMatchObject({source: "dir/index.md", markdown: "# Directory\n\nAbout it.", children: [{title: "B", route: "/dir/b"}]});
    });
});
