// The sanitizer brings its own DOM (jsdom), like it does when rendering docs on the server
import {describe, expect, it} from "vitest";
import {Marked} from "marked";
import {codeToHtml} from "shiki";
import {sanitizeHtml} from "../../server/utils/sanitize";
import {headingIds} from "../../common/markdown-text";
import {transformerCopyButton} from "../../server/utils/code-block";

const render = (md: string) => new Marked().use(headingIds()).parse(md) as string;

describe("sanitizeHtml", () => {
    it.each([
        ["script tags", "<script>alert(1)</script>Text", "<script"],
        ["event handlers", '<img src="x" onerror="alert(1)">', "onerror"],
        ["javascript: links", '<a href="javascript:alert(1)">x</a>', "javascript:"],
        ["frames of other sites", '<iframe src="https://evil.example"></iframe>', "<iframe"],
        ["frames over http", '<iframe src="http://www.youtube.com/embed/x"></iframe>', "<iframe"],
        ["frames of other pages of embed hosts", '<iframe src="https://www.google.com/accounts"></iframe>', "<iframe"],
        ["frames with their own content", '<iframe srcdoc="<script>alert(1)</script>"></iframe>', "<iframe"],
        ["svg scripts", '<svg><script>alert(1)</script></svg>', "<script"],
        ["forms", '<form action="https://evil.example"><input name="password"></form>', "<form"],
        ["form inputs", '<input name="password">', "<input"],
        ["checkboxes outside lists", '<input type="checkbox" name="agree">', "<input"],
        ["other inputs in lists", '<ul><li><input type="password" name="pw"></li></ul>', "<input"],
        ["style tags", "<style>body{display:none}</style>", "<style"],
        ["inline styles outside code", '<div style="position:fixed;inset:0">x</div>', "style="],
    ])("removes %s", (_name, html, forbidden) => {
        expect(sanitizeHtml(html)).not.toContain(forbidden);
    });

    it("keeps the checkboxes of task lists, read-only and without anything else", () => {
        expect(sanitizeHtml(new Marked({gfm: true}).parse("- [ ] Open\n- [x] Done\n") as string))
            .toBe('<ul>\n<li><label><input type="checkbox" disabled="" class="clay-task"> Open</label></li>\n<li><label><input checked="" type="checkbox" disabled="" class="clay-task"> Done</label></li>\n</ul>\n');
        const html = sanitizeHtml('<ul><li><input type="checkbox" name="x" form="f" onclick="alert(1)" autofocus></li></ul>');
        expect(html).toBe('<ul><li><label><input type="checkbox" disabled="" class="clay-task"></label></li></ul>');
        // Nested lists stay below the task's label
        expect(sanitizeHtml(new Marked({gfm: true}).parse("- [ ] Parent\n  - [x] Child\n") as string))
            .toContain('<li><label><input type="checkbox" disabled="" class="clay-task"> Parent</label><ul>');
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

    it("keeps embeds of known players and editors, with safe permissions", () => {
        const html = sanitizeHtml('<iframe src="https://www.youtube.com/embed/abc" name="x" title="Demo" width="560" height="315" '
            + 'allow="autoplay; camera; encrypted-media; picture-in-picture" allowfullscreen></iframe>');
        expect(html).toContain('src="https://www.youtube.com/embed/abc"');
        expect(html).toContain('allow="autoplay; encrypted-media; picture-in-picture"');
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
        expect(html).toContain("allowfullscreen");
        expect(html).not.toContain("name=");
        expect(sanitizeHtml('<iframe src="https://player.vimeo.com/video/1"></iframe>')).toContain("<iframe");
        expect(sanitizeHtml('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>')).toContain("<iframe");
    });

    it("keeps videos and sounds", () => {
        const html = '<video src="demo.mp4" poster="demo.png" controls="" muted="" playsinline=""><track src="demo.vtt" kind="captions"></video><audio src="a.mp3" controls=""></audio>';
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
