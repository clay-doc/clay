// The sanitizer brings its own DOM (jsdom), like it does when rendering docs on the server
import {describe, expect, it} from "vitest";
import {Marked} from "marked";
import {codeToHtml} from "shiki";
import {sanitizeHtml} from "../server/utils/sanitize";
import {headingIds} from "../common/markdown-text";
import {transformerCopyButton} from "../server/utils/code-block";

const render = (md: string) => new Marked().use(headingIds()).parse(md) as string;

describe("sanitizeHtml", () => {
    it.each([
        ["script tags", "<script>alert(1)</script>Text", "<script"],
        ["event handlers", '<img src="x" onerror="alert(1)">', "onerror"],
        ["javascript: links", '<a href="javascript:alert(1)">x</a>', "javascript:"],
        ["iframes", '<iframe src="https://evil.example"></iframe>', "<iframe"],
        ["svg scripts", '<svg><script>alert(1)</script></svg>', "<script"],
        ["forms", '<form action="https://evil.example"><input name="password"></form>', "<form"],
        ["form inputs", '<input name="password">', "<input"],
        ["style tags", "<style>body{display:none}</style>", "<style"],
        ["inline styles outside code", '<div style="position:fixed;inset:0">x</div>', "style="],
    ])("removes %s", (_name, html, forbidden) => {
        expect(sanitizeHtml(html)).not.toContain(forbidden);
    });

    it("keeps heading ids, including ones DOMPurify would treat as clobbering", () => {
        const html = sanitizeHtml(render("## Title\n\n## Images\n\n## Install"));
        expect(html).toContain('id="title"');
        expect(html).toContain('id="images"');
        expect(html).toContain('id="install"');
    });

    it("keeps regular markdown output", () => {
        const html = render("Some **bold** [link](https://x.dev \"t\") and `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n![alt](img.png)");
        expect(sanitizeHtml(html)).toBe(html);
    });

    it("keeps highlighted code blocks and their copy button", async () => {
        const html = await codeToHtml("const a = 1;", {
            lang: "js",
            themes: {light: "light-plus", dark: "dark-plus"},
            defaultColor: false,
            transformers: [transformerCopyButton()],
        });
        const clean = sanitizeHtml(html);
        expect(clean).toContain("--shiki-dark:");
        expect(clean).toContain('class="copy-code');
        expect(clean).toContain('type="button"');
    });
});
