import {describe, expect, it} from "vitest";
import {loadSite} from "../../lib/site";
import {llmsFullTxt, llmsTxt, markdownRouteOf, pageMarkdown, pageOfMarkdown, urlMaker} from "../../server/utils/agent-docs";

const site = loadSite("playground", {gitDates: false, env: {}});
const url = urlMaker("https://example.com", "/docs/");
const page = (route: string) => site.pages.find(p => p.route === route)!;

describe("the Markdown of a page", () => {
    it("lives at the page's path with .md; start pages at index.md", () => {
        expect(markdownRouteOf(page("/reference/feature-tour"))).toBe("/reference/feature-tour.md");
        expect(markdownRouteOf(page("/guides"))).toBe("/guides.md");
        expect(markdownRouteOf(page("/"))).toBe("/index.md");
        expect(markdownRouteOf(page("/de"))).toBe("/de/index.md");
    });

    it("is found from its address, also a folder's index.md", () => {
        expect(pageOfMarkdown(site, "/reference/feature-tour.md")?.route).toBe("/reference/feature-tour");
        expect(pageOfMarkdown(site, "/guides/index.md")?.route).toBe("/guides");
        expect(pageOfMarkdown(site, "/index.md")?.route).toBe("/");
        expect(pageOfMarkdown(site, "/de/index.md")?.route).toBe("/de");
        expect(pageOfMarkdown(site, "/missing.md")).toBeUndefined();
    });

    it("has no front matter, and its links lead to Markdown and published files", () => {
        const markdown = pageMarkdown(page("/reference/feature-tour"), site, url);
        expect(markdown).toMatch(/^# Feature Tour\n/);
        expect(markdown).not.toContain("order: 1");
        expect(markdown).toContain("[Configuration](https://example.com/docs/configuration.md)");
        expect(markdown).toContain("[Security](https://example.com/docs/reference/security.md#forms)");
        expect(markdown).toContain("![Diagram](https://example.com/docs/docs/reference/img/diagram.svg)");
        expect(markdown).toContain("[external](https://example.com)");
    });

    it("keeps code blocks as they are", () => {
        const markdown = pageMarkdown(page("/reference/components"), site, url);
        expect(markdown).toContain("```tree\n");
        expect(markdown).toContain("::: tabs");
    });

    it("gets a title and description when the text has none, and lists a folder's pages without text", () => {
        const start = pageMarkdown(page("/"), site, url);
        expect(start).toMatch(/^# Welcome to the Clay playground\n\n> /);
        const advanced = site.pages.find(p => p.route === "/guides/advanced")!;
        if (!advanced.markdown?.replace(/^---[\s\S]*?---/, "").trim()) {
            expect(pageMarkdown(advanced, site, url)).toContain("- [Advanced Features](https://example.com/docs/guides/advanced/advanced-features.md)");
        }
    });
});

describe("llms.txt", () => {
    const edition = site.editions.find(e => e.prefix === "")!;
    const text = llmsTxt(site, edition, url);

    it("names the site, explains itself and links every page's Markdown, grouped by section", () => {
        expect(text).toMatch(/^# Clay\n\n> /);
        expect(text).toContain("as Markdown for language models and agents");
        expect(text).toContain("## Reference");
        expect(text).toContain("- [Feature Tour](https://example.com/docs/reference/feature-tour.md): Every Markdown feature Clay renders, on one page.");
    });

    it("points to all pages in one file, and to the other languages and versions", () => {
        expect(text).toContain("[All pages in one file](https://example.com/docs/llms-full.txt)");
        expect(text).toContain("(https://example.com/docs/de/llms.txt)");
        expect(text).toContain("(https://example.com/docs/1.x/llms.txt)");
    });

    it("of another language links that language's pages", () => {
        const german = llmsTxt(site, site.editions.find(e => e.prefix === "/de")!, url);
        expect(german).toContain("https://example.com/docs/de/getting-started.md");
        expect(german).not.toContain("https://example.com/docs/getting-started.md");
    });

    it("all pages in one file, each with its address", () => {
        const full = llmsFullTxt(site, edition, url);
        expect(full).toContain("Source: https://example.com/docs/index.md");
        expect(full).toContain("Source: https://example.com/docs/reference/feature-tour.md\n\n# Feature Tour");
    });
});
