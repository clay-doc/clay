import {describe, expect, it} from "vitest";
import {editLink, hasFontawesomeKit, showsPageAction, type Configuration} from "../../common/configuration";

const config = (extra: Partial<Configuration>) => ({title: "Docs", ...extra}) as Configuration;

describe("editLink", () => {
    it.each([
        ["https://github.com/o/r/edit/main/docs/", "/guides/setup.md", "https://github.com/o/r/edit/main/docs/guides/setup.md"],
        ["https://github.com/o/r/edit/main/docs", "/a.md", "https://github.com/o/r/edit/main/docs/a.md"],
        ["https://gitlab.com/o/r/-/edit/main/docs//", "a.md", "https://gitlab.com/o/r/-/edit/main/docs/a.md"],
    ])("%j + %j", (editURL, link, expected) => {
        expect(editLink(config({editURL}), link)).toBe(expected);
    });

    it("points into docs-archive/<name>/ for older versions", () => {
        expect(editLink(config({editURL: "https://github.com/o/r/edit/main/docs/"}), "/a.md", "1.x"))
            .toBe("https://github.com/o/r/edit/main/docs-archive/1.x/a.md");
        // Where the versions are is unknown when editURL does not end in docs/
        expect(editLink(config({editURL: "https://github.com/o/r/edit/main/content/"}), "/a.md", "1.x")).toBeUndefined();
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

describe("showsPageAction", () => {
    it("shows every entry of the page menu unless it is set to false", () => {
        expect(showsPageAction(undefined, "chatgpt")).toBe(true);
        expect(showsPageAction(config({pageActions: {chatgpt: false, claude: true}}), "chatgpt")).toBe(false);
        expect(showsPageAction(config({pageActions: {chatgpt: false, claude: true}}), "claude")).toBe(true);
        expect(showsPageAction(config({pageActions: {chatgpt: false}}), "copyMarkdown")).toBe(true);
    });
});
