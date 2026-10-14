import {describe, expect, it} from "vitest";
import {Marked} from "marked";
import {headingIds} from "../common/markdown-text";
import {highlight, loadSearchIndex, searchSections, snippet} from "../common/search";
import {buildSearchIndex, createSearchIndex, directorySection, splitIntoSections, type SearchPage} from "../server/utils/search-index";
import {collectPages, type DocNode} from "../lib/site";

const page: SearchPage = {link: "/guides/setup", title: "Setup", path: "Guides"};

const setupMd = `---
title: Setup
---
# Setup

Clay needs a few files before the first build.

## Installation

Download the binary and run it.

\`\`\`bash
./clay-oven -ci
\`\`\`

### Configuration

Edit \`clay.yaml\` to change the title.

#### Details

Deeper heading stays in the configuration section.

## Installation
`;

describe("buildSearchIndex", () => {
    const md = (path: string, markdown: string): DocNode =>
        ({name: path.split("/").pop()!, path, isDir: false, markdown, frontMatter: {}, children: []});
    const tree: DocNode = {name: "", path: "", isDir: true, frontMatter: {}, children: [
        md("index.md", "# Overview\n\nWelcome."),
        {name: "guides", path: "guides", isDir: true, frontMatter: {}, children: [md("guides/setup.md", "# Setup\n\n## Install\n\nRun the installer.")]},
    ]};

    it("indexes pages by section and directories by title, and survives a JSON round trip", () => {
        const index = loadSearchIndex(JSON.stringify(buildSearchIndex(collectPages(tree).pages)));

        expect(searchSections(index, "installer")[0]).toMatchObject({link: "/guides/setup", anchor: "install", path: "Guides"});
        expect(searchSections(index, "guides").some(hit => hit.link === "/guides")).toBe(true);
        expect(searchSections(index, "welcom")[0]?.link).toBe("/index");
    });
});

describe("splitIntoSections", () => {
    const sections = splitIntoSections(setupMd, page);

    it("splits on h2 and h3 and keeps the intro", () => {
        expect(sections.map(s => [s.heading, s.anchor])).toEqual([
            ["", undefined],
            ["Installation", "installation"],
            ["Configuration", "configuration"],
            ["Installation", "installation-1"]
        ]);
    });

    it("drops front matter and keeps h1/h4 text in the surrounding section", () => {
        expect(sections[0]!.text).toBe("Setup Clay needs a few files before the first build.");
        expect(sections[2]!.text).toBe("Edit clay.yaml to change the title. Details Deeper heading stays in the configuration section.");
    });

    it("puts code blocks in their own field", () => {
        expect(sections[1]!.text).toBe("Download the binary and run it.");
        expect(sections[1]!.code).toBe("./clay-oven -ci");
    });

    it("uses the same anchors as the rendered page", () => {
        const html = new Marked().use(headingIds()).parse(setupMd) as string;
        for (const s of sections.filter(s => s.anchor)) {
            expect(html).toContain(`id="${s.anchor}"`);
        }
    });

    it("gives every section a unique id", () => {
        expect(new Set(sections.map(s => s.id)).size).toBe(sections.length);
    });
});

describe("searchSections", () => {
    const index = createSearchIndex([
        ...splitIntoSections(setupMd, page),
        ...splitIntoSections("Intro text.\n\n## Highlighting\n\nCall `loadLanguage` for each language.\n\n```ts\nhighlighter.loadLanguage(lang)\n```",
            {link: "/guides/syntax", title: "Syntax", path: "Guides"}),
        directorySection({link: "/guides", title: "Guides", path: ""})
    ]);
    const search = (q: string) => searchSections(index, q);

    it("ranks a page's intro first for a title match", () => {
        expect(search("setup")[0]).toMatchObject({link: "/guides/setup", anchor: undefined});
    });

    it("finds sections by heading and links to the anchor", () => {
        expect(search("configuration")[0]).toMatchObject({link: "/guides/setup", anchor: "configuration"});
    });

    it("tolerates typos in longer words", () => {
        expect(search("instalation")[0]?.heading).toBe("Installation");
    });

    it("matches the word being typed as a prefix", () => {
        expect(search("highl")[0]?.heading).toBe("Highlighting");
    });

    it("finds identifiers inside code blocks", () => {
        expect(search("highlighter").some(h => h.anchor === "highlighting")).toBe(true);
    });

    it("requires all words, falling back to any word", () => {
        expect(search("binary download").map(h => h.anchor)).toEqual(["installation"]);
        expect(search("binary nonexistentword").map(h => h.anchor)).toEqual(["installation"]);
    });

    it("finds directories", () => {
        expect(search("guides").some(h => h.link === "/guides")).toBe(true);
    });

    it("returns nothing for an empty query", () => {
        expect(search("   ")).toEqual([]);
    });

    it("returns a highlighted snippet", () => {
        const hit = search("binary")[0]!;
        expect(hit.snippet.filter(s => s.match).map(s => s.text)).toEqual(["binary"]);
    });
});

describe("highlight", () => {
    it("marks whole-word matches case-insensitively", () => {
        expect(highlight("Go to Google, go!", ["go"])).toEqual([
            {text: "Go", match: true},
            {text: " to Google, ", match: false},
            {text: "go", match: true},
            {text: "!", match: false}
        ]);
    });

    it("escapes regex characters in terms", () => {
        expect(highlight("a c++ b", ["c++"])).toContainEqual({text: "c++", match: true});
    });
});

describe("snippet", () => {
    it("centres on the first match with ellipses", () => {
        const text = "lorem ".repeat(40) + "needle " + "ipsum ".repeat(40);
        const parts = snippet(text, ["needle"]);
        const joined = parts.map(p => p.text).join("");
        expect(joined.startsWith("…")).toBe(true);
        expect(joined.endsWith("…")).toBe(true);
        expect(parts).toContainEqual({text: "needle", match: true});
    });

    it("starts at the beginning when nothing matches", () => {
        expect(snippet("short text", [])).toEqual([{text: "short text", match: false}]);
    });
});
