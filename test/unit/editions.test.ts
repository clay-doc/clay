import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {listVersions, loadSite, localize, translationOf} from "../../lib/site";
import {editionOf, stripPrefix, switchEdition, type LanguageInfo, type VersionInfo} from "../../common/editions";

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-versions-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

const current: VersionInfo = {name: "", label: "2.x", dir: "docs/latest"};
const old: VersionInfo = {name: "1.x", label: "1.x", dir: "docs/1.x"};
const versions = [current, old];
const languages: LanguageInfo[] = [{code: "en", label: "English"}, {code: "de", label: "Deutsch"}];

describe("edition routes", () => {
    it.each([
        ["/", "", "en", ""], ["/guides/setup", "", "en", ""], ["/1.x", "1.x", "en", "/1.x"], ["/1.x/guides/", "1.x", "en", "/1.x"],
        ["/1.xy/guides", "", "en", ""], ["/de", "", "de", "/de"], ["/de/guides", "", "de", "/de"], ["/1.x/de/guides", "1.x", "de", "/1.x/de"],
        ["/en/guides", "", "en", ""], ["/de/1.x", "", "de", "/de"],
    ])("%s is version %j in %s", (path, version, language, prefix) => {
        const edition = editionOf(path, versions, languages);
        expect([edition.version.name, edition.language.code, edition.prefix]).toEqual([version, language, prefix]);
    });

    it("strips the edition prefix", () => {
        expect(stripPrefix("/1.x/de/guides/setup/", "/1.x/de")).toBe("/guides/setup");
        expect(stripPrefix("/1.x", "/1.x")).toBe("/");
        expect(stripPrefix("/guides", "")).toBe("/guides");
    });

    it("switches to the same page, or the start page of the other version", () => {
        const site = loadSite(project({
            "clay.yaml": "title: T",
            "docs/latest/setup.md": "# Setup",
            "docs/latest/new.md": "# New",
            "docs/1.x/setup.md": "# Setup",
        }), {gitDates: false, env: {}});
        const navs = Object.fromEntries(site.editions.map(edition => [edition.prefix, edition.nav]));

        expect(switchEdition("/setup", "", "/1.x", navs)).toBe("/1.x/setup");
        expect(switchEdition("/new", "", "/1.x", navs)).toBe("/1.x");
        expect(switchEdition("/1.x/setup/", "/1.x", "", navs)).toBe("/setup");
        expect(switchEdition("/1.x", "/1.x", "", navs)).toBe("/");
    });
});

describe("loadSite with versions", () => {
    it("loads older versions under their prefix, newest first", () => {
        const site = loadSite(project({
            "clay.yaml": "title: T\nversion: \"3.x\"",
            "docs/latest/a.md": "# A",
            "docs/1.x/guides/b.md": "# B",
            "docs/1.x/guides/index.md": "---\ntitle: Old guides\n---\n",
            "docs/2.x/c.md": "# C",
            "docs/10.x/d.md": "# D",
            "docs/_snippets/shared.md": "Shared by all versions",
        }), {gitDates: false, env: {}});

        expect(site.versions.map(({name, label, dir}) => [name, label, dir])).toEqual([
            ["", "3.x", "docs/latest"], ["10.x", "10.x", "docs/10.x"], ["2.x", "2.x", "docs/2.x"], ["1.x", "1.x", "docs/1.x"],
        ]);
        expect(site.pages.map(page => [page.route, page.version])).toEqual([
            ["/a", ""], ["/10.x/d", "10.x"], ["/2.x/c", "2.x"], ["/1.x/guides", "1.x"], ["/1.x/guides/b", "1.x"],
        ]);
        expect(site.versions[3]!.nav.children![0]).toMatchObject({title: "Old guides", displayLink: "/1.x/guides"});
        expect(site.warnings).toEqual([]);
    });

    it("skips unusable folders and reports URL clashes", () => {
        const root = project({
            "clay.yaml": "title: T",
            "docs/latest/1.x/a.md": "# A",
            "docs/1.x/a.md": "# A",
            "docs/docs/a.md": "# A",
            "docs/with space/a.md": "# A",
            "docs/stray.md": "# Stray",
            "docs-archive/2.x/a.md": "# A",
            "versions/1.x/docs/a.md": "# A",
        });
        expect(listVersions(root).names).toEqual(["1.x"]);
        expect(loadSite(root, {gitDates: false, env: {}}).warnings).toEqual([
            'versions/ is no longer read since Clay 3; move versions/<name>/docs/ to docs-archive/<name>/ and run "clay version"',
            'docs-archive/ is no longer read since Clay 4; run "clay version" to move its versions into docs/',
            "docs/docs: not usable as a version name in URLs; the folder is skipped",
            "docs/stray.md: with versions, pages belong in docs/latest/; the file is skipped",
            "docs/with space: not usable as a version name in URLs; the folder is skipped",
            "docs/1.x: docs/latest/1.x has the same URL as this version; rename one of them",
        ]);
    });

    it("has no versions while the docs are right in docs/", () => {
        const site = loadSite(project({"clay.yaml": "title: T", "docs/a.md": "# A", "docs/1.x/b.md": "# B"}), {gitDates: false, env: {}});
        expect(site.versions.map(({name, dir}) => [name, dir])).toEqual([["", "docs"]]);
        expect(site.pages.map(page => page.route)).toEqual(["/1.x", "/1.x/b", "/a"]);
    });
});

