// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {codeToHtml} from "shiki";
import {copyCodeBlock, transformerCopyButton} from "../app/assets/code-copy";

const code = "const a = 1;\nconsole.log(a);";

async function renderBlock() {
    const root = document.createElement("div");
    root.innerHTML = await codeToHtml(code, {lang: "js", theme: "dark-plus", transformers: [transformerCopyButton()]});
    return root;
}

describe("transformerCopyButton", () => {
    it("wraps the code in a block with a copy button next to the pre", async () => {
        const root = await renderBlock();
        const block = root.firstElementChild!;

        expect(block.className).toBe("code-block");
        expect([...block.children].map(e => e.tagName)).toEqual(["PRE", "BUTTON"]);

        const button = block.querySelector("button")!;
        expect(button.getAttribute("type")).toBe("button");
        expect(button.getAttribute("aria-label")).toBe("Copy code");
        expect(button.classList.contains("copy-code")).toBe(true);
    });
});

describe("copyCodeBlock", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("copies the code exactly as displayed", async () => {
        const root = await renderBlock();
        const writeText = vi.fn().mockResolvedValue(undefined);

        expect(await copyCodeBlock(root.querySelector("button")!, {writeText})).toBe(true);
        expect(writeText).toHaveBeenCalledWith(code);
    });

    it("shows a check, then resets the button", async () => {
        const root = await renderBlock();
        const button = root.querySelector("button")!;

        await copyCodeBlock(button, {writeText: vi.fn().mockResolvedValue(undefined)});
        expect(button.querySelector("i")!.className).toBe("fa-solid fa-check");
        expect(button.getAttribute("aria-label")).toBe("Copied");

        vi.advanceTimersByTime(2000);
        expect(button.querySelector("i")!.className).toBe("fa-solid fa-copy");
        expect(button.getAttribute("aria-label")).toBe("Copy code");
    });

    it("reports failure when the clipboard is unavailable", async () => {
        const root = await renderBlock();
        const button = root.querySelector("button")!;

        expect(await copyCodeBlock(button, {writeText: vi.fn().mockRejectedValue(new Error("denied"))})).toBe(false);
        expect(button.querySelector("i")!.className).toBe("fa-solid fa-xmark");
        expect(button.getAttribute("aria-label")).toBe("Copy failed");
    });

    it("ignores search highlight marks inside the code", async () => {
        const root = await renderBlock();
        const span = [...root.querySelectorAll("pre span")].find(s => s.textContent === "console")!;
        span.innerHTML = '<mark class="search-hit">console</mark>';
        const writeText = vi.fn().mockResolvedValue(undefined);

        await copyCodeBlock(root.querySelector("button")!, {writeText});
        expect(writeText).toHaveBeenCalledWith(code);
    });
});
