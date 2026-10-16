import {describe, expect, it} from "vitest";
import {redirectPage} from "../../server/utils/redirects";

describe("redirectPage", () => {
    const redirect = {from: "/de/install", to: "/de/setup", title: "Einrichtung & mehr", language: "de"};

    it("sends browsers on to the page, keeping the section, and names it for search engines", () => {
        const html = redirectPage(redirect, "/docs/", "https://example.com");
        expect(html).toContain('<html lang="de">');
        expect(html).toContain('<meta http-equiv="refresh" content="0; url=/docs/de/setup/">');
        expect(html).toContain('location.replace("/docs/de/setup/" + location.search + location.hash)');
        expect(html).toContain('<link rel="canonical" href="https://example.com/docs/de/setup/">');
        expect(html).toContain('<meta name="robots" content="noindex">');
        expect(html).toContain("<title>Einrichtung &amp; mehr</title>");
    });

    it("names the page by its path without a siteURL", () => {
        expect(redirectPage(redirect, "/", undefined)).toContain('<link rel="canonical" href="/de/setup/">');
    });
});
