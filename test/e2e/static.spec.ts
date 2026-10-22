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
        expect(html).toContain('<link rel="sitemap" type="application/xml" href="https://clay-doc.github.io/clay/sitemap.xml">');
        expect(html).toContain('class="shiki');
        // Icons drawn from the favicon (lib/icons.ts), and the page's locale
        expect(html).toContain('<link rel="icon" href="/clay/favicon.ico" sizes="32x32">');
        expect(html).toContain('<link rel="icon" href="/clay/logo.svg" type="image/svg+xml">');
        expect(html).toContain('<link rel="apple-touch-icon" href="/clay/_clay/icons/apple-touch-icon.png">');
        expect(html).toContain('<meta property="og:locale" content="en">');
        expect((await request.get("favicon.ico")).headers()["content-type"]).toMatch(/icon/);
        expect((await request.get("_clay/icons/apple-touch-icon.png")).ok()).toBe(true);
    });

    test("start pages name the site for search engines, and translated pages their other languages", async ({request}) => {
        const start = await (await request.get("")).text();
        expect(start).toContain('"@type":"WebSite","name":"Clay","url":"https://clay-doc.github.io/clay/","inLanguage":"en"');
        expect(start).not.toContain('"@type":"BreadcrumbList"');
        const german = await (await request.get("de/getting-started/")).text();
        expect(german).toContain('<meta property="og:locale" content="de">');
        expect(german).toContain('<meta property="og:locale:alternate" content="en">');
    });

    test("redirect to the trailing slash and answer unknown pages with 404", async ({request}) => {
        const redirect = await request.get("configuration", {maxRedirects: 0});
        expect(redirect.status()).toBe(301);
        expect(redirect.headers().location).toBe("/clay/configuration/");

        const missing = await request.get("does-not-exist/");
        expect(missing.status()).toBe(404);
    });

    test("old addresses of pages lead to them, keeping the section and the language", async ({page, request}) => {
        await page.goto("quick-start#prerequisites");
        await expect(page).toHaveURL(/\/clay\/getting-started\/#prerequisites$/);
        await page.goto("de/quick-start");
        await expect(page).toHaveURL(/\/clay\/de\/getting-started\/$/);
        await expect(page.locator(".prose h1")).toHaveText("Erste Schritte mit Clay");
        expect(await (await request.get("sitemap.xml")).text()).not.toContain("quick-start");
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
        await expect(page.locator('.prose img[alt="Diagram"]')).toHaveAttribute("src", "/clay/docs/reference/img/diagram.svg");
        expect(await page.locator('.prose img[alt="Diagram"]').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    });

    test("images shown smaller than they are open in full, by pointer and keyboard", async ({page}) => {
        await page.goto("reference/feature-tour/");
        const screenshot = page.locator('.prose img[alt="The playground in a wide window"]');
        const zoom = page.locator("dialog.clay-zoom");
        await expect(screenshot).toHaveAttribute("role", "button");
        await expect(screenshot).toHaveAttribute("aria-label", "Enlarge image: The playground in a wide window");
        // The diagram is no bigger than it is shown
        await expect(page.locator('.prose img[alt="Diagram"]')).not.toHaveClass(/clay-zoomable/);

        await screenshot.click();
        await expect(zoom).toBeVisible();
        await expect(zoom.locator("figcaption")).toHaveText("The playground in a wide window");
        await page.keyboard.press("Escape");
        await expect(zoom).toBeHidden();
        await expect(screenshot).toBeFocused();

        await page.keyboard.press("Enter");
        await expect(zoom).toBeVisible();
        await zoom.click({position: {x: 10, y: 10}});
        await expect(zoom).toBeHidden();
    });

    test("printed, a page is its text alone, with every tab and folded text shown", async ({page}) => {
        await page.goto("reference/components/");
        await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
        await page.emulateMedia({media: "print"});
        await expect(page.locator("html")).toHaveAttribute("data-theme", "clay-light");
        await expect(page.locator(".navbar").first()).toBeHidden();
        await expect(page.locator("aside")).toBeHidden();
        const panels = page.locator(".clay-tab-panel");
        for (let i = 0; i < await panels.count(); i++) await expect(panels.nth(i)).toBeVisible();
        await expect(page.getByText("Hidden folded text.")).toBeVisible();

        await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await page.emulateMedia({media: "screen"});
        await expect(page.getByText("Hidden folded text.")).toBeHidden();
    });

    test("asks whether a page helped where analytics count events, once per page while the site is open", async ({page}) => {
        await page.goto("reference/feature-tour/");
        // The playground has no analytics: nothing to send the answer to
        await expect(page.locator(".clay-feedback")).toHaveCount(0);

        // As the analytics plugin leaves it with a service loaded (Plausible)
        await page.addInitScript(() => Object.assign(window, {
            clayAnalyticsEvents: true, clayFeedback: true,
            plausible: (...args: unknown[]) => ((window as unknown as { sent: unknown[] }).sent ??= []).push(args),
        }));
        await page.reload();
        const feedback = page.locator(".clay-feedback");
        await expect(feedback).toContainText("Was this page helpful?");
        await feedback.getByRole("button", {name: "No"}).click();
        await expect(feedback).toHaveText("Thanks for your feedback!");
        expect(await page.evaluate(() => (window as unknown as { sent: unknown[] }).sent))
            .toEqual([["Page feedback", {props: {page: "/reference/feature-tour", helpful: "no"}}]]);
        // Back on the page, it is not asked again; nothing is stored, so a new visit asks
        await page.locator('a[rel="next"]').click();
        await expect(page).toHaveURL(/security/);
        await page.goBack();
        await expect(page.locator(".clay-feedback")).toHaveText("Thanks for your feedback!");
        await page.reload();
        await expect(page.locator(".clay-feedback")).toContainText("Was this page helpful?");
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

    test("links to a section of another page open it at that section", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        await page.locator(".prose a", {hasText: "Page order"}).click();
        await expect(page).toHaveURL(/\/writing-documentation#page-order$/);
        const heading = page.locator("h2#page-order");
        // At the top of the pane: the scroll to a new page's top used to undo it
        await expect.poll(() => heading.evaluate(el => el.getBoundingClientRect().top - document.querySelector("#content")!.getBoundingClientRect().top))
            .toBeGreaterThanOrEqual(0);
        await expect.poll(() => heading.evaluate(el => el.getBoundingClientRect().top - document.querySelector("#content")!.getBoundingClientRect().top))
            .toBeLessThan(40);
    });

    test("task lists show read-only checkboxes", async ({page}) => {
        await page.goto("reference/feature-tour/");
        await hydrated(page);
        const boxes = page.locator(".prose input.clay-task");
        await expect(boxes).toHaveCount(2);
        await expect(boxes.first()).toBeChecked();
        await expect(boxes.nth(1)).not.toBeChecked();
        await expect(boxes.first()).toBeDisabled();
        await expect(boxes.first()).toBeVisible();
    });

    test("links to other pages show a popup with the start of the page", async ({page}) => {
        await page.goto("reference/feature-tour/");
        await hydrated(page);
        const link = page.locator(".prose a", {hasText: "code link"});
        await link.hover();

        const popup = page.getByRole("tooltip");
        await expect(popup.locator(".clay-link-preview-title")).toHaveText("Getting Started");
        await expect(popup.locator(".clay-link-preview-text")).toContainText(/^Welcome to Clay!/);
        await expect(link).toHaveAttribute("aria-describedby", "clay-link-preview");
        // It stays while the pointer reads it, and goes with Escape
        await popup.hover();
        await expect(popup).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(popup).toHaveCount(0);
        await expect(link).not.toHaveAttribute("aria-describedby");
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

    test("code blocks show their file name, which is not copied", async ({page, context, browserName}) => {
        const readable = browserName === "chromium";
        if (readable) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto("reference/feature-tour/");
        await hydrated(page);

        const block = page.locator(".prose .code-block.has-title");
        await expect(block.locator(".code-title")).toHaveText("main.go");
        await block.hover();
        await block.locator("button.copy-code").click();
        if (readable) expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('fmt.Println("hello")');
    });

    test("pages show a table of contents, prev/next links and an edit link", async ({page}) => {
        await page.goto("reference/feature-tour/");

        const toc = page.getByRole("navigation", {name: "On this page"});
        await expect(toc.getByRole("link")).toHaveText(["Links", "Images and files", "Code", "Alerts", "Tables", "Task lists"]);
        await expect(page.locator("footer a[rel=next]")).toContainText("Security");
        await expect(page.locator("footer a", {hasText: "Edit this page"}))
            .toHaveAttribute("href", "https://github.com/clay-doc/clay/edit/main/playground/docs/latest/reference/feature-tour.md");
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

    test("only the page scrolls, and only when it has to", async ({page}) => {
        // overflow: scroll draws empty scrollbars where scrollbars always show (Windows, or macOS set to always)
        await page.goto("reference/security/");
        const overflow = await page.locator("main#content").evaluate(el =>
            [getComputedStyle(el).overflowY, getComputedStyle(el).overflowX, getComputedStyle(el.parentElement!).overflow]);
        expect(overflow).toEqual(["auto", "auto", "hidden"]);
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
            .toHaveAttribute("href", "https://github.com/clay-doc/clay/edit/main/playground/docs/1.x/getting-started.md");

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

test.describe("components", () => {
    test("tabs switch, pick the same tab in every group and remember it", async ({page}) => {
        const messages = watchConsole(page);
        await page.goto("reference/components/");
        await hydrated(page);
        const [first, second] = [page.locator("[data-tabs]").nth(0), page.locator("[data-tabs]").nth(1)];
        await expect(first.getByRole("tabpanel")).toHaveText("Open the Terminal app.");
        await expect(second.getByRole("tabpanel")).toHaveText("Second group, Windows.");

        await first.getByRole("tab", {name: "Windows"}).click();
        await expect(first.getByRole("tab", {name: "Windows"})).toHaveAttribute("aria-selected", "true");
        // The line under the tabs slides to the picked one
        const line = first.locator(".clay-tab-indicator");
        const windows = await first.getByRole("tab", {name: "Windows"}).evaluate(tab => (tab as HTMLElement).offsetLeft);
        await expect.poll(() => line.evaluate(el => (el as HTMLElement).offsetLeft)).toBeGreaterThan(windows);
        await expect(first.getByRole("tabpanel")).toHaveText("Open PowerShell.");
        await expect(second.getByRole("tabpanel")).toHaveText("Second group, Windows.");

        // Arrow keys move between tabs
        await page.keyboard.press("ArrowRight");
        await expect(first.getByRole("tab", {name: "macOS"})).toBeFocused();
        await expect(second.getByRole("tabpanel")).toHaveText("Second group, macOS.");

        await page.reload();
        await hydrated(page);
        await expect(first.getByRole("tabpanel")).toHaveText("Open the Terminal app.");
        await expect(second.getByRole("tabpanel")).toHaveText("Second group, macOS.");

        // Code groups: a tab per block
        const group = page.locator(".clay-code-group");
        await group.getByRole("tab", {name: "pnpm"}).click();
        await expect(group.getByRole("tabpanel").locator("pre")).toHaveText("pnpm add clay-doc");
        expect(messages).toEqual([]);
    });

    test("steps, cards, details, badges, math and file trees render without JavaScript", async ({request}) => {
        const html = await (await request.get("reference/components/")).text();
        expect(html).toContain('class="clay-steps"');
        // Cards link like other links, with the icon of the page they point to
        expect(html).toMatch(/<a class="clay-card" href="\/clay\/configuration" data-route="\/configuration"><i class="clay-card-icon fa-solid fa-gear"/);
        expect(html).toContain('<span class="clay-card-text">Forms, scripts and styles in docs.</span>');
        expect(html).toContain('<span class="clay-details-title">Why fold this?</span></summary>');
        expect(html).toContain("badge-warning clay-badge\">Deprecated</span>");
        expect(html).toContain('class="katex-display"');
        expect(html).toContain("prices like $5 and $10 stay text");
        expect(html).toContain('<span class="file-tree-comment">the start page</span>');
        expect(html).toContain('<div class="mermaid-diagram"><svg');
        expect(html).toContain('<pre class="clay-prompt-text">Read the docs of this project and add a page about\n**deploying** to `docs/guides/`.</pre>');
    });

    test("details open, and cards lead to their page", async ({page}) => {
        await page.goto("reference/components/");
        await hydrated(page);
        const details = page.locator("details.clay-details").first();
        await expect(details.getByText("Hidden folded text.")).toBeHidden();
        await details.locator("summary").click();
        await expect(details.getByText("Hidden folded text.")).toBeVisible();

        await page.locator("a.clay-card", {hasText: "Security"}).click();
        await expect(page).toHaveURL(/\/clay\/reference\/security\/?$/);
    });

    test("diagrams are drawn, in the theme of the site", async ({page}) => {
        await page.goto("reference/components/");
        await hydrated(page);
        // Three drawn by the build, the pie chart in the browser
        await expect(page.locator(".mermaid-diagram svg")).toHaveCount(4);
        await expect(page.locator(".mermaid-diagram[data-client] svg")).toContainText("Guides");
        const diagram = page.locator(".mermaid-diagram svg").first();
        await expect(diagram).toContainText("Clay");
        // Boxes in the theme's colors, which follow a theme switch
        const fill = () => diagram.locator(".node rect").first().evaluate(rect => getComputedStyle(rect).fill);
        const light = await fill();
        await page.locator(".navbar li.tooltip button").click();
        await expect.poll(fill).not.toBe(light);
    });

    test("a search hit in a hidden tab shows that tab", async ({page}) => {
        await page.goto("reference/components/?highlight=PowerShell");
        await hydrated(page);
        await expect(page.locator("[data-tabs]").first().getByRole("tabpanel")).toHaveText("Open PowerShell.");
    });
});

test.describe("snippets, variables, head and social images", () => {
    test("snippets and variables are filled in; snippet files are no pages", async ({page, request}) => {
        await page.goto("reference/components/");
        await expect(page.locator("#snippets + .markdown-alert")).toContainText("Included from a snippet, for Clay 4.0.");
        expect((await request.get("_snippets/note/")).status()).toBe(404);
    });

    test("pages end with the footer of clay.yaml, in their language", async ({page}) => {
        await page.goto("configuration/");
        await hydrated(page);
        const footer = page.locator("footer.clay-footer");
        await expect(footer.getByRole("navigation", {name: "Docs"}).getByRole("link")).toHaveText(["Getting Started", "Components"]);
        await expect(footer.getByRole("link", {name: "GitHub"})).toHaveAttribute("target", "_blank");
        await expect(footer).toContainText("© 2026 The Clay authors");
        // "madeWithClay" is on unless false: the heart is read as "love", "Clay" leads to its repository
        await expect(footer.locator(".clay-footer-credit")).toHaveText("Made with and Clay");
        await expect(footer.getByRole("img", {name: "love"})).toBeVisible();
        await expect(footer.locator(".clay-footer-credit").getByRole("link", {name: "Clay"})).toHaveAttribute("href", "https://github.com/clay-doc/clay");
        await footer.getByRole("link", {name: "Components"}).click();
        await expect(page.locator(".prose h1")).toContainText("Components");
        await page.goto("de/");
        await hydrated(page);
        await expect(page.locator("footer.clay-footer")).toContainText("© 2026 Die Clay-Autoren");
        await expect(page.locator(".clay-footer-credit")).toHaveText("Gemacht mit und Clay");
    });

    test("pages carry the head tags of clay.yaml", async ({request}) => {
        const html = await (await request.get("reference/feature-tour/")).text();
        expect(html).toContain('<meta name="clay-playground" content="from clay.yaml">');
    });

    test("pages link to their social image", async ({request}) => {
        const html = await (await request.get("reference/feature-tour/")).text();
        expect(html).toContain('<meta property="og:image" content="https://clay-doc.github.io/clay/_clay/social/reference/feature-tour.png">');
        expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
        const image = await request.get("_clay/social/reference/feature-tour.png");
        expect(image.headers()["content-type"]).toBe("image/png");
        expect((await image.body()).subarray(1, 4).toString()).toBe("PNG");
    });
});

test.describe("for language models and agents", () => {
    test("every page is published as Markdown, with an index in llms.txt", async ({request}) => {
        const markdown = await request.get("reference/feature-tour.md");
        expect(markdown.status()).toBe(200);
        expect(markdown.headers()["content-type"]).toContain("text/markdown");
        const text = await markdown.text();
        expect(text).toMatch(/^# Feature Tour\n/);
        expect(text).toContain("(https://clay-doc.github.io/clay/configuration.md)");
        // Every page leads to the index of all others
        expect(text).toContain("All pages of these docs, as Markdown for language models: https://clay-doc.github.io/clay/llms.txt");

        const llms = await (await request.get("llms.txt")).text();
        expect(llms).toContain("- [Feature Tour](https://clay-doc.github.io/clay/reference/feature-tour.md)");
        expect(await (await request.get("llms-full.txt")).text()).toContain("Source: https://clay-doc.github.io/clay/reference/feature-tour.md");
        expect(await (await request.get("robots.txt")).text()).toContain("https://clay-doc.github.io/clay/llms.txt");

        const html = await (await request.get("reference/feature-tour/")).text();
        expect(html).toContain('<link rel="alternate" type="text/markdown" title="Markdown" href="https://clay-doc.github.io/clay/reference/feature-tour.md">');
        expect(html).toContain('<link rel="alternate" type="text/plain" title="llms.txt" href="https://clay-doc.github.io/clay/llms.txt">');
    });

    test("below the contents, a page can be copied or opened as Markdown and asked about", async ({page, context, browserName}) => {
        const readable = browserName === "chromium";
        if (readable) await context.grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.goto("reference/feature-tour/");
        await hydrated(page);
        const actions = page.locator("aside .page-actions");
        await expect(actions.getByRole("link", {name: "Open as Markdown"})).toHaveAttribute("href", "/clay/reference/feature-tour.md");
        await expect(actions.getByRole("link", {name: "Open in Claude"})).toHaveAttribute("href",
            /^https:\/\/claude\.ai\/new\?q=.*http%3A%2F%2F127\.0\.0\.1%3A4173%2Fclay%2Freference%2Ffeature-tour\.md/);
        // Hidden with "pageActions: {chatgpt: false}" in clay.yaml
        await expect(actions.getByRole("link", {name: "Open in ChatGPT"})).toHaveCount(0);

        await actions.getByRole("button", {name: "Copy as Markdown"}).click();
        await expect(actions.getByRole("button", {name: "Copied as Markdown"})).toBeVisible();
        if (readable) expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^# Feature Tour\n/);
    });
});
