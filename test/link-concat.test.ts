import {describe, expect, it} from "vitest";
import linkConcat from "../app/assets/link-concat";

describe("linkConcat", () => {
    it.each([
        ["/a", "/b", "/a/b"],
        ["a", "b", "/a/b"],
        ["a/", "b", "/a/b"],
        ["a", "/b", "/a/b"],
        ["a", "", "/a"],
        ["", "b", "/b"],
        ["/", "b", "/b"],
        ["/", "/b", "/b"],
        ["a", "/", "/a"],
        ["a/", "/", "/a"],
        ["", "", "/"],
        ["/", "/", "/"],
    ])("%j + %j => %j", (a, b, expected) => {
        expect(linkConcat(a, b)).toBe(expected);
    });

    it("joins a base URL with a docs path without doubling slashes", () => {
        expect(linkConcat("/clay-example-repo/", "/docs/guides/intro.md"))
            .toBe("/clay-example-repo/docs/guides/intro.md");
    });
});
