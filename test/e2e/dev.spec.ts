import {expect, test} from "@playwright/test";
import {hydrated, watchConsole} from "./helpers";

// The dev server renders every request on the server, which a static build
// never does for doc pages; browser-only code breaks here first.
test("the dev server renders pages on the server and in the browser", async ({page, request}) => {
    for (const path of ["", "configuration", "reference/feature-tour", "guides", "1.x", "1.x/guides/legacy-setup"]) {
        const res = await request.get(path);
        expect(res.status(), path).toBe(200);
    }
    expect((await request.get("reference/feature-tour")).ok()).toBe(true);
    expect(await (await request.get("reference/feature-tour")).text()).toContain('<h1 id="feature-tour">Feature Tour</h1>');
    expect((await request.get("does-not-exist")).status()).toBe(404);
    expect((await request.get("1.x/does-not-exist")).status()).toBe(404);
    // An old address of a page (redirects in its front matter)
    expect(await (await request.get("quick-start")).text()).toContain('location.replace("/clay/getting-started/"');

    // The Markdown of pages and llms.txt, rendered on request like the pages
    const markdown = await request.get("reference/feature-tour.md");
    expect(markdown.headers()["content-type"]).toContain("text/markdown");
    expect(await markdown.text()).toMatch(/^# Feature Tour\n/);
    expect(await (await request.get("de/llms.txt")).text()).toContain("/de/getting-started.md");

    const messages = watchConsole(page);
    await page.goto("reference/feature-tour");
    await hydrated(page);
    await expect(page.locator(".prose h1")).toHaveText("Feature Tour");
    expect(messages.filter(m => !m.includes("<Suspense>"))).toEqual([]);
});
