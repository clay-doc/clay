import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {applyLayout, describePlan, fixPaths, planLayout, type FixedPath} from "../../lib/versions";

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
