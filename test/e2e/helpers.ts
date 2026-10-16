import {expect, type Page} from "@playwright/test";

// Collects console errors and warnings, e.g. hydration mismatches
export function watchConsole(page: Page): string[] {
    const messages: string[] = [];
    page.on("console", message => {
        // WebKit warns about the preloaded page data when hydration takes more
        // than a few seconds, as on a busy CI runner; that is no problem of the page
        if (/was preloaded using link preload but not used/.test(message.text())) return;
        // WebKit reports Nuxt's fetch of its build manifest, cancelled when the test
        // opens the next page, as an access control error; Nuxt then logs E5002
        if (/NUXT_E5002/.test(message.text())) return;
        if (message.type() === "error" || message.type() === "warning") messages.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", error => {
        if (/\/_nuxt\/builds\/meta\/.* due to access control checks/.test(error.message)) return;
        messages.push(`pageerror: ${error.message}`);
    });
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
