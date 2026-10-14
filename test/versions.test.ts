import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {listVersions, loadSite} from "../lib/site";
import {stripVersion, switchVersion, versionOf, type VersionInfo} from "../common/versions";

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-versions-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

const current: VersionInfo = {name: "", label: "2.x"};
const old: VersionInfo = {name: "1.x", label: "1.x"};
const versions = [current, old];

describe("version routes", () => {
    it.each([
        ["/", ""], ["/guides/setup", ""], ["/1.x", "1.x"], ["/1.x/guides/", "1.x"], ["/1.xy/guides", ""],
    ])("%s belongs to version %j", (path, name) => {
        expect(versionOf(path, versions).name).toBe(name);
    });

    it("strips the version prefix", () => {
        expect(stripVersion("/1.x/guides/setup/", old)).toBe("/guides/setup");
        expect(stripVersion("/1.x", old)).toBe("/");
        expect(stripVersion("/guides", current)).toBe("/guides");
    });

    it("switches to the same page, or the start page of the other version", () => {
        const site = loadSite(project({
            "clay.yaml": "title: T",
            "docs/setup.md": "# Setup",
            "docs/new.md": "# New",
            "versions/1.x/docs/setup.md": "# Setup",
        }), {gitDates: false, env: {}});
        const navs = Object.fromEntries(site.versions.map(version => [version.name, version.nav]));

        expect(switchVersion("/setup", current, old, navs)).toBe("/1.x/setup");
        expect(switchVersion("/new", current, old, navs)).toBe("/1.x");
        expect(switchVersion("/1.x/setup/", old, current, navs)).toBe("/setup");
        expect(switchVersion("/1.x", old, current, navs)).toBe("/");
    });
});

describe("loadSite with versions", () => {
    it("loads older versions under their prefix, newest first", () => {
        const site = loadSite(project({
            "clay.yaml": "title: T\nversion: \"3.x\"",
            "docs/a.md": "# A",
            "versions/1.x/docs/guides/b.md": "# B",
            "versions/1.x/dir-meta.yaml": "- path: guides\n  name: Old guides\n  typo: 1",
            "versions/2.x/docs/c.md": "# C",
            "versions/10.x/docs/d.md": "# D",
        }), {gitDates: false, env: {}});

        expect(site.versions.map(({name, label}) => [name, label])).toEqual([["", "3.x"], ["10.x", "10.x"], ["2.x", "2.x"], ["1.x", "1.x"]]);
        expect(site.pages.map(page => [page.route, page.version])).toEqual([
            ["/a", ""], ["/10.x/d", "10.x"], ["/2.x/c", "2.x"], ["/1.x/guides", "1.x"], ["/1.x/guides/b", "1.x"],
        ]);
        expect(site.versions[3]!.nav.children![0]).toMatchObject({title: "Old guides", displayLink: "/1.x/guides"});
        expect(site.warnings).toEqual(['versions/1.x/dir-meta.yaml: unknown key "[0].typo" is ignored (typo?)']);
    });

    it("skips unusable folders and reports URL clashes", () => {
        const root = project({
            "clay.yaml": "title: T",
            "docs/1.x/a.md": "# A",
            "versions/1.x/docs/a.md": "# A",
            "versions/docs/docs/a.md": "# A",
            "versions/with space/docs/a.md": "# A",
            "versions/empty/notes.txt": "",
        });
        expect(listVersions(root).names).toEqual(["1.x"]);
        expect(loadSite(root, {gitDates: false, env: {}}).warnings).toEqual([
            "versions/docs: not usable as a version name in URLs; the folder is skipped",
            "versions/empty: has no docs/ folder; the folder is skipped",
            "versions/with space: not usable as a version name in URLs; the folder is skipped",
            "versions/1.x: docs/1.x has the same URL as this version; rename one of them",
        ]);
    });
});
