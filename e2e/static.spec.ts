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

        await page.getByRole("button", {name: "Theme"}).click();
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

    test("code blocks can be copied", async ({page, context, browserName}) => {
        // Only Chromium lets a test read the clipboard
        const readable = browserName === "chromium";
        if (readable) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto("reference/feature-tour/");
        await hydrated(page);

        const block = page.locator(".prose .code-block").first();
        await block.hover();
        await block.locator("button.copy-code").click();
        await expect(block.locator("button.copy-code i")).toHaveClass(/fa-check/);
        if (readable) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await block.locator("pre").textContent());
    });

    test("pages show a table of contents, prev/next links and an edit link", async ({page}) => {
        await page.goto("reference/feature-tour/");

        const toc = page.getByRole("navigation", {name: "On this page"});
        await expect(toc.getByRole("link")).toHaveText(["Links", "Images and files", "Code", "Alerts", "Tables"]);
        await expect(page.locator("footer a[rel=next]")).toContainText("Security");
        await expect(page.locator("footer a", {hasText: "Edit this page"}))
            .toHaveAttribute("href", "https://github.com/clay-doc/clay/edit/main/playground/docs/reference/feature-tour.md");
    });

    test("the table of contents marks the sections on screen", async ({page}) => {
        await page.goto("reference/feature-tour/");
        await hydrated(page);
        const toc = page.getByRole("navigation", {name: "On this page"});
        await expect(toc.getByRole("link", {name: "Links"})).toHaveClass(/text-primary/);
        await expect(toc.getByRole("link", {name: "Tables"})).not.toHaveClass(/text-primary/);

        await page.locator("main#content").evaluate(pane => pane.scrollTop = pane.scrollHeight);
        await expect(toc.getByRole("link", {name: "Tables"})).toHaveClass(/text-primary/);
        await expect(toc.getByRole("link", {name: "Links"})).not.toHaveClass(/text-primary/);
    });

    test("the navbar shows its links as icons with tooltips", async ({page}) => {
        await page.goto("configuration/");
        const github = page.locator(".navbar").getByRole("link", {name: "Github"});
        await expect(github).toHaveAttribute("href", "https://github.com/clay-doc/clay");
        await expect(github.locator("xpath=..")).toHaveAttribute("data-tip", "Github");
        await expect(page.locator(".navbar").getByRole("link", {name: "Example"})).toBeVisible();
    });

    test("a new page starts at the top", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        const pane = page.locator("main#content");
        await pane.evaluate(el => el.scrollTop = 1500);

        await page.locator("ul.menu.bg-base-200 a", {hasText: "Getting Started"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Getting Started with Clay");
        expect(await pane.evaluate(el => el.scrollTop)).toBe(0);
    });
});

test.describe("versions", () => {
    test("older versions are pre-rendered under their prefix with their own assets", async ({request}) => {
        const html = await (await request.get("1.x/guides/legacy-setup/")).text();
        expect(html).toContain("This page only exists in version 1.x.");
        expect(html).toContain('src="/clay/docs/1.x/guides/build-steps.svg"');
        expect((await request.get("docs/1.x/guides/build-steps.svg")).ok()).toBe(true);
        expect((await request.get("1.x/")).status()).toBe(200);
        expect((await request.get("_clay/1.x/search.json")).ok()).toBe(true);
    });

    test("an older version shows its own navigation, a banner and version edit links", async ({page}) => {
        const messages = watchConsole(page);
        await page.goto("1.x/getting-started/");
        await hydrated(page);

        await expect(page.locator(".prose h1")).toHaveText("Getting Started with Clay 1.x");
        await expect(page.locator("ul.menu.bg-base-200 > li:not(.sidebar-marker)")).toHaveText([/Getting Started/, /Guides/]);
        await expect(page.locator(".alert[role=status]")).toContainText("These are the docs for version 1.x.");
        await expect(page.locator(".alert[role=status]").getByRole("link")).toHaveAttribute("href", "/clay/getting-started");
        await expect(page.locator("footer a", {hasText: "Edit this page"}))
            .toHaveAttribute("href", "https://github.com/clay-doc/clay/edit/main/playground/docs-archive/1.x/getting-started.md");

        await page.locator(".prose a:not(footer a)", {hasText: "legacy setup"}).click();
        await expect(page).toHaveURL(/\/clay\/1\.x\/guides\/legacy-setup$/);
        expect(messages).toEqual([]);
    });

    test("the switcher keeps the page when the other version has it", async ({page}) => {
        await page.goto("getting-started/");
        await hydrated(page);
        const switcher = page.locator("details", {has: page.getByLabel("Docs version")});

        await expect(switcher.locator("summary")).toHaveText("2.x");
        await switcher.locator("summary").click();
        await switcher.getByRole("link", {name: "1.x"}).click();
        await expect(page).toHaveURL(/\/clay\/1\.x\/getting-started$/);
        await expect(switcher).not.toHaveAttribute("open");

        await page.goto("configuration/");
        await hydrated(page);
        await switcher.locator("summary").click();
        await switcher.getByRole("link", {name: "1.x"}).click();
        await expect(page).toHaveURL(/\/clay\/1\.x$/);
        await expect(page.locator("main, body").getByRole("link", {name: "Guides"}).first()).toBeVisible();
    });

    test("search stays within the version shown", async ({page}) => {
        await page.goto("1.x/");
        await hydrated(page);
        await openSearch(page);
        await page.keyboard.type("legacy");
        await expect(page.locator("dialog[open] ul.menu a").first()).toContainText("Legacy Setup");
        await page.keyboard.press("Escape");

        await page.goto("");
        await hydrated(page);
        await openSearch(page);
        await page.keyboard.type("legacy setup");
        await expect(page.locator("dialog[open]")).toContainText("No results");
    });
});

