import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {applyLayout, describePlan, fixPaths, planLayout, saveVersion, type FixedPath} from "../../lib/versions";
import {loadSite} from "../../lib/site";

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-layout-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

describe("fixPaths", () => {
    const fix = (markdown: string) => {
        const fixed: FixedPath[] = [];
        const text = fixPaths(markdown, "/p/docs/guides/a.md", "/p/docs/latest/guides/a.md", "/p/docs", "a.md", fixed);
        return {text, fixed: fixed.map(f => `${f.from} → ${f.to}`)};
    };

    it("gives paths out of docs/ one more ../ and leaves the others", () => {
        expect(fix("[a](../../src/a.ts#L3) ![b](<../../my logo.svg>) [c](../setup.md) [d](/abs) [e](https://x.y/../..) [f](#top)\n").text)
            .toBe("[a](../../../src/a.ts#L3) ![b](<../../../my logo.svg>) [c](../setup.md) [d](/abs) [e](https://x.y/../..) [f](#top)\n");
        expect(fix('<img src="../../logo.svg"> <a href=\'../../LICENSE\'>License</a>\n[ref]: ../../CHANGELOG.md\n').text)
            .toBe('<img src="../../../logo.svg"> <a href=\'../../../LICENSE\'>License</a>\n[ref]: ../../../CHANGELOG.md\n');
    });

    it("fixes includes everywhere, but links only outside code, where they are examples", () => {
        const markdown = "```yaml\n<!--@include: ../../clay.yaml#variables-->\n![x](../../a.png)\n```\n\\<!--@include: ../../b.md-->\n`[y](../../c.md)`\n";
        expect(fix(markdown)).toEqual({
            text: "```yaml\n<!--@include: ../../../clay.yaml#variables-->\n![x](../../a.png)\n```\n\\<!--@include: ../../b.md-->\n`[y](../../c.md)`\n",
            fixed: ["../../clay.yaml#variables → ../../../clay.yaml#variables"],
        });
    });
});