describe("translations", () => {
    const root = project({
        "clay.yaml": "title: {en: Docs, de: Doku}\nlanguages: [en, de]\nnavbar:\n  source: {name: {en: Source, de: Quelle}, icon: x, link: y}\nmessages:\n  de: {search: Finden}",
        "docs/index.md": "# Welcome\n\nHello.",
        "docs/index.de.md": "# Willkommen\n\nHallo.",
        "docs/guides/index.md": "---\ntitle: Guides\n---\n",
        "docs/guides/index.de.md": "---\ntitle: Anleitungen\n---\n",
        "docs/setup.md": "---\norder: 2\n---\n# Setup\n\n![Shot](shot.png)",
        "docs/setup.de.md": "---\ntitle: Einrichtung\n---\n# Einrichtung",
        "docs/intro.md": "---\norder: 1\n---\n# Intro",
        "docs/guides/first.md": "# First",
        "docs/shot.png": "x",
        "docs/orphan.de.md": "# Waise",
        "docs/notes.fr.md": "# Notes",
    });
    const site = loadSite(root, {gitDates: false, env: {}});
    const page = (route: string) => site.pages.find(p => p.route === route)!;

    it("detects translations of the site's other languages only", () => {
        expect(translationOf("setup.de.md", ["de"])).toBe("de");
        expect(translationOf("notes.fr.md", ["de"])).toBeUndefined();
        expect(translationOf("de.md", ["de"])).toBeUndefined();
    });

    it("builds every page in every language, with the original where a translation is missing", () => {
        expect(site.languages).toEqual([{code: "en", label: "English"}, {code: "de", label: "Deutsch"}]);
        expect(site.editions.map(edition => edition.prefix)).toEqual(["", "/de"]);
        expect(site.pages.filter(p => !p.isDir).map(p => p.route)).toEqual([
            "/intro", "/setup", "/guides/first", "/notes.fr",
            "/de/intro", "/de/setup", "/de/guides/first", "/de/notes.fr",
        ]);
        expect(page("/de/setup")).toMatchObject({title: "Einrichtung", source: "setup.de.md", language: "de", prefix: "/de", frontMatter: {order: 2}});
        expect(page("/de/setup").untranslated).toBeUndefined();
        expect(page("/de/intro")).toMatchObject({title: "Intro", source: "intro.md", untranslated: true});
        expect(page("/de/guides").title).toBe("Anleitungen");
        expect(page("/guides").title).toBe("Guides");
        // Start pages: docs/index.md and its translation
        expect(page("/")).toMatchObject({title: "Welcome", source: "index.md"});
        expect(page("/de")).toMatchObject({title: "Willkommen", source: "index.de.md", prefix: "/de"});
    });

    it("keeps the order of the original in every language", () => {
        const titles = (prefix: string) => site.editions.find(e => e.prefix === prefix)!.nav.children!.map(item => item.title);
        expect(titles("")).toEqual(["Intro", "Setup", "Guides", "Notes"]);
        expect(titles("/de")).toEqual(["Intro", "Einrichtung", "Anleitungen", "Notes"]);
    });

    it("localizes clay.yaml per language and keeps interface texts as they are", () => {
        expect(site.config).toMatchObject({title: "Docs", lang: "en", navbar: {source: {name: "Source"}}});
        expect(site.configs.de).toMatchObject({title: "Doku", lang: "de", navbar: {source: {name: "Quelle"}}, messages: {de: {search: "Finden"}}});
        expect(localize({a: {en: 1, de: 2}, b: [{en: "x"}]}, "fr", ["en", "de", "fr"])).toEqual({a: 1, b: ["x"]});
    });

    it("warns about translations without an original and unusable language codes", () => {
        expect(site.warnings).toEqual(["orphan.de.md: translates orphan.md, which does not exist; the file is skipped"]);
        const other = loadSite(project({"clay.yaml": "title: T\nlang: de\nlanguages: [en, Deutsch]", "docs/a.md": "# A"}), {gitDates: false, env: {}});
        expect(other.warnings).toEqual([
            'clay.yaml: "Deutsch" is not a language code like "en" or "pt-BR"; it is ignored',
            'clay.yaml: "lang" is ignored; the first of "languages" (en) is the default language',
        ]);
    });
});
