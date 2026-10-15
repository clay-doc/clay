import {expect, type Page} from "@playwright/test";

// Collects console errors and warnings, e.g. hydration mismatches
export function watchConsole(page: Page): string[] {
    const messages: string[] = [];
    page.on("console", message => {
        if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => messages.push(`pageerror: ${error.message}`));
    return messages;
}

// Waits until Nuxt has hydrated the page, so interactions reach Vue
export async function hydrated(page: Page) {
    await expect.poll(() => page.evaluate(() => !!(document.querySelector("#__nuxt") as { __vue_app__?: unknown })?.__vue_app__)).toBe(true);
    await page.waitForLoadState("networkidle");
}

export async function openSearch(page: Page) {
    await page.keyboard.press("Control+k");
    await expect(page.locator("dialog[open] input")).toBeFocused();
}
