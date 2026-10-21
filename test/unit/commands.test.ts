import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {EDIT_HELP, runCheck, runEdit} from "../../lib/commands";

// Each test works on its own copy of the playground
let root = "";
beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "clay-commands-"));
    for (const entry of ["clay.yaml", "docs", "logo.svg", "openapi"]) cpSync(join("playground", entry), join(root, entry), {recursive: true});
});
afterEach(() => rmSync(root, {recursive: true, force: true}));

const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("clay edit commands", () => {
    it("list every page and folder with its title, order and URL", () => {
        const {code, data} = runEdit(root, ["list"]);
        expect(code).toBe(0);
        const entries = data.entries as { path: string, title: string, url: string, children?: { path: string }[] }[];
        expect(entries[0]).toMatchObject({path: "index.md", kind: "start", url: "/"});
        const reference = entries.find(entry => entry.path === "reference/")!;
        expect(reference.children!.map(child => child.path)).toContain("reference/feature-tour.md");
    });

    it("set front matter fields, typed, and remove them with an empty value", () => {
        expect(runEdit(root, ["set", "reference/security", "title=Safety", "order=7", "description="]).code).toBe(0);
        const text = read("docs/latest/reference/security.md");
        expect(text).toMatch(/title: Safety/);
        expect(text).toMatch(/order: 7/);
        expect(runEdit(root, ["show", "reference/security.md"]).data.entry).toMatchObject({title: "Safety", order: 7});
    });

    it("reject unknown fields and wrong values as usage errors", () => {
        expect(runEdit(root, ["set", "reference/security", "colour=red"])).toMatchObject({code: 2, data: {ok: false}});
        expect(runEdit(root, ["set", "reference/security", "order=first"]).code).toBe(2);
        expect(runEdit(root, ["set", "nowhere", "title=X"])).toMatchObject({code: 1});
    });

    it("create, order, move, rename and delete pages, and report links that broke", () => {
        expect(runEdit(root, ["new", "page", "reference", "Glossary"]).data.written).toEqual(["docs/latest/reference/glossary.md"]);
        runEdit(root, ["order", "reference/glossary", "1"]);
        expect(read("docs/latest/reference/glossary.md")).toMatch(/order: 1/);

        expect(runEdit(root, ["move", "reference/security.md", "guides"]).data.broken).toEqual(
            expect.arrayContaining([expect.stringContaining("security")]));
        expect(existsSync(join(root, "docs/latest/guides/security.md"))).toBe(true);

        runEdit(root, ["rename", "reference/glossary.md", "terms"]);
        expect(existsSync(join(root, "docs/latest/reference/terms.md"))).toBe(true);

        expect(runEdit(root, ["delete", "reference/terms"]).code).toBe(2);
        expect(runEdit(root, ["delete", "reference/terms", "--yes"], {yes: true}).data.deleted).toEqual(["reference/terms.md"]);
    });

    it("translate and set fields in another language", () => {
        expect(runEdit(root, ["translate", "reference/security"], {lang: "de"}).data.written).toEqual(["docs/latest/reference/security.de.md"]);
        runEdit(root, ["set", "reference/security", "title=Sicherheit"], {lang: "de"});
        expect(read("docs/latest/reference/security.de.md")).toMatch(/title: Sicherheit/);
        expect(read("docs/latest/reference/security.md")).not.toMatch(/Sicherheit/);
        expect(runEdit(root, ["order", "reference/security", "1"], {lang: "de"}).code).toBe(1);
    });

    it("read and change clay.yaml, keeping the rest of the file", () => {
        expect(runEdit(root, ["config", "get", "title"]).data.value).toBe("Clay");
        runEdit(root, ["config", "set", "navbar.links.1.icon", "fa-solid fa-book-open"]);
        expect(read("clay.yaml")).toContain('icon: "fa-solid fa-book-open"');
        expect(read("clay.yaml")).toContain("# Sample site used for development");
        runEdit(root, ["config", "add-link", "Blog", "fa-solid fa-rss", "https://example.com/blog"]);
        expect(runEdit(root, ["config", "get", "navbar.links.2.name"]).data.value).toBe("Blog");
    });

    it("explain themselves: unknown commands point to the help", () => {
        expect(runEdit(root, ["frobnicate"])).toMatchObject({code: 2, text: expect.stringContaining('clay edit help')});
        expect(EDIT_HELP).toContain("--json");
        expect(EDIT_HELP).toContain("Exit codes");
    });
});

describe("clay check", () => {
    it("passes for the playground and reports broken links", () => {
        expect(runCheck(root)).toMatchObject({code: 0, data: {ok: true, problems: []}});
        runEdit(root, ["move", "reference/security.md", "guides"]);
        const {code, data} = runCheck(root);
        expect(code).toBe(1);
        expect((data.problems as string[]).some(problem => problem.startsWith("Broken link in"))).toBe(true);
    });
});
