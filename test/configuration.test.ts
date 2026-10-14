import {describe, expect, it} from "vitest";
import {editLink, hasFontawesomeKit, type Configuration} from "../app/assets/configuration";

const config = (extra: Partial<Configuration>) => ({title: "Docs", ...extra}) as Configuration;

describe("editLink", () => {
    it.each([
        ["https://github.com/o/r/edit/main/docs/", "/guides/setup.md", "https://github.com/o/r/edit/main/docs/guides/setup.md"],
        ["https://github.com/o/r/edit/main/docs", "/a.md", "https://github.com/o/r/edit/main/docs/a.md"],
        ["https://gitlab.com/o/r/-/edit/main/docs//", "a.md", "https://gitlab.com/o/r/-/edit/main/docs/a.md"],
    ])("%j + %j", (editURL, link, expected) => {
        expect(editLink(config({editURL}), link)).toBe(expected);
    });

    it("is unset without editURL", () => {
        expect(editLink(config({}), "/a.md")).toBeUndefined();
        expect(editLink(undefined, "/a.md")).toBeUndefined();
    });
});

describe("hasFontawesomeKit", () => {
    it.each([
        ["0a7e2ccef9", true],
        ["", false],
        [undefined, false],
        ["set-in-ci", false],
        ["  ", false],
    ])("%j => %j", (fontawesomeKit, expected) => {
        expect(hasFontawesomeKit(config({fontawesomeKit}))).toBe(expected);
    });
});
