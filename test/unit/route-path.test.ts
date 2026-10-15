import {describe, expect, it} from "vitest";
import {normalizePath} from "../../common/route-path";

describe("normalizePath", () => {
    it.each([
        ["/guides/setup/", "/guides/setup"],
        ["/guides/setup", "/guides/setup"],
        ["/guides//", "/guides"],
        ["/", "/"],
        ["", "/"],
    ])("%j => %j", (path, expected) => {
        expect(normalizePath(path)).toBe(expected);
    });
});