describe("planLayout", () => {
    it("names what moves, what Clay changes and what it leaves to the author", () => {
        const root = project({
            "clay.yaml": "title: T\nfavicon: docs/img/icon.png\ngenerate:\n  - npx typedoc --out docs/api src\n  - node build.mjs\n",
            ".gitignore": "node_modules/\ndocs/api/\n# docs/old\n",
            "package.json": JSON.stringify({scripts: {docs: "node gen.mjs > docs/cli.md", dev: "clay dev"}}),
            "docs/index.md": "# Home\n",
            "docs/img/icon.png": "",
        });
        const plan = planLayout(root)!;
        expect(plan.settings).toEqual([{key: "favicon", from: "docs/img/icon.png", to: "docs/latest/img/icon.png"}]);
        expect(plan.unchanged).toEqual([
            "clay.yaml generate: npx typedoc --out docs/api src",
            ".gitignore: docs/api/",
            'package.json "docs": node gen.mjs > docs/cli.md',
        ]);
        const text = describePlan(plan, "1.x");
        expect(text).toContain("docs/latest/  at /     the latest docs: docs/ moves here (2 files)");
        expect(text).toContain("docs/1.x/     at /1.x  a copy of docs/latest/");
        expect(text).toContain("clay.yaml favicon: docs/img/icon.png → docs/latest/img/icon.png");
        expect(text).toContain(".gitignore: docs/api/");

        applyLayout(root, plan);
        expect(readFileSync(join(root, "clay.yaml"), "utf8")).toContain("favicon: docs/latest/img/icon.png\n");
        expect(readFileSync(join(root, "docs/latest/index.md"), "utf8")).toBe("# Home\n");
    });

    it("stops before a Clay 3 version whose name cannot be used", () => {
        const root = project({"clay.yaml": "title: T\n", "docs/index.md": "# Home\n", "docs-archive/latest/a.md": "# A\n"});
        expect(() => planLayout(root)).toThrow(/can't be used in URLs/);
    });
});

describe("saveVersion", () => {
    it("keeps the APIs as they are, with copies of their documents", () => {
        const spec = (summary: string) => `openapi: 3.1.0\ninfo: {title: Shop, version: '1'}\npaths:\n  /items:\n    get:\n      operationId: listItems\n      summary: ${summary}\n      responses:\n        '200': {$ref: './parts/ok.yaml'}\n`;
        const root = project({
            "clay.yaml": "title: T\nlanguages: [en, de]\nopenapi:\n  - spec: api/shop.yaml\n    title: {en: Shop, de: Laden}\n",
            "api/shop.yaml": spec("List items"),
            "api/parts/ok.yaml": "description: ok\n",
            "docs/latest/index.md": "# Home\n\n::: request shop listItems\n:::\n",
            "docs/1.x/index.md": "# Old\n",
        });
        expect(saveVersion(root, "4.x").frozen.apis).toBe(1);
        expect(readFileSync(join(root, "docs/4.x/_openapi/apis.yaml"), "utf8")).toContain("- spec: api/shop.yaml\n  title:\n    en: Shop\n    de: Laden\n");
        expect(readFileSync(join(root, "docs/4.x/_openapi/api/parts/ok.yaml"), "utf8")).toBe("description: ok\n");
        // The latest API changes; the version keeps its own
        writeFileSync(join(root, "api/shop.yaml"), spec("List all items"));
        const site = loadSite(root, {gitDates: false, env: {}});
        expect(site.warnings).toEqual([]);
        const title = (route: string) => site.pages.find(page => page.route === route)?.title;
        expect(title("/api/shop/list-items")).toBe("List all items");
        expect(title("/4.x/api/shop/list-items")).toBe("List items");
        expect(title("/4.x/de/api/shop")).toBe("Laden");
        expect(title("/1.x/api/shop")).toBeUndefined();
        expect(site.versions.find(v => v.name === "4.x")!.nav.apis!.map(a => a.displayLink)).toEqual(["/4.x/api/shop"]);
        expect(site.pages.find(page => page.route === "/4.x/api/shop")!.markdown).toContain("(/_clay/4.x/openapi/shop.json)");
    });

    it("fills in variables and includes from outside the version, so the copy keeps today's text", () => {
        const root = project({
            "clay.yaml": "title: T\nlanguages: [en, de]\nvariables: config/variables.yaml\n",
            "config/variables.yaml": "major: \"4\"\nproduct: {en: Docs, de: Doku}\n",
            "src/client.ts": "// #region setup\nconst client = create();\n// #endregion\n",
            "docs/_shared/note.md": "Shared by {{product}}\n",
            "docs/latest/_snippets/local.md": "Clay {{major}}\n",
            "docs/latest/guide.md": [
                "# Clay {{major}} and \\{{major}}",
                "<!--@include: ../../src/client.ts#setup-->",
                "<!--@include: ../_shared/note.md-->",
                "<!--@include: _snippets/local.md-->",
                "\\<!--@include: ../../src/client.ts-->",
                "{{unknown}}",
            ].join("\n") + "\n",
            "docs/latest/guide.de.md": "{{product}} {{major}}\n<!--@include: ../_shared/note.md-->\n",
        });
        const {frozen} = saveVersion(root, "4.x");
        const read = (path: string) => readFileSync(join(root, path), "utf8");
        expect(read("docs/4.x/guide.md")).toBe([
            "# Clay 4 and \\{{major}}",
            "const client = create();",
            "Shared by Docs",
            "<!--@include: _snippets/local.md-->",
            "\\<!--@include: ../../src/client.ts-->",
            "{{unknown}}",
        ].join("\n") + "\n");
        expect(read("docs/4.x/guide.de.md")).toBe("Doku 4\nShared by Doku\n");
        expect(read("docs/4.x/_snippets/local.md")).toBe("Clay 4\n");
        // The latest docs keep their variables
        expect(read("docs/latest/guide.md")).toContain("# Clay {{major}}");
        expect(frozen).toEqual({variables: 6, includes: 3, apis: 0, warnings: []});
    });
});