test.describe("languages", () => {
    test("translated pages are pre-rendered under /de with German interface texts", async ({request}) => {
        const html = await (await request.get("de/getting-started/")).text();
        expect(html).toMatch(/<html\s+lang="de"/);
        expect(html).toContain('<h1 id="erste-schritte-mit-clay">Erste Schritte mit Clay</h1>');
        expect(html).toContain("<title>Erste Schritte · Clay</title>");
        expect(html).toContain("Auf dieser Seite");
        expect(html).toContain('<link rel="canonical" href="https://clay-doc.github.io/clay/de/getting-started/">');
        expect(html).toContain('<link rel="alternate" hreflang="en" href="https://clay-doc.github.io/clay/getting-started/">');
        expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://clay-doc.github.io/clay/getting-started/">');

        const start = await (await request.get("de/")).text();
        expect(start).toContain("Willkommen im Clay-Playground");
        expect(start).toContain("Anleitungen");
        expect((await request.get("_clay/de/search.json")).ok()).toBe(true);
        expect((await request.get("_clay/1.x/de/search.json")).ok()).toBe(true);
    });

    test("untranslated pages show the original with a note and point search engines to it", async ({page, request}) => {
        const html = await (await request.get("de/configuration/")).text();
        expect(html).toContain('<link rel="canonical" href="https://clay-doc.github.io/clay/configuration/">');
        expect(html).not.toContain('<link rel="alternate" hreflang="de"');
        expect(await (await request.get("sitemap.xml")).text()).not.toContain("/clay/de/configuration/");

        await page.goto("de/configuration/");
        await expect(page.getByRole("note")).toHaveText("Diese Seite ist noch nicht übersetzt und wird auf Englisch angezeigt.");
        await expect(page.locator(".prose h1")).toHaveText("Configuration Reference");
    });

    test("the language switcher keeps the version and the page", async ({page}) => {
        const messages = watchConsole(page);
        await page.goto("1.x/getting-started/");
        await hydrated(page);
        const switcher = page.locator("details", {has: page.getByLabel("Language")});

        await switcher.locator("summary").click();
        await switcher.getByRole("link", {name: "Deutsch"}).click();
        await expect(page).toHaveURL(/\/clay\/1\.x\/de\/getting-started$/);
        await expect(page.locator(".prose h1")).toHaveText("Erste Schritte mit Clay 1.x");
        await expect(page.locator("html")).toHaveAttribute("lang", "de");
        await expect(page.locator(".alert[role=status]")).toContainText("Dies ist die Dokumentation für Version 1.x.");
        await expect(page.locator(".alert[role=status]").getByRole("link")).toHaveAttribute("href", "/clay/de/getting-started");

        // Links inside a translation stay in its language
        await page.locator(".prose a:not(footer a)", {hasText: "alte Einrichtung"}).click();
        await expect(page).toHaveURL(/\/clay\/1\.x\/de\/guides\/legacy-setup$/);
        await expect(page.locator(".prose img")).toHaveAttribute("src", "/clay/docs/1.x/guides/build-steps.svg");
        expect(messages).toEqual([]);
    });

    test("search stays within the language shown", async ({page}) => {
        await page.goto("de/");
        await hydrated(page);
        await openSearch(page);
        await expect(page.locator("dialog[open] input")).toHaveAttribute("placeholder", "Dokumentation durchsuchen");
        await page.keyboard.type("voraussetzungen");
        const result = page.locator("dialog[open] ul.menu a").first();
        await expect(result).toContainText("Voraussetzungen");
        await expect(result).toHaveAttribute("href", /\/clay\/de\/getting-started/);
    });
});

