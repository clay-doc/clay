import {describe, expect, it} from "vitest";
import {absoluteUrl, breadcrumbs, ogLocale, pageTitle, resolveOrigin, routePath, sitemapXml, truncate, websiteData} from "../../common/seo";

describe("resolveOrigin", () => {
    it.each([
        [undefined, "/", undefined, "siteURL is not set"],
        ["https://x.dev", "/docs/", "https://x.dev", undefined],
        ["https://x.dev/", "/", "https://x.dev", undefined],
        ["https://o.github.io/repo", "/repo/", "https://o.github.io", undefined],
        ["https://x.dev/b", "/a/", "https://x.dev", "is ignored"],
        ["x.dev", "/", undefined, "not an absolute"],
        ["ftp://x.dev", "/", undefined, "not an absolute"],
        ["http://localhost:8080", "/", "http://localhost:8080", undefined],
    ])("%j with base %j", (siteURL, base, origin, warning) => {
        const result = resolveOrigin(siteURL, base);
        expect(result.origin).toBe(origin);
        if (warning) expect(result.warning).toContain(warning);
        else expect(result.warning).toBeUndefined();
    });
});

describe("URLs", () => {
    it("serves pages at <route>/ under the base path", () => {
        expect(routePath("/repo/", "/")).toBe("/repo/");
        expect(routePath("/", "/guides/my page")).toBe("/guides/my%20page/");
        expect(absoluteUrl("https://o.github.io", "/repo/", "/a")).toBe("https://o.github.io/repo/a/");
        expect(absoluteUrl(undefined, "/", "/a")).toBeUndefined();
    });
});

describe("pageTitle", () => {
    it("appends the site title", () => {
        expect(pageTitle("Setup", "Clay")).toBe("Setup · Clay");
        expect(pageTitle("Clay", "Clay")).toBe("Clay");
        expect(pageTitle(undefined, "Clay")).toBe("Clay");
    });
});

describe("truncate", () => {
    it("cuts long text at a word", () => {
        const long = "word ".repeat(60).trim();
        expect(truncate(long)).toBe("word ".repeat(31).trim() + "…");
        expect(truncate("short")).toBe("short");
    });
});

describe("breadcrumbs", () => {
    it("lists the trail with absolute URLs, escaped for a script tag", () => {
        const json = breadcrumbs([{title: "Guides", route: "/guides"}, {title: "</script>", route: "/guides/x"}], "https://x.dev", "/");
        expect(json).toContain('"position":1,"name":"Guides","item":"https://x.dev/guides/"');
        expect(json).not.toContain("</script>");
        expect(JSON.parse(json!).itemListElement[1].name).toBe("</script>");
    });

    it("needs an origin and a parent", () => {
        expect(breadcrumbs([{title: "A", route: "/a"}], "https://x.dev", "/")).toBeUndefined();
        expect(breadcrumbs([{title: "A", route: "/a"}, {title: "B", route: "/a/b"}], undefined, "/")).toBeUndefined();
    });
});

describe("sitemapXml", () => {
    it("lists URLs with optional last-modified dates", () => {
        const xml = sitemapXml([{loc: "https://x.dev/"}, {loc: "https://x.dev/a?b&c/", lastmod: "2026-01-01T00:00:00Z"}]);
        expect(xml).toContain("<url><loc>https://x.dev/</loc></url>");
        expect(xml).toContain("<url><loc>https://x.dev/a?b&#38;c/</loc><lastmod>2026-01-01T00:00:00Z</lastmod></url>");
    });
});

describe("og:locale and WebSite data", () => {
    it("write regions with an underscore and do not guess them", () => {
        expect(["en", "de", "pt-BR", "zh-TW"].map(ogLocale)).toEqual(["en", "de", "pt_BR", "zh_TW"]);
    });

    it("name the site on start pages, safely inside a script tag", () => {
        expect(JSON.parse(websiteData("Docs </script>", "https://x.dev/", "de"))).toEqual({
            "@context": "https://schema.org", "@type": "WebSite", name: "Docs </script>", url: "https://x.dev/", inLanguage: "de",
        });
        expect(websiteData("Docs </script>", "https://x.dev/", "de")).not.toContain("</script>");
    });
});
