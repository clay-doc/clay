// @vitest-environment happy-dom
import {describe, expect, it} from "vitest";
import {isAssetLink, resolveDocAsset, resolveDocLink, rewriteDocHtml} from "../common/doc-links";

describe("resolveDocLink", () => {
    it.each([
        // relative to the doc's file, regardless of a trailing slash in the URL
        ["./other.md", "/guides/setup", "/guides/other"],
        ["./other.md", "/guides/setup/", "/guides/other"],
        ["other", "/guides/setup", "/guides/other"],
        // index.md is its folder's page
        ["../index.md", "/guides/setup", "/"],
        ["index.md#intro", "/guides/setup", "/guides#intro"],
        ["setup.md", "/guides/index", "/guides/setup"],
        ["advanced/deep.md#usage", "/guides/setup", "/guides/advanced/deep#usage"],
        ["sub/", "/guides/setup", "/guides/sub"],
        // absolute paths stay as they are
        ["/reference/index.md", "/guides/setup", "/reference"],
        ["/guides/setup.md?highlight=x", "/a", "/guides/setup?highlight=x"],
        ["/Guide.MD", "/a", "/Guide"],
        // in-page anchors
        ["#install", "/guides/setup", "#install"],
    ])("%j on %j => %j", (href, docPath, expected) => {
        expect(resolveDocLink(href, docPath)).toBe(expected);
    });

    it.each([
        "https://example.com/docs",
        "http://example.com",
        "mailto:team@example.com",
        "tel:+123",
        "//cdn.example.com/file",
    ])("leaves %j to the browser", href => {
        expect(resolveDocLink(href, "/guides/setup")).toBeUndefined();
    });
});

describe("resolveDocAsset", () => {
    it.each([
        ["img.png", "/guides/setup", "/docs/guides/img.png"],
        ["./img/a.png", "/guides/setup/", "/docs/guides/img/a.png"],
        ["../shared/logo.svg", "/guides/setup", "/docs/shared/logo.svg"],
        ["file.pdf#page=2", "/index", "/docs/file.pdf#page=2"],
    ])("%j on %j => %j", (ref, docPath, expected) => {
        expect(resolveDocAsset(ref, docPath)).toBe(expected);
    });

    it.each(["/images/a.png", "https://x.dev/a.png", "data:image/png;base64,AAAA", "#top"])("leaves %j alone", ref => {
        expect(resolveDocAsset(ref, "/guides/setup")).toBeUndefined();
    });
});

describe("isAssetLink", () => {
    it.each([["file.pdf", true], ["img/a.PNG?x=1", true], ["other.md", false], ["other", false], ["../dir/", false], ["#a.b", false]])(
        "%j => %j", (href, expected) => {
            expect(isAssetLink(href)).toBe(expected);
        });
});

describe("rewriteDocHtml", () => {
    const routeHref = (route: string) => "/base" + route;
    const rewrite = (html: string) => {
        const root = document.createElement("div");
        root.innerHTML = rewriteDocHtml(html, "/guides/setup", "/base/", routeHref);
        return root;
    };

    it("points doc links at their routes", () => {
        const a = rewrite('<a href="./other.md#x">o</a>').querySelector("a")!;
        expect(a.getAttribute("href")).toBe("/base/guides/other#x");
        expect(a.dataset.route).toBe("/guides/other#x");
    });

    it("points relative videos, their posters and sounds into docs/", () => {
        const root = rewrite('<video src="demo.mp4" poster="img/demo.png"><source src="demo.webm"><track src="demo.vtt"></video><audio src="/a.mp3"></audio>');
        expect(root.querySelector("video")!.getAttribute("src")).toBe("/base/docs/guides/demo.mp4");
        expect(root.querySelector("video")!.getAttribute("poster")).toBe("/base/docs/guides/img/demo.png");
        expect(root.querySelector("source")!.getAttribute("src")).toBe("/base/docs/guides/demo.webm");
        expect(root.querySelector("track")!.getAttribute("src")).toBe("/base/docs/guides/demo.vtt");
        expect(root.querySelector("audio")!.getAttribute("src")).toBe("/a.mp3");
    });

    it("points relative images and files into docs/", () => {
        const root = rewrite('<img src="img.png" alt=""><a href="files/guide.pdf">pdf</a>');
        expect(root.querySelector("img")!.getAttribute("src")).toBe("/base/docs/guides/img.png");
        expect(root.querySelector("a")!.getAttribute("href")).toBe("/base/docs/guides/files/guide.pdf");
        expect(root.querySelector("a")!.dataset.route).toBeUndefined();
    });

    it("opens external links in a new tab and leaves other schemes alone", () => {
        const root = rewrite('<a href="https://x.dev/a.png">x</a><a href="mailto:a@b.c">m</a>');
        const [external, mail] = root.querySelectorAll("a");
        expect(external!.getAttribute("target")).toBe("_blank");
        expect(external!.getAttribute("rel")).toBe("noopener noreferrer");
        expect(external!.getAttribute("href")).toBe("https://x.dev/a.png");
        expect(mail!.getAttribute("href")).toBe("mailto:a@b.c");
        expect(mail!.hasAttribute("target")).toBe(false);
    });

    it("keeps the rest of the markup", () => {
        const html = '<h2 id="a">A</h2><pre><code>x &lt; y</code></pre>';
        expect(rewriteDocHtml(html, "/a", "/", r => r)).toBe(html);
    });
});
