import {expect, test} from "@playwright/test";
import {hydrated} from "./helpers";

test("the menu drawer opens, navigates and closes", async ({page}) => {
    await page.goto("configuration/");
    await hydrated(page);
    await expect(page.locator("aside .menu").first()).toBeHidden();

    const toggle = page.getByRole("button", {name: "Open navigation"});
    await toggle.click();
    const drawer = page.locator("#mobile-nav");
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", {name: "Feature Tour"}).click();
    await expect(page.locator(".prose h1")).toHaveText("Feature Tour");
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // The version and language switchers and the links move from the navbar into the drawer
    await toggle.click();
    await expect(drawer.getByRole("link", {name: "Github"})).toHaveAttribute("href", "https://github.com/clay-doc/clay");
    await drawer.getByRole("navigation", {name: "Language"}).getByRole("link", {name: "Deutsch"}).click();
    await expect(page).toHaveURL(/\/clay\/de\/reference\/feature-tour$/);
    await expect(drawer).toBeHidden();

});

test("pages fit the screen without sideways scrolling", async ({page}) => {
    await page.goto("reference/feature-tour/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
