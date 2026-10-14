import {describe, expect, it} from "vitest";
import {dropFrontMatterIfExists} from "../app/assets/front-matter-extractor";

describe("dropFrontMatterIfExists", () => {
    it("removes front matter at the start", () => {
        const md = "---\ntitle: Hello\nicon: fa-solid fa-house\n---\n# Hello\n";
        expect(dropFrontMatterIfExists(md)).toBe("# Hello\n");
    });

    it("handles CRLF line endings", () => {
        const md = "---\r\ntitle: Hello\r\n---\r\n# Hello";
        expect(dropFrontMatterIfExists(md)).toBe("# Hello");
    });

    it("leaves content without front matter unchanged", () => {
        const md = "# Hello\n\nSome text.";
        expect(dropFrontMatterIfExists(md)).toBe(md);
    });

    it("does not strip a horizontal rule block later in the document", () => {
        const md = "# Hello\n\n---\nnot: front matter\n---\n";
        expect(dropFrontMatterIfExists(md)).toBe(md);
    });
});
