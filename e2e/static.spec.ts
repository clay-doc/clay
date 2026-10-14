import {expect, test} from "@playwright/test";
import {hydrated, openSearch, watchConsole} from "./helpers";

test.describe("pre-rendered pages", () => {
    test("contain the page and its metadata without JavaScript", async ({request}) => {
        const res = await request.get("reference/feature-tour/");
        expect(res.status()).toBe(200);
        const html = await res.text();

        expect(html).toContain('<h1 id="feature-tour">Feature Tour</h1>');
        expect(html).toContain("<title>Feature Tour · Clay</title>");
        expect(html).toContain('<meta name="description" content="Every Markdown feature Clay renders, on one page.">');
        expect(html).toContain('<link rel="canonical" href="https://clay-doc.github.io/clay/reference/feature-tour/">');
        expect(html).toContain('"@type":"BreadcrumbList"');
        expect(html).toContain('class="shiki');
    });

    test("redirect to the trailing slash and answer unknown pages with 404", async ({request}) => {
        const redirect = await request.get("configuration", {maxRedirects: 0});
        expect(redirect.status()).toBe(301);
        expect(redirect.headers().location).toBe("/clay/configuration/");

        const missing = await request.get("does-not-exist/");
        expect(missing.status()).toBe(404);
    });

    test("publish sitemap, robots.txt and the search index", async ({request}) => {
        const sitemap = await (await request.get("sitemap.xml")).text();
        expect(sitemap).toContain("<loc>https://clay-doc.github.io/clay/reference/feature-tour/</loc>");
        expect(await (await request.get("robots.txt")).text()).toContain("Sitemap: https://clay-doc.github.io/clay/sitemap.xml");
        expect((await request.get("_clay/search.json")).ok()).toBe(true);
    });
});

test.describe("in the browser", () => {
    test("pages hydrate without errors or mismatches", async ({page}) => {
        const messages = watchConsole(page);
        for (const path of ["", "configuration/", "guides/", "reference/feature-tour/"]) {
            await page.goto(path);
            await hydrated(page);
        }
        expect(messages).toEqual([]);
    });

    test("navigation between pages uses the pre-rendered payloads", async ({page}) => {
        await page.goto("reference/feature-tour/");
        await hydrated(page);

        const apiCalls: string[] = [];
        page.on("request", request => {
            if (request.url().includes("/api/")) apiCalls.push(request.url());
        });

        await page.locator(".prose a", {hasText: "Configuration"}).first().click();
        await expect(page).toHaveURL(/\/clay\/configuration$/);
        await expect(page.locator(".prose h1")).toHaveText("Configuration Reference");
        await expect(page).toHaveTitle("Configuration · Clay");
        expect(apiCalls).toEqual([]);
    });

    test("doc links resolve relative to the doc and keep the base path", async ({page}) => {
        await page.goto("reference/feature-tour/");
        // Links inside the doc (the page footer has links too)
        const links = page.locator(".prose a[href]:not(footer a)");

        await expect(links.filter({hasText: /^Security$/})).toHaveAttribute("href", "/clay/reference/security#forms");
        await expect(links.filter({hasText: "external"})).toHaveAttribute("target", "_blank");
        await expect(links.filter({hasText: "mail"})).toHaveAttribute("href", "mailto:team@example.com");
        await expect(page.locator(".prose img")).toHaveAttribute("src", "/clay/docs/reference/img/diagram.svg");
        expect(await page.locator(".prose img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    });

    test("search finds sections despite typos and highlights them on the page", async ({page}) => {
        await page.goto("");
        await hydrated(page);
        await openSearch(page);
        await page.keyboard.type("alerts icns");

        const result = page.locator("dialog[open] ul.menu a").first();
        await expect(result).toContainText("Alerts");
        await page.keyboard.press("Enter");

        await expect(page).toHaveURL(/\/clay\/reference\/feature-tour\?highlight=.*#alerts$/);
        await expect(page.locator(".prose mark.search-hit-active")).toHaveText("Alerts");
    });

    test("the theme toggle switches and remembers the theme", async ({page}) => {
        await page.emulateMedia({colorScheme: "light"});
        await page.goto("reference/feature-tour/");
        await hydrated(page);

        const code = page.locator(".prose pre.shiki span[style*='--shiki']").first();
        const lightColor = await code.evaluate(el => getComputedStyle(el).color);
        await expect(page.locator(".theme-to-dark")).toBeVisible();

        await page.getByRole("button", {name: "Toggle light and dark theme"}).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "clay-dark");
        await expect(page.locator(".theme-to-light")).toBeVisible();
        expect(await code.evaluate(el => getComputedStyle(el).color)).not.toBe(lightColor);

        await page.reload();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "clay-dark");
    });

    test("raw HTML from docs is sanitized", async ({page}) => {
        await page.goto("reference/security/");
        await hydrated(page);

        expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBeUndefined();
        await expect(page.locator(".prose script, .prose form, .prose input, .prose [onerror]")).toHaveCount(0);
        await expect(page.locator(".prose")).toContainText("Text after the attacks.");
    });

    test("code blocks can be copied", async ({page, context}) => {
        await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto("reference/feature-tour/");
        await hydrated(page);

        const block = page.locator(".prose .code-block").first();
        await block.hover();
        await block.locator("button.copy-code").click();
        await expect(block.locator("button.copy-code i")).toHaveClass(/fa-check/);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await block.locator("pre").textContent());
    });

    test("pages show a table of contents, prev/next links and an edit link", async ({page}) => {
        await page.goto("reference/feature-tour/");

        const toc = page.getByRole("navigation", {name: "On this page"});
        await expect(toc.getByRole("link")).toHaveText(["Links", "Images and files", "Code", "Alerts", "Tables"]);
        await expect(page.locator("footer a[rel=next]")).toContainText("Security");
        await expect(page.locator("footer a", {hasText: "Edit this page"}))
            .toHaveAttribute("href", "https://github.com/clay-doc/clay/edit/main/playground/docs/reference/feature-tour.md");
    });

    test("a new page starts at the top", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        const pane = page.locator(".overflow-scroll").first();
        await pane.evaluate(el => el.scrollTop = 1500);

        await page.locator("ul.menu.bg-base-200 a", {hasText: "Getting Started"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Getting Started with Clay");
        expect(await pane.evaluate(el => el.scrollTop)).toBe(0);
    });
});
