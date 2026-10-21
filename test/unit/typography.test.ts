import {describe, expect, it} from "vitest";
import {typeset} from "../../common/typography";
import {renderDoc} from "../../server/utils/render-doc";
import {messagesFor} from "../../common/i18n";

const en = "“”‘’";

describe("typeset", () => {
    it("sets arrows, dashes, ellipses and symbols", () => {
        expect(typeset("a -> b <- c <-> d => e <=> f", en)).toBe("a → b ← c ↔ d ⇒ e ⇔ f");
        expect(typeset("x <= 1, y >= 2, z != 3", en)).toBe("x ≤ 1, y ≥ 2, z ≠ 3");
        expect(typeset("pages 1--2, wait -- then --- done...", en)).toBe("pages 1–2, wait – then — done…");
        expect(typeset("(c) 2026 (r) (TM) +-5", en)).toBe("© 2026 ® ™ ±5");
    });

    it("leaves options, longer runs and comparisons in code-like text alone", () => {
        expect(typeset("run with --strict or --yes", en)).toBe("run with --strict or --yes");
        expect(typeset("a ---- b, a <-- b, a --> b, a == b, a ==> b, four....", en)).toBe("a ---- b, a <-- b, a --> b, a == b, a ==> b, four....");
    });

    it("sets quotes and apostrophes of the language", () => {
        expect(typeset(`"Hello," she said, 'it's here.'`, en)).toBe("“Hello,” she said, ‘it’s here.’");
        expect(typeset(`Er sagte "Hallo" und 'tschüss'`, "„“‚‘")).toBe("Er sagte „Hallo“ und ‚tschüss‘");
        expect(typeset(`Il dit "bonjour"`, "«»“”")).toBe("Il dit «bonjour»");
    });

    it("judges a quote at the start by the text before it", () => {
        // A closing quote after "**bold**"
        expect(typeset(`" said.`, en, "d")).toBe("” said.");
        expect(typeset(`"quoted`, en, " ")).toBe("“quoted");
    });
});

describe("typography of pages", () => {
    const html = async (markdown: string, language = "en") => (await renderDoc(markdown, "/page", "/", "", "/page", messagesFor(language))).html;

    it("sets the text, but not code, addresses, escapes or HTML", async () => {
        const out = await html([
            `## Before -> after`,
            ``,
            `"Quoted" with \`code -> "here"\`, https://a.example/x--y and \\-> kept.`,
            ``,
            "```js",
            `a => "b"`,
            "```",
            ``,
            `<span title="a -> b">x -> y</span>`,
            ``,
            `**"Bold"** quote.`,
        ].join("\n"));
        // The heading's id is made from the text as written, like on GitHub
        expect(out).toContain(`<h2 id="before---after">`);
        expect(out).toContain(`Before → after</h2>`);
        expect(out).toContain(`“Quoted” with <code>code -&gt; "here"</code>`);
        expect(out).toContain(`>https://a.example/x--y</a>`);
        expect(out).toContain(`-&gt; kept.`);
        // Attributes stay as written; text inside HTML is text
        expect(out).toContain(`<span title="a -> b">x → y</span>`);
        expect(out).toContain(`> =&gt;</span>`);
        expect(out).toContain(`<strong>“Bold”</strong> quote.`);
    });

    it("leaves alerts their own markers", async () => {
        const out = await html(`> [!TIP]\n> A "better" way -> here.`);
        expect(out).toContain("A “better” way → here.");
        expect(out).not.toContain("[!TIP]");
    });

    it("uses the quotes of the page's language", async () => {
        expect(await html(`Er sagte "Hallo".`, "de")).toContain("Er sagte „Hallo“.");
    });

    it("leaves prompts as written", async () => {
        expect(await html(`::: prompt\nWrite "docs" -> now\n:::`)).toContain(`Write "docs" -&gt; now`);
    });
});
