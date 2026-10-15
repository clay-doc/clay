import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";
import {hydrated} from "./helpers";

// The WCAG 2 A and AA rules, contrast among them, on each kind of page in both themes
const pages = ["", "reference/feature-tour/", "reference/components/", "guides/advanced/", "de/guides/"];

for (const theme of ["clay-light", "clay-dark"]) {
    for (const path of pages) {
        test(`/${path} in ${theme} passes the WCAG A and AA checks`, async ({page}) => {
            await page.addInitScript(value => localStorage.setItem("clay-theme", value), theme);
            await page.goto(path);
            await hydrated(page);
            // The lines a "focus" notation dims are faint on purpose, until the block is hovered or focused
            const {violations} = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
                .exclude("pre.has-focused .line:not(.focused)").analyze();
            expect(violations.map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")})`)).toEqual([]);
        });
    }
}

test("the skip link is the first stop for the keyboard and moves it to the page", async ({page}) => {
    await page.goto("reference/feature-tour/");
    await hydrated(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", {name: "Skip to content"});
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#content")).toBeFocused();
});
