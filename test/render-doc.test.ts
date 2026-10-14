import {describe, expect, it} from "vitest";
import {renderDoc} from "../server/utils/render-doc";

const doc = `---
title: Setup
---
# Setup

Install **Clay** and see [the guide](./guide.md#start), [an image](img/a.png) or [mail](mailto:a@b.c).

![Diagram](img/diagram.svg)

## Install

\`\`\`ts
const a: number = 1;
\`\`\`

\`\`\`no-such-language
plain
\`\`\`

### Details

<script>alert(1)</script>
`;

describe("renderDoc", async () => {
    const rendered = await renderDoc(doc, "/guides/setup", "/repo/");

    it("renders headings with anchors and a table of contents", () => {
        expect(rendered.html).toContain('<h1 id="setup">Setup</h1>');
        expect(rendered.toc).toEqual([
            {id: "install", text: "Install", level: 2},
            {id: "details", text: "Details", level: 3},
        ]);
    });

    it("highlights code in both themes and falls back to plain text", () => {
        expect(rendered.html).toContain("--shiki-dark:");
        expect(rendered.html.match(/class="code-block"/g)).toHaveLength(2);
        expect(rendered.html).toContain("plain");
    });

    it("resolves links and images for the base URL", () => {
        expect(rendered.html).toContain('href="/repo/guides/guide#start" data-route="/guides/guide#start"');
        expect(rendered.html).toContain('href="/repo/docs/guides/img/a.png"');
        expect(rendered.html).toContain('src="/repo/docs/guides/img/diagram.svg"');
        expect(rendered.html).toContain('href="mailto:a@b.c"');
    });

    it("sanitizes the output", () => {
        expect(rendered.html).not.toContain("<script");
    });

    it("describes the page with its first paragraph, or its front matter", async () => {
        expect(rendered.description).toBe("Install Clay and see the guide, an image or mail.");
        const described = await renderDoc("---\ndescription: From front matter\n---\nText.", "/a", "/");
        expect(described.description).toBe("From front matter");
        expect((await renderDoc("# Only a heading", "/a", "/", "Site fallback")).description).toBe("Site fallback");
    });
});

describe("renderDoc in parallel", () => {
    it("numbers heading ids per document", async () => {
        const markdown = "## Links\n\n```ts\nconst a = 1;\n```\n\n## Links\n";
        const docs = await Promise.all([1, 2, 3].map(() => renderDoc(markdown, "/page", "/")));
        for (const rendered of docs) expect(rendered.toc.map(entry => entry.id)).toEqual(["links", "links-1"]);
    });

    it("resolves files against the asset path, e.g. without a language prefix", async () => {
        const {html} = await renderDoc("![A](img/a.png)", "/1.x/de/guides/page", "/base/", "", "/1.x/guides/page");
        expect(html).toContain('src="/base/docs/1.x/guides/img/a.png"');
    });
});