test.describe("index pages", () => {
    test("docs/index.md is the start page, with a large header and a list of pages", async ({request}) => {
        const html = await (await request.get("")).text();
        expect(html).toContain("Welcome to the Clay playground</h1>");
        expect(html).toContain("This playground shows every part of a Clay site.");
        expect(html).toContain('href="/clay/guides"');
        expect(await (await request.get("de/")).text()).toContain("Willkommen im Clay-Playground</h1>");
    });

    test("a folder's index.md is its page; without text, the folder lists its pages", async ({request}) => {
        const guides = await (await request.get("guides/")).text();
        expect(guides).toContain('<h1 id="guides">Guides</h1>');
        expect(guides).toContain("Step-by-step guides for organizing");
        // Relative links in index.md start from its folder
        expect(guides).toContain('href="/clay/configuration"');
        const advanced = await (await request.get("guides/advanced/")).text();
        expect(advanced).toContain("Advanced Features");
        expect(advanced).toContain('href="/clay/guides/advanced/advanced-features"');
        expect(guides).toContain("<hr><h2>In this section</h2>");
        expect(advanced).toContain("<h2>In this section</h2>");
        // Every folder's page is part of previous and next
        const features = await (await request.get("guides/advanced/advanced-features")).text();
        expect(features).toMatch(/<a href="\/clay\/guides\/advanced"[^>]*rel="prev"/);
    });

    test("folders open their page; the arrow shows and hides their entries", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        const sidebar = page.locator("ul.menu.bg-base-200");

        await sidebar.getByRole("link", {name: /^\W*Guides$/}).click();
        await expect(page).toHaveURL(/\/clay\/guides$/);
        await expect(page.locator(".prose h1")).toHaveText("Guides");

        const toggle = sidebar.getByRole("button", {name: "Show or hide Guides"});
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await toggle.click();
        await expect(sidebar.getByRole("link", {name: "Organizing Pages"})).toBeHidden();
        await expect(page).toHaveURL(/\/clay\/guides$/);
        await toggle.click();
        await expect(sidebar.getByRole("link", {name: "Organizing Pages"})).toBeVisible();
    });

    test("a mark in the sidebar follows the active entry", async ({page}) => {
        await page.goto("guides/advanced/advanced-features");
        await hydrated(page);
        const sidebar = page.locator("ul.menu.bg-base-200");
        const marker = sidebar.locator(".sidebar-marker");
        const top = (locator: typeof marker) => locator.evaluate(el => Math.round(el.getBoundingClientRect().top));

        await expect(marker).toHaveCSS("opacity", "1");
        expect(await top(marker)).toBe(await top(sidebar.locator("a.menu-active")));
        await sidebar.getByRole("link", {name: "Feature Tour"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Feature Tour");
        await expect.poll(async () => await top(marker) - await top(sidebar.locator("a.menu-active"))).toBe(0);

        // Hidden with its folder
        await sidebar.getByRole("button", {name: "Show or hide Reference"}).click();
        await expect(marker).toHaveCSS("opacity", "0");
    });

    test("a page stays on screen until the next one has loaded, without a 404 in between", async ({page}) => {
        await page.goto("guides/");
        await hydrated(page);
        await page.evaluate(() => {
            const w = window as unknown as { notFound: boolean };
            w.notFound = false;
            new MutationObserver(() => { if (document.body.innerText.includes("Page Not Found")) w.notFound = true; })
                .observe(document.body, {subtree: true, childList: true, characterData: true});
        });
        await page.locator("ul.menu.bg-base-200").getByRole("link", {name: "Organizing Pages"}).click();
        await expect(page.locator(".prose h1")).toContainText("Organiz");
        expect(await page.evaluate(() => (window as unknown as { notFound: boolean }).notFound)).toBe(false);
    });

    test("navbar dropdowns close on a click elsewhere, Escape and another dropdown", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        const versions = page.locator("details", {has: page.getByLabel("Docs version")});
        const languages = page.locator("details", {has: page.getByLabel("Language")});

        await versions.locator("summary").click();
        await expect(versions).toHaveAttribute("open");
        await languages.locator("summary").click();
        await expect(versions).not.toHaveAttribute("open");
        await expect(languages).toHaveAttribute("open");

        await page.locator(".prose h1").click();
        await expect(languages).not.toHaveAttribute("open");

        await versions.locator("summary").click();
        await page.keyboard.press("Escape");
        await expect(versions).not.toHaveAttribute("open");
    });
});
