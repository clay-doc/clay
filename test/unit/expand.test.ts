import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {createExpander} from "../../lib/expand";
import {loadSite} from "../../lib/site";

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-expand-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

const root = project({
    "docs/_snippets/install.md": "---\ntitle: Snippet\n---\nRun `npm install`.\n\nVersion {{version}}.\n",
    "docs/_snippets/nested.md": "Before\n<!--@include: install.md-->\n",
    "docs/_snippets/loop.md": "<!--@include: loop.md-->\n",
    "src/example.ts": "// #region setup\nconst a = 1;\n// #endregion\nconst b = 2;\nconst c = 3;\n",
});

describe("snippets and variables", () => {
    const warnings: string[] = [];
    const expander = createExpander(root, warnings);
    const expand = (markdown: string) => expander.expand(markdown, join(root, "docs/guides/page.md"), {version: "4.0.0"});

    it("include a file without its front matter, relative to the page", () => {
        expect(expand("# Page\n\n<!--@include: ../_snippets/install.md-->\n\nAfter"))
            .toBe("# Page\n\nRun `npm install`.\n\nVersion 4.0.0.\n\nAfter");
    });

    it("include lines or a region of a file, and indent it like the include", () => {
        expect(expand("```ts\n<!--@include: ../../src/example.ts{4,5}-->\n```")).toBe("```ts\nconst b = 2;\nconst c = 3;\n```");
        expect(expand("```ts\n<!--@include: ../../src/example.ts{4,}-->\n```")).toBe("```ts\nconst b = 2;\nconst c = 3;\n```");
        expect(expand("1. Step\n\n   <!--@include: ../../src/example.ts#setup-->")).toBe("1. Step\n\n   const a = 1;");
        expect(expander.included).toContain(join("src", "example.ts"));
    });

    it("include what included files include, relative to them", () => {
        expect(expand("<!--@include: ../_snippets/nested.md-->")).toBe("Before\nRun `npm install`.\n\nVersion 4.0.0.");
    });

    it("keep escaped includes and variables, and unknown variables, as written", () => {
        expect(expand("\\<!--@include: ../_snippets/install.md-->\n\n\\{{version}} {{ version }} {{count}}"))
            .toBe("<!--@include: ../_snippets/install.md-->\n\n{{version}} 4.0.0 {{count}}");
    });

    it("leave out files that do not exist, are outside the project or loop, with a warning", () => {
        warnings.length = 0;
        expect(expand("<!--@include: gone.md-->\n<!--@include: ../../../outside.md-->\n<!--@include: ../_snippets/loop.md-->\nText")).toBe("\n\n\nText");
        expect(warnings).toEqual([
            'docs/guides/page.md: includes "gone.md", which does not exist; it is left out',
            'docs/guides/page.md: includes "../../../outside.md", which is outside the project; it is left out',
            'docs/_snippets/loop.md: includes "loop.md", which leads back to this file; it is left out',
        ]);
    });
});

describe("snippets and variables in a site", () => {
    it("are filled in for every page, with the variables of its language; _ files are no pages", () => {
        const site = loadSite(project({
            "clay.yaml": 'title: Docs\nlanguages: ["en", "de"]\nvariables:\n  version: "4.0"\n  product: {en: "Clay", de: "Ton"}\n',
            "docs/index.md": "# {{product}} {{version}}\n\n<!--@include: _parts/note.md-->\n",
            "docs/index.de.md": "# {{product}} {{version}}\n",
            "docs/_parts/note.md": "A note.\n",
        }), {gitDates: false, env: {}});
        expect(site.pages.map(page => page.route)).toEqual(["/", "/de"]);
        expect(site.pages[0]!.markdown).toBe("# Clay 4.0\n\nA note.\n");
        expect(site.pages[0]!.title).toBe("Clay 4.0");
        expect(site.pages[1]!.markdown).toBe("# Ton 4.0\n");
        expect(site.included).toEqual([join("docs", "_parts", "note.md")]);
        expect(site.warnings).toEqual([]);
    });
});
