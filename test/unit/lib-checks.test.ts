import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {load} from "js-yaml";
import {brokenLinks, configSchema, unknownKeys} from "../../lib/checks";
import type {Page} from "../../lib/site";

describe("unknownKeys", () => {
    it("finds typos at any depth, including list items", () => {
        const config = load("title: Docs\ntitel: typo\nnavbar:\n  lgo: logo.svg\n  links:\n    - name: Home\n      link: /\n      icn: x\nindex:\n  title: Welcome\n");
        expect(unknownKeys(config, configSchema)).toEqual(["navbar.lgo", "navbar.links[0].icn", "titel"]);
    });

    it("accepts every documented key", () => {
        expect(unknownKeys(load("title: x\nsiteURL: y\nlang: en\neditURL: z\nfontawesomeKit: k\nfavicon: f\nbaseURL: /\n"), configSchema)).toEqual([]);
    });
});

describe("brokenLinks", () => {
    const docs = mkdtempSync(join(tmpdir(), "clay-links-"));
    for (const path of ["guides/img/shot.png", "files/a.pdf"]) {
        mkdirSync(dirname(join(docs, path)), {recursive: true});
        writeFileSync(join(docs, path), "x");
    }

    const page = (route: string, source: string, markdown?: string, isDir = false, version = ""): Page =>
        ({route, source, title: route, icon: "", isDir, parents: [], children: [], markdown, frontMatter: {}, version, language: "en", prefix: version ? `/${version}` : ""});

    it("reports missing pages and files, resolved relative to the page", () => {
        const pages = [
            page("/index", "index.md", "[ok](./guides/setup.md) [abs](/guides/setup) [home](/) [missing](missing.md) [ext](https://x.dev) [mail](mailto:a@b.c) [anchor](#top) [pdf](files/a.pdf) [nopdf](files/b.pdf)"),
            page("/guides", "guides", undefined, true),
            page("/guides/setup", "guides/setup.md", "---\ntitle: S\n---\n![shot](img/shot.png) ![gone](img/gone.png) [up](../index.md#x) [dir](../guides/) [spaced](my%20page.md) ![root](/logo.svg)"),
        ];

        expect(brokenLinks(pages, docs)).toEqual([
            'index.md: "missing.md" points to a missing page (/missing)',
            'index.md: "files/b.pdf" points to a missing file',
            'guides/setup.md: "img/gone.png" points to a missing file',
            'guides/setup.md: "my%20page.md" points to a missing page (/guides/my page)',
        ]);
    });

    it("checks files and links written in HTML too", () => {
        const pages = [
            page("/guides", "guides", undefined, true),
            page("/guides/setup", "guides/setup.md", '<video src="img/clip.mp4" poster="img/shot.png" controls></video>\n\n'
                + '<img src="img/shot.png"> <a href="../index.md">home</a> <a href="gone.md">x</a>\n\n'
                + "<iframe src=\"https://www.youtube.com/embed/x\"></iframe>\n\n```html\n<img src=\"in-code.png\">\n```"),
            page("/index", "index.md", "Text"),
        ];
        expect(brokenLinks(pages, docs)).toEqual([
            'guides/setup.md: "img/clip.mp4" points to a missing file',
            'guides/setup.md: "gone.md" points to a missing page (/guides/gone)',
        ]);
    });

    it("checks pages of older versions against their own docs folder", () => {
        const old = mkdtempSync(join(tmpdir(), "clay-links-old-"));
        mkdirSync(join(old, "guides"), {recursive: true});
        writeFileSync(join(old, "guides/diagram.svg"), "x");
        const pages = [
            page("/1.x/guides/setup", "guides/setup.md", "![ok](diagram.svg) ![gone](shot.png) [latest](/guides) [root](/1.x) [missing](old.md)", false, "1.x"),
            page("/guides", "guides", undefined, true),
        ];

        expect(brokenLinks(pages, {"": docs, "1.x": old})).toEqual([
            'docs-archive/1.x/guides/setup.md: "shot.png" points to a missing file',
            'docs-archive/1.x/guides/setup.md: "old.md" points to a missing page (/1.x/guides/old)',
        ]);
    });

    it("checks the links of folders' and start pages' index.md, relative to their folder", () => {
        const pages = [
            page("/", "index.md", "[ok](guides/setup.md) [gone](guides/old.md)", true),
            page("/guides", "guides/index.md", "[ok](setup.md#install) [gone](setup.md#nope)", true),
            page("/guides/setup", "guides/setup.md", "## Install"),
        ];
        expect(brokenLinks(pages, docs)).toEqual([
            'index.md: "guides/old.md" points to a missing page (/guides/old)',
            'guides/index.md: "setup.md#nope" points to a missing section (#nope on /guides/setup)',
        ]);
    });

    it("reports links to sections that do not exist, on the same page or another", () => {
        const pages = [
            page("/a", "a.md", "# A\n\n## Set up `clay`\n\n## Set up `clay`\n\n<a id=\"custom\"></a>\n\n[ok](#set-up-clay-1) [html](#custom) [top](#top) [gone](#nope) [other](b.md#install) [other-gone](b.md#uninstall) [dir](guides/#x)"),
            page("/b", "b.md", "# B\n\n### Install\n"),
            page("/guides", "guides", undefined, true),
        ];
        expect(brokenLinks(pages, docs)).toEqual([
            'a.md: "#nope" points to a missing section (#nope on /a)',
            'a.md: "b.md#uninstall" points to a missing section (#uninstall on /b)',
        ]);
    });
});
