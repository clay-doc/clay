import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {load} from "js-yaml";
import {brokenLinks, configSchema, dirMetaSchema, unknownKeys} from "../lib/checks";
import type {Page} from "../lib/site";

describe("unknownKeys", () => {
    it("finds typos at any depth, including list items", () => {
        const config = load("title: Docs\ntitel: typo\nnavbar:\n  lgo: logo.svg\n  links:\n    - name: Home\n      link: /\n      icn: x\nindex:\n  title: Welcome\n");
        expect(unknownKeys(config, configSchema)).toEqual(["navbar.lgo", "navbar.links[0].icn", "titel"]);
    });

    it("follows nested directory metadata", () => {
        const meta = load("- path: a\n  name: A\n  ordr: 1\n  children:\n    - path: b\n      icn: x\n");
        expect(unknownKeys(meta, [dirMetaSchema])).toEqual(["[0].children[0].icn", "[0].ordr"]);
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
        ({route, source, title: route, icon: "", isDir, parents: [], children: [], markdown, frontMatter: {}, version});

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

    it("checks pages of older versions against their own docs folder", () => {
        const old = mkdtempSync(join(tmpdir(), "clay-links-old-"));
        mkdirSync(join(old, "guides"), {recursive: true});
        writeFileSync(join(old, "guides/diagram.svg"), "x");
        const pages = [
            page("/1.x/guides/setup", "guides/setup.md", "![ok](diagram.svg) ![gone](shot.png) [latest](/guides) [root](/1.x) [missing](old.md)", false, "1.x"),
            page("/guides", "guides", undefined, true),
        ];

        expect(brokenLinks(pages, {"": docs, "1.x": old})).toEqual([
            'versions/1.x/docs/guides/setup.md: "shot.png" points to a missing file',
            'versions/1.x/docs/guides/setup.md: "old.md" points to a missing page (/1.x/guides/old)',
        ]);
    });
});
