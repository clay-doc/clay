// @vitest-environment node
import {describe, expect, it} from "vitest";

// Server-side rendering imports Markdown.vue (and so the sanitizer) without a DOM
describe("sanitizeHtml without a DOM", () => {
    it("can be imported", async () => {
        await expect(import("../app/assets/sanitize")).resolves.toBeDefined();
    });

    it("returns nothing instead of unsanitized HTML", async () => {
        const {sanitizeHtml} = await import("../app/assets/sanitize");
        expect(sanitizeHtml("<script>alert(1)</script><p>x</p>")).toBe("");
    });
});
