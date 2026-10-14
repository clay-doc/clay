import {describe, expect, it} from "vitest";
import {Marked} from "marked";
import {headingIds, inlineText} from "../common/markdown-text";

const render = (md: string) => new Marked().use(headingIds()).parse(md) as string;

describe("headingIds", () => {
    it("adds GitHub-style ids to headings", () => {
        expect(render("## Install Steps")).toBe('<h2 id="install-steps">Install Steps</h2>\n');
    });

    it("slugs the visible text, not the markdown syntax", () => {
        expect(render("### Using `loadLanguage` with [Shiki](https://shiki.style)"))
            .toContain('id="using-loadlanguage-with-shiki"');
    });

    it("de-duplicates repeated headings", () => {
        const html = render("## Usage\n\n## Usage");
        expect(html).toContain('id="usage"');
        expect(html).toContain('id="usage-1"');
    });

    it("starts fresh for every document", () => {
        const md = new Marked().use(headingIds());
        md.parse("## Usage");
        expect(md.parse("## Usage")).toContain('id="usage"');
    });
});

describe("inlineText", () => {
    it("drops inline markdown syntax", () => {
        const [heading] = new Marked().lexer("# **Bold** `code` [link](x) _em_");
        expect(inlineText((heading as any).tokens)).toBe("Bold code link em");
    });
});
